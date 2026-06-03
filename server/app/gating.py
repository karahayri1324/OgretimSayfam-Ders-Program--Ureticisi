from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

from . import db
from .config import DEFAULT_BLOCK_MESSAGE


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        cleaned = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def resolve_block_message(user: sqlite3.Row) -> str:
    """Engellenen kullanıcıya gösterilecek mesaj.

    Öncelik: kullanıcıya özel mesaj → admin'in global varsayılanı → kod varsayılanı.
    """
    custom = user["block_message"]
    if custom and str(custom).strip():
        return str(custom).strip()
    global_default = db.get_app_setting("default_block_message", "").strip()
    if global_default:
        return global_default
    return DEFAULT_BLOCK_MESSAGE


def is_blocked(user: sqlite3.Row) -> bool:
    """Kullanıcı şu an AI'a istek atamaz mı?

    İki durumdan biri yeterli:
      - status == 'blocked'  (admin elle kapatmış)
      - demo_expires_at geçmiş bir tarih  (otomatik süre dolumu)
    """
    if str(user["status"]) == "blocked":
        return True
    raw_expiry = user["demo_expires_at"]
    if raw_expiry:
        expires = _parse_iso(raw_expiry)
        if expires is None or datetime.now(timezone.utc) >= expires:
            return True
    return False
