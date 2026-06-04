from __future__ import annotations

from typing import Any

from pydantic import BaseModel, EmailStr, Field


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
    teachers: list[str] = Field(default_factory=list, max_length=5000)
    classes: list[str] = Field(default_factory=list, max_length=5000)
    subjects: list[str] = Field(default_factory=list, max_length=5000)
    rooms: list[str] = Field(default_factory=list, max_length=5000)
    days: list[str] = Field(default_factory=list, max_length=60)
    hoursPerDay: int = Field(default=8, ge=0, le=100)
    constraints: list[dict[str, Any]] = Field(default_factory=list, max_length=5000)


class HistoryEntry(BaseModel):
    role: str = Field(max_length=32)
    text: str = Field(max_length=8000)


class ToolHistoryEntry(BaseModel):
    role: str = Field(default="tool", max_length=32)
    tool: str = Field(max_length=200)
    args: dict[str, Any] = Field(default_factory=dict)
    result: Any = None
    reasoning: str = Field(default="", max_length=8000)


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
