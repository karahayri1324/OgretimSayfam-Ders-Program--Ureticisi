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
    teachers: list[str] = Field(default_factory=list)
    classes: list[str] = Field(default_factory=list)
    subjects: list[str] = Field(default_factory=list)
    rooms: list[str] = Field(default_factory=list)
    days: list[str] = Field(default_factory=list)
    hoursPerDay: int = 8
    constraints: list[dict[str, Any]] = Field(default_factory=list)


class HistoryEntry(BaseModel):
    role: str
    text: str


class ToolHistoryEntry(BaseModel):
    role: str = "tool"
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)
    result: Any = None
    reasoning: str = ""


class AIRequest(BaseModel):
    """Electron `client.ts` gövdesiyle birebir (INFERENCE_CONTRACT.md §1)."""

    text: str = Field(min_length=1, max_length=8000)
    context: AIContext
    history: list[HistoryEntry] = Field(default_factory=list)
    toolHistory: list[ToolHistoryEntry] = Field(default_factory=list)
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
