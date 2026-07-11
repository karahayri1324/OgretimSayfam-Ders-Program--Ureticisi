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


def _count_since(key: str, window: timedelta) -> int:
    since = _iso(datetime.now(timezone.utc) - window)
    row = db.query_one(
        "SELECT COUNT(*) AS c FROM login_failures WHERE throttle_key = ? AND created_at > ?",
        (key.lower(), since),
    )
    return int(row["c"]) if row else 0


def _record(key: str, window: timedelta) -> None:
    now = datetime.now(timezone.utc)
    db.execute(
        "INSERT INTO login_failures (throttle_key, created_at) VALUES (?, ?)",
        (key.lower(), _iso(now)),
    )
    # Pencerenin iki katından eski kayıtları temizle (tablo sınırsız büyümesin).
    db.execute(
        "DELETE FROM login_failures WHERE created_at < ?",
        (_iso(now - window * 2),),
    )


def is_locked(key: str) -> bool:
    return _count_since(key, _WINDOW) >= _MAX_FAILS


def record_failure(key: str) -> None:
    _record(key, _WINDOW)


def clear(key: str) -> None:
    db.execute("DELETE FROM login_failures WHERE throttle_key = ?", (key.lower(),))


# --- Kayıt (register) throttle: kota baypasını engeller -----------------------------------
# /register kimlik doğrulaması olmadan sınırsız hesap açmaya izin veriyordu ve her yeni hesap
# taze bir saatlik kota alıyordu → tek kullanıcı sınırsız hesap açarak saatlik kotayı fiilen
# baypas edebiliyordu. Aynı SQLite tablosunu 'register|<ip>' namespace'iyle yeniden kullanarak
# IP başına saatlik kayıt sayısını sınırla (worker'lar arası paylaşımlı).
_REGISTER_WINDOW = timedelta(hours=1)
_REGISTER_MAX = 5


def register_blocked(ip: str) -> bool:
    return _count_since(f"register|{ip}", _REGISTER_WINDOW) >= _REGISTER_MAX


def record_register(ip: str) -> None:
    _record(f"register|{ip}", _REGISTER_WINDOW)
