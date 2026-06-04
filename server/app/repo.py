from __future__ import annotations

import sqlite3

from . import db
from .security import hash_password


class EmailExistsError(Exception):
    pass


def create_user(
    email: str,
    password: str,
    name: str | None,
    school: str | None,
    *,
    is_admin: bool = False,
    status: str = "active",
) -> sqlite3.Row:
    now = db.utcnow_iso()
    pw_hash = hash_password(password)
    try:
        cur = db.execute(
            """INSERT INTO users
               (email, name, school, password_hash, status, is_admin,
                created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (email, name, school, pw_hash, status, 1 if is_admin else 0, now, now),
        )
    except sqlite3.IntegrityError as exc:
        raise EmailExistsError(email) from exc
    return get_user_by_id(int(cur.lastrowid))


def get_user_by_id(user_id: int) -> sqlite3.Row | None:
    return db.query_one("SELECT * FROM users WHERE id = ?", (user_id,))


def get_user_by_email(email: str) -> sqlite3.Row | None:
    return db.query_one(
        "SELECT * FROM users WHERE email = ? COLLATE NOCASE", (email,)
    )


def count_admins() -> int:
    row = db.query_one("SELECT COUNT(*) AS c FROM users WHERE is_admin = 1", ())
    return int(row["c"]) if row else 0


def touch_last_seen(user_id: int) -> None:
    db.execute(
        "UPDATE users SET last_seen_at = ? WHERE id = ?", (db.utcnow_iso(), user_id)
    )


def update_user(user_id: int, fields: dict[str, object]) -> sqlite3.Row | None:
    allowed = {
        "status",
        "is_admin",
        "rate_limit_per_hour",
        "block_message",
        "demo_expires_at",
        "name",
        "school",
    }
    sets: list[str] = []
    params: list[object] = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        if key == "is_admin":
            value = 1 if value else 0
        sets.append(f"{key} = ?")
        params.append(value)
    if not sets:
        return get_user_by_id(user_id)
    sets.append("updated_at = ?")
    params.append(db.utcnow_iso())
    params.append(user_id)
    db.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", params)
    return get_user_by_id(user_id)


def list_users(
    query: str | None = None, limit: int = 100, offset: int = 0
) -> list[sqlite3.Row]:
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)
    if query:
        like = f"%{query}%"
        return db.query_all(
            """SELECT * FROM users
               WHERE email LIKE ? OR name LIKE ? OR school LIKE ?
               ORDER BY created_at DESC LIMIT ? OFFSET ?""",
            (like, like, like, limit, offset),
        )
    return db.query_all(
        "SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )


def count_users() -> int:
    row = db.query_one("SELECT COUNT(*) AS c FROM users")
    return int(row["c"]) if row else 0


def delete_user(user_id: int) -> None:
    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
