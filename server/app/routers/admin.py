from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import db, rate_limit, repo
from ..config import DEFAULT_BLOCK_MESSAGE, settings
from ..deps import require_admin
from ..models import (
    AdminSettingsPatch,
    AdminSettingsView,
    AdminUserPatch,
    AdminUserView,
)
from ..views import admin_user_view

router = APIRouter(
    prefix="/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)]
)


def _get_user_or_404(user_id: int) -> sqlite3.Row:
    user = repo.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Kullanıcı bulunamadı."},
        )
    return user


@router.get("/users", response_model=list[AdminUserView])
def list_users(
    query: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[AdminUserView]:
    return [admin_user_view(r) for r in repo.list_users(query, limit, offset)]


@router.get("/users/{user_id}", response_model=AdminUserView)
def get_user(user_id: int) -> AdminUserView:
    return admin_user_view(_get_user_or_404(user_id))


@router.patch("/users/{user_id}", response_model=AdminUserView)
def patch_user(user_id: int, body: AdminUserPatch) -> AdminUserView:
    target = _get_user_or_404(user_id)
    fields = body.model_dump(exclude_unset=True)
    # Son yöneticinin admin yetkisini kaldırmak tüm web-panel erişimini kilitler (#29).
    if (
        fields.get("is_admin") is False
        and bool(target["is_admin"])
        and repo.count_admins() <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "last_admin",
                "message": "Son yöneticinin admin yetkisi kaldırılamaz.",
            },
        )
    repo.update_user(user_id, fields)
    return admin_user_view(_get_user_or_404(user_id))


@router.post("/users/{user_id}/block", response_model=AdminUserView)
def block_user(user_id: int, body: dict | None = None) -> AdminUserView:
    _get_user_or_404(user_id)
    fields: dict[str, object] = {"status": "blocked"}
    if body and isinstance(body.get("message"), str):
        fields["block_message"] = body["message"]
    repo.update_user(user_id, fields)
    return admin_user_view(_get_user_or_404(user_id))


@router.post("/users/{user_id}/unblock", response_model=AdminUserView)
def unblock_user(user_id: int) -> AdminUserView:
    _get_user_or_404(user_id)
    repo.update_user(user_id, {"status": "active", "demo_expires_at": None})
    return admin_user_view(_get_user_or_404(user_id))


@router.post("/users/{user_id}/reset-usage", response_model=AdminUserView)
def reset_usage(user_id: int) -> AdminUserView:
    _get_user_or_404(user_id)
    rate_limit.reset_usage(user_id)
    return admin_user_view(_get_user_or_404(user_id))


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int) -> None:
    target = _get_user_or_404(user_id)
    # Son yöneticiyi silmek tüm web-panel erişimini kilitler (#29).
    if bool(target["is_admin"]) and repo.count_admins() <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "last_admin", "message": "Son yönetici silinemez."},
        )
    repo.delete_user(user_id)


@router.get("/settings", response_model=AdminSettingsView)
def get_settings() -> AdminSettingsView:
    return AdminSettingsView(
        default_rate_limit_per_hour=rate_limit.global_default_limit(),
        default_block_message=db.get_app_setting(
            "default_block_message", ""
        ) or DEFAULT_BLOCK_MESSAGE,
        rate_limit_message=rate_limit.limit_message(),
    )


@router.patch("/settings", response_model=AdminSettingsView)
def patch_settings(body: AdminSettingsPatch) -> AdminSettingsView:
    if body.default_rate_limit_per_hour is not None:
        db.set_app_setting(
            "default_rate_limit_per_hour", str(body.default_rate_limit_per_hour)
        )
    if body.default_block_message is not None:
        db.set_app_setting("default_block_message", body.default_block_message)
    if body.rate_limit_message is not None:
        db.set_app_setting("rate_limit_message", body.rate_limit_message)
    return get_settings()
