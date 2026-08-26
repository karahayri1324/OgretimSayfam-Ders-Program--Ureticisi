from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


BASE_DIR = Path(__file__).resolve().parent.parent


def _env(key: str, default: str = "") -> str:
    v = os.environ.get(key)
    return v if v is not None and v != "" else default


def _env_int(key: str, default: int) -> int:
    try:
        return int(_env(key, str(default)))
    except (TypeError, ValueError):
        return default


def _env_float(key: str, default: float) -> float:
    # Geçersiz UPSTREAM_TEMPERATURE (ör. 'low', '0,2') import anında ValueError ile servisi
    # düşürüyordu; güvenli dönüşüm, hatada default (#6).
    try:
        return float(_env(key, str(default)))
    except (TypeError, ValueError):
        return default


def _env_list(key: str, default: list[str]) -> list[str]:
    raw = _env(key, "")
    if not raw:
        return list(default)
    return [p.strip() for p in raw.split(",") if p.strip()]


DEFAULT_BLOCK_MESSAGE = (
    "Demo limitiniz dolmuştur lütfen timetables.ogretimsayfam.com adresinden "
    "aboneliğinizi yenileyiniz."
)

DEFAULT_RATE_LIMIT_MESSAGE = (
    "Saatlik istek limitinize ulaştınız. Lütfen bir süre sonra tekrar deneyin."
)


@dataclass
class Settings:
    host: str = field(default_factory=lambda: _env("HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: _env_int("PORT", 9000))

    db_path: str = field(
        default_factory=lambda: _env("DB_PATH", str(BASE_DIR / "data" / "bridge.db"))
    )

    jwt_secret: str = field(default_factory=lambda: _env("JWT_SECRET", ""))
    jwt_alg: str = "HS256"
    access_token_ttl_days: int = field(
        default_factory=lambda: _env_int("ACCESS_TOKEN_TTL_DAYS", 30)
    )

    upstream_base_url: str = field(
        default_factory=lambda: _env("UPSTREAM_VLLM_URL", "http://127.0.0.1:8000")
    )
    upstream_model: str = field(
        default_factory=lambda: _env("UPSTREAM_MODEL", "ogretimsayfam-scheduler")
    )
    upstream_api_key: str = field(default_factory=lambda: _env("UPSTREAM_API_KEY", ""))
    upstream_timeout_sec: int = field(
        default_factory=lambda: _env_int("UPSTREAM_TIMEOUT_SEC", 120)
    )
    upstream_temperature: float = field(
        default_factory=lambda: _env_float("UPSTREAM_TEMPERATURE", 0.1)
    )
    upstream_max_tokens: int = field(
        default_factory=lambda: _env_int("UPSTREAM_MAX_TOKENS", 1536)
    )
    # Qwen3.5 chat template varsayılan olarak `<think>` bloğunu AÇIK bırakır ve model
    # düşünce metni üretir. Dataset'te think bloğu BOŞ eğitildiği için üretimde de
    # kapatılmalı: aksi halde token israfı olur ve uzun JSON'lar max_tokens'a takılıp
    # yarıda kesilir. Kapatınca çıktı doğrudan JSON ile başlar.
    upstream_enable_thinking: bool = field(
        default_factory=lambda: _env("UPSTREAM_ENABLE_THINKING", "0") == "1"
    )

    system_prompt_path: str = field(
        default_factory=lambda: _env(
            "SYSTEM_PROMPT_PATH", str(BASE_DIR / "system_prompt.txt")
        )
    )

    default_rate_limit_per_hour: int = field(
        default_factory=lambda: _env_int("DEFAULT_RATE_LIMIT_PER_HOUR", 100)
    )

    admin_email: str = field(default_factory=lambda: _env("ADMIN_EMAIL", ""))
    admin_password: str = field(default_factory=lambda: _env("ADMIN_PASSWORD", ""))

    cors_origins: list[str] = field(
        default_factory=lambda: _env_list("CORS_ORIGINS", ["*"])
    )

    @property
    def is_secret_set(self) -> bool:
        return bool(self.jwt_secret) and len(self.jwt_secret) >= 32


settings = Settings()
