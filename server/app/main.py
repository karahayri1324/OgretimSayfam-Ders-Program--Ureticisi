from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, db, repo
from .config import settings
from .routers import admin, ai, auth, health

log = logging.getLogger("bridge")

STATIC_DIR = Path(__file__).resolve().parent / "static"


def _ensure_jwt_secret() -> None:
    """JWT_SECRET env yoksa DB'de kalıcı bir secret üret (restart'ta token'lar yaşasın).

    Üretimde JWT_SECRET'i açıkça vermek önerilir; bu yalnızca güvenli bir fallback.
    """
    if settings.is_secret_set:
        return
    if settings.jwt_secret:
        log.warning(
            "JWT_SECRET çok kısa (<32 karakter) — yok sayılıyor; lütfen daha güçlü "
            "bir değer verin. Şimdilik DB'deki otomatik secret kullanılacak."
        )
    stored = db.get_app_setting("jwt_secret", "")
    if not stored:
        # Atomik: yalnızca yoksa yaz, sonra kalıcı değeri tekrar oku. Çok-worker'da
        # her worker'ın farklı secret üretip token'ları geçersiz kılmasını (TOCTOU) önler.
        db.insert_app_setting_if_absent("jwt_secret", secrets.token_hex(32))
        stored = db.get_app_setting("jwt_secret", "")
        log.warning(
            "JWT_SECRET ayarlı değil — DB'de otomatik secret üretildi. "
            "Üretim için ortam değişkeni olarak açıkça verin."
        )
    settings.jwt_secret = stored


def _bootstrap_admin() -> None:
    if not (settings.admin_email and settings.admin_password):
        return
    if len(settings.admin_password) < 8:
        log.error(
            "ADMIN_PASSWORD en az 8 karakter olmalı — admin bootstrap atlandı. "
            "Servis çalışmaya devam ediyor; lütfen .env'deki ADMIN_PASSWORD'ü düzeltin."
        )
        return
    existing = repo.get_user_by_email(settings.admin_email)
    if existing is None:
        repo.create_user(
            email=settings.admin_email,
            password=settings.admin_password,
            name="Yönetici",
            school=None,
            is_admin=True,
        )
        log.info("Bootstrap admin oluşturuldu: %s", settings.admin_email)
    elif not bool(existing["is_admin"]):
        repo.update_user(int(existing["id"]), {"is_admin": True})
        log.info("Mevcut kullanıcı admin yapıldı: %s", settings.admin_email)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    _ensure_jwt_secret()
    _bootstrap_admin()
    log.info("api4 köprü servisi hazır (v%s)", __version__)
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="ÖğretimSayfam api4 köprü",
        version=__version__,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def http_exc_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict):
            content = detail
        else:
            content = {"error": "error", "message": str(detail)}
        return JSONResponse(
            status_code=exc.status_code, content=content, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exc_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        msg = first.get("msg", "Geçersiz istek.")
        return JSONResponse(
            status_code=422,
            content={
                "error": "validation",
                "message": f"{loc}: {msg}" if loc else msg,
            },
        )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(ai.router)
    app.include_router(admin.router)

    if STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

        @app.get("/admin", include_in_schema=False)
        async def admin_panel() -> FileResponse:
            return FileResponse(str(STATIC_DIR / "admin.html"))

    return app


app = create_app()
