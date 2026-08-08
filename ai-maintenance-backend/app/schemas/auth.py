"""Schemas for authentication."""
from typing import Literal, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8, description="Minimum 8 characters")
    name: str
    role: Literal["worker", "supervisor"] = "worker"
    worker_id: Optional[str] = None  # anonymous id, e.g. W104 (no personal data)
    badge_number: Optional[str] = None  # employee badge number, e.g. B-2214
    supervisor_id: Optional[str] = None


class UserOut(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    role: str
    worker_id: Optional[str] = None  # linked anonymous worker id, if any
    badge_number: Optional[str] = None  # employee badge number, if any
    supervisor_id: Optional[str] = None  # linked supervisor id, if any


class TokenResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserOut
