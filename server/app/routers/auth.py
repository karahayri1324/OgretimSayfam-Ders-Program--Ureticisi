from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, status

from .. import login_throttle, repo
from ..deps import current_user
from ..models import AuthResponse, LoginRequest, MeResponse, RegisterRequest
from ..security import DUMMY_PASSWORD_HASH, create_access_token, verify_password
from ..views import public_user

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "?"


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest) -> AuthResponse:
    try:
        user = repo.create_user(
            email=str(body.email),
            password=body.password,
            name=body.name,
            school=body.school,
        )
    except repo.EmailExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "email_exists", "message": "Bu e-posta zaten kayıtlı."},
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "invalid", "message": str(exc)},
        )
    assert user is not None
    token = create_access_token(int(user["id"]), is_admin=bool(user["is_admin"]))
    return AuthResponse(token=token, user=public_user(user))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, request: Request) -> AuthResponse:
    email = str(body.email)
    throttle_key = f"{_client_ip(request)}|{email.lower()}"
    if login_throttle.is_locked(throttle_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "too_many_attempts",
                "message": "Çok fazla başarısız giriş denemesi. Lütfen birkaç dakika sonra tekrar deneyin.",
            },
            headers={"Retry-After": "900"},
        )
    user = repo.get_user_by_email(email)
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": "invalid_credentials", "message": "E-posta veya şifre hatalı."},
    )
    if user is None:
        verify_password(body.password, DUMMY_PASSWORD_HASH)
        login_throttle.record_failure(throttle_key)
        raise invalid
    if not verify_password(body.password, user["password_hash"]):
        login_throttle.record_failure(throttle_key)
        raise invalid
    login_throttle.clear(throttle_key)
    repo.touch_last_seen(int(user["id"]))
    token = create_access_token(int(user["id"]), is_admin=bool(user["is_admin"]))
    return AuthResponse(token=token, user=public_user(user))


@router.get("/me", response_model=MeResponse)
def me(user: sqlite3.Row = Depends(current_user)) -> MeResponse:
    return MeResponse(user=public_user(user))
