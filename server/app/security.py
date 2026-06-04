from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from .config import settings

_PBKDF2_ROUNDS = 200_000
_PBKDF2_ALGO = "sha256"


def hash_password(password: str) -> str:
    if not isinstance(password, str) or len(password) < 8:
        raise ValueError("Şifre en az 8 karakter olmalı.")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac(
        _PBKDF2_ALGO, password.encode("utf-8"), salt, _PBKDF2_ROUNDS
    )
    return f"pbkdf2_{_PBKDF2_ALGO}${_PBKDF2_ROUNDS}${salt.hex()}${dk.hex()}"


# Var olmayan e-posta için bile PBKDF2 çalıştırıp zamanlama yan-kanalını kapatmak üzere
# kullanılan sabit kukla hash. verify_password ile aynı maliyeti üretir.
DUMMY_PASSWORD_HASH = hash_password("x" * 12)


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, rounds_s, salt_hex, hash_hex = stored.split("$", 3)
        if not scheme.startswith("pbkdf2_"):
            return False
        algo = scheme.split("_", 1)[1]
        rounds = int(rounds_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except (ValueError, AttributeError):
        return False
    dk = hashlib.pbkdf2_hmac(algo, password.encode("utf-8"), salt, rounds)
    return hmac.compare_digest(dk, expected)


def create_access_token(user_id: int, *, is_admin: bool = False) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "adm": bool(is_admin),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.access_token_ttl_days)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


def decode_access_token(token: str) -> dict[str, Any]:
    """Doğrulanmış payload döndürür. Geçersizse jwt.PyJWTError fırlatır."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
