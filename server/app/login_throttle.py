from __future__ import annotations

from datetime import datetime, timedelta, timezone

from . import db

_WINDOW = timedelta(seconds=900)
_MAX_FAILS = 8
# Eski sürüm sayaçları process-içi bir dict'te tutuyordu; uvicorn --workers N altında her
# worker'ın kendi sayacı vardı ve istekler worker'lara round-robin dağıldığından efektif eşik
# ~8*N'e çıkıp brute-force koruması zayıflıyordu (#16). Sayaçları SQLite'ta tutup (request_log
# ile aynı disiplin) tüm worker'lar arasında paylaşıyoruz.


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def is_locked(key: str) -> bool:
    k = key.lower()
    since = _iso(datetime.now(timezone.utc) - _WINDOW)
    row = db.query_one(
        "SELECT COUNT(*) AS c FROM login_failures WHERE throttle_key = ? AND created_at > ?",
        (k, since),
    )
    return bool(row) and int(row["c"]) >= _MAX_FAILS


def record_failure(key: str) -> None:
    k = key.lower()
    now = datetime.now(timezone.utc)
    db.execute(
        "INSERT INTO login_failures (throttle_key, created_at) VALUES (?, ?)",
        (k, _iso(now)),
    )
    # Pencerenin iki katından eski kayıtları temizle (tablo sınırsız büyümesin).
    db.execute(
        "DELETE FROM login_failures WHERE created_at < ?",
        (_iso(now - _WINDOW * 2),),
    )


def clear(key: str) -> None:
    db.execute("DELETE FROM login_failures WHERE throttle_key = ?", (key.lower(),))
