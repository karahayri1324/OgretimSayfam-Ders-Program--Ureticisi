from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from . import db
from .config import DEFAULT_RATE_LIMIT_MESSAGE, settings

_WINDOW = timedelta(hours=1)
_CLEANUP_OLDER_THAN = timedelta(hours=3)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def global_default_limit() -> int:
    raw = db.get_app_setting(
        "default_rate_limit_per_hour", str(settings.default_rate_limit_per_hour)
    )
    try:
        return int(raw)
    except (TypeError, ValueError):
        return settings.default_rate_limit_per_hour


def effective_limit(user: sqlite3.Row) -> int:
    """Kullanıcının saatlik limiti — kullanıcıya özel değer yoksa global varsayılan."""
    per_user = user["rate_limit_per_hour"]
    if per_user is None:
        return global_default_limit()
    try:
        return int(per_user)
    except (TypeError, ValueError):
        return global_default_limit()


def usage_last_hour(user_id: int) -> int:
    since = _iso(datetime.now(timezone.utc) - _WINDOW)
    row = db.query_one(
        "SELECT COUNT(*) AS c FROM request_log WHERE user_id = ? AND created_at > ?",
        (user_id, since),
    )
    return int(row["c"]) if row else 0


def check(user: sqlite3.Row) -> tuple[bool, int, int]:
    """(izin_var_mı, mevcut_kullanım, limit) döndürür. Sayaç ARTIRMAZ.

    limit == 0 → sınırsız (her zaman izin).
    """
    limit = effective_limit(user)
    if limit <= 0:
        return True, usage_last_hour(int(user["id"])), 0
    used = usage_last_hour(int(user["id"]))
    return used < limit, used, limit


def record(user_id: int) -> None:
    now = datetime.now(timezone.utc)
    db.execute(
        "INSERT INTO request_log (user_id, created_at) VALUES (?, ?)",
        (user_id, _iso(now)),
    )
    _cleanup_old(now)


def try_consume(user: sqlite3.Row) -> tuple[bool, int, int]:
    """Atomik kota kontrol+kayıt. (izin_verildi, kullanım, limit) döndürür.

    check() + record()'u AYRI çağırmak TOCTOU yaratıyordu: eşzamanlı istekler hepsi
    used<limit görüp geçiyor, sonra hepsi kaydediliyordu (kota baypası). Burada sayma ve
    (izinliyse) ekleme TEK kilitli kritik bölgede yapılır, böylece istekler serileşir.
    limit <= 0 → sınırsız.
    """
    limit = effective_limit(user)
    user_id = int(user["id"])
    now = datetime.now(timezone.utc)
    since = _iso(now - _WINDOW)
    with db._lock:  # noqa: SLF001 — kasıtlı: tek atomik kritik bölge
        conn = db.get_conn()
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM request_log WHERE user_id = ? AND created_at > ?",
            (user_id, since),
        ).fetchone()
        used = int(row["c"]) if row else 0
        if limit > 0 and used >= limit:
            return False, used, limit
        conn.execute(
            "INSERT INTO request_log (user_id, created_at) VALUES (?, ?)",
            (user_id, _iso(now)),
        )
        conn.execute(
            "DELETE FROM request_log WHERE created_at < ?",
            (_iso(now - _CLEANUP_OLDER_THAN),),
        )
        conn.commit()
        return True, used + 1, limit


def reset_usage(user_id: int) -> None:
    db.execute("DELETE FROM request_log WHERE user_id = ?", (user_id,))


def _cleanup_old(now: datetime) -> None:
    cutoff = _iso(now - _CLEANUP_OLDER_THAN)
    db.execute("DELETE FROM request_log WHERE created_at < ?", (cutoff,))


def limit_message() -> str:
    custom = db.get_app_setting("rate_limit_message", "").strip()
    return custom if custom else DEFAULT_RATE_LIMIT_MESSAGE
