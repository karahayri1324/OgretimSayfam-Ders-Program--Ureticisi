from __future__ import annotations

import sqlite3

import jwt
from fastapi import Depends, Header, HTTPException, status

from . import repo
from .security import decode_access_token


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "unauthorized", "message": "Oturum bulunamadı."},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return authorization[7:].strip()


def current_user(authorization: str | None = Header(default=None)) -> sqlite3.Row:
    token = _extract_bearer(authorization)
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "unauthorized", "message": "Oturum geçersiz veya süresi doldu."},
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = repo.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "unauthorized", "message": "Hesap bulunamadı."},
        )
    return user


def require_admin(user: sqlite3.Row = Depends(current_user)) -> sqlite3.Row:
    if not bool(user["is_admin"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "forbidden", "message": "Yönetici yetkisi gerekli."},
        )
    return user
