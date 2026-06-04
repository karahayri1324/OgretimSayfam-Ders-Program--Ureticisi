from __future__ import annotations

import json
from typing import Annotated, Any

from pydantic import BaseModel, EmailStr, Field, field_validator

# Liste elemanı tek tek de sınırlanmalı: max_length yalnız ELEMAN SAYISINI sınırlar; eleman
# string'leri / iç içe dict'ler sınırsız kalırsa devasa tek istekle bellek + upstream token
# maliyeti şişirilip DoS yapılabilir (#15). Ad alanları için makul bir üst sınır.
EntityName = Annotated[str, Field(max_length=200)]


def _too_big(value: Any, limit: int) -> bool:
    try:
        return len(json.dumps(value, default=str)) > limit
    except (TypeError, ValueError):
        return True


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    name: str | None = Field(default=None, max_length=200)
    school: str | None = Field(default=None, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class PublicUser(BaseModel):
    id: int
    email: str
    name: str | None = None
    school: str | None = None
    status: str
    is_admin: bool = False


class AuthResponse(BaseModel):
    token: str
    user: PublicUser


class MeResponse(BaseModel):
    user: PublicUser


class AIContext(BaseModel):
    teachers: list[EntityName] = Field(default_factory=list, max_length=5000)
    classes: list[EntityName] = Field(default_factory=list, max_length=5000)
    subjects: list[EntityName] = Field(default_factory=list, max_length=5000)
    rooms: list[EntityName] = Field(default_factory=list, max_length=5000)
    days: list[EntityName] = Field(default_factory=list, max_length=60)
    hoursPerDay: int = Field(default=8, ge=0, le=100)
    constraints: list[dict[str, Any]] = Field(default_factory=list, max_length=5000)

    @field_validator("constraints")
    @classmethod
    def _cap_constraints(cls, v: list[dict[str, Any]]) -> list[dict[str, Any]]:
        # Eleman sayısı (max_length) yetmez; her dict sınırsız büyüyebilir → toplam boyutu sınırla.
        if _too_big(v, 200_000):
            raise ValueError("constraints çok büyük")
        return v


class HistoryEntry(BaseModel):
    role: str = Field(max_length=32)
    text: str = Field(max_length=8000)


class ToolHistoryEntry(BaseModel):
    role: str = Field(default="tool", max_length=32)
    tool: str = Field(max_length=200)
    args: dict[str, Any] = Field(default_factory=dict)
    result: Any = None
    reasoning: str = Field(default="", max_length=8000)

    @field_validator("args")
    @classmethod
    def _cap_args(cls, v: dict[str, Any]) -> dict[str, Any]:
        # args dict[str,Any] sınırsızdı (200 toolHistory girişiyle çarpılınca DoS) — boyutu sınırla.
        if _too_big(v, 20_000):
            raise ValueError("tool args çok büyük")
        return v

    @field_validator("result")
    @classmethod
    def _cap_result(cls, v: Any) -> Any:
        # result Any = None idi (tip+boyut sınırsız) — serialize boyutunu sınırla.
        if v is not None and _too_big(v, 50_000):
            raise ValueError("tool result çok büyük")
        return v


class AIRequest(BaseModel):
    """Electron `client.ts` gövdesiyle birebir (INFERENCE_CONTRACT.md §1)."""

    # Liste alanlarına üst sınır: aksi halde devasa history/toolHistory ile bellek + upstream
    # token maliyeti şişirilip DoS yapılabilir (kimliği doğrulanmış/demo kullanıcı bile).
    text: str = Field(min_length=1, max_length=8000)
    context: AIContext
    history: list[HistoryEntry] = Field(default_factory=list, max_length=200)
    toolHistory: list[ToolHistoryEntry] = Field(default_factory=list, max_length=200)
    noMoreTools: bool = False




class AdminUserView(BaseModel):
    id: int
    email: str
    name: str | None = None
    school: str | None = None
    status: str
    is_admin: bool = False
    rate_limit_per_hour: int | None = None
    effective_rate_limit: int = 0
    block_message: str | None = None
    demo_expires_at: str | None = None
    created_at: str
    last_seen_at: str | None = None
    usage_last_hour: int = 0


class AdminUserPatch(BaseModel):
    status: str | None = Field(default=None, pattern="^(active|blocked)$")
    is_admin: bool | None = None
    rate_limit_per_hour: int | None = Field(default=None, ge=0, le=1_000_000)
    block_message: str | None = None
    demo_expires_at: str | None = None


class AdminSettingsView(BaseModel):
    default_rate_limit_per_hour: int
    default_block_message: str
    rate_limit_message: str


class AdminSettingsPatch(BaseModel):
    default_rate_limit_per_hour: int | None = Field(default=None, ge=0, le=1_000_000)
    default_block_message: str | None = None
    rate_limit_message: str | None = None
