from __future__ import annotations

import sqlite3

from . import rate_limit
from .models import AdminUserView, PublicUser


def public_user(row: sqlite3.Row) -> PublicUser:
    return PublicUser(
        id=int(row["id"]),
        email=row["email"],
        name=row["name"],
        school=row["school"],
        status=row["status"],
        is_admin=bool(row["is_admin"]),
    )


def admin_user_view(row: sqlite3.Row) -> AdminUserView:
    return AdminUserView(
        id=int(row["id"]),
        email=row["email"],
        name=row["name"],
        school=row["school"],
        status=row["status"],
        is_admin=bool(row["is_admin"]),
        rate_limit_per_hour=row["rate_limit_per_hour"],
        effective_rate_limit=rate_limit.effective_limit(row),
        block_message=row["block_message"],
        demo_expires_at=row["demo_expires_at"],
        created_at=row["created_at"],
        last_seen_at=row["last_seen_at"],
        usage_last_hour=rate_limit.usage_last_hour(int(row["id"])),
    )
