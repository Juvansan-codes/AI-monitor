"""Authentication endpoints.

POST /api/auth/login     -> JWT + user info (email + password)
POST /api/auth/register  -> create a user + linked worker/supervisor
GET  /api/auth/me        -> current user (bearer token)
"""
from __future__ import annotations

from typing import Dict, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import err, get_current_user, ok
from app.config import get_settings
from app.database import models
from app.database.database import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.services.auth_service import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

settings = get_settings()


def _linked_identity(db: Session, user: models.User) -> Dict[str, Optional[str]]:
    """Resolve the anonymous worker/supervisor id linked to a user account."""
    worker = db.scalar(select(models.Worker).where(models.Worker.user_id == user.id))
    if worker is not None:
        return {
            "worker_id": worker.worker_id,
            "badge_number": worker.badge_number,
            "supervisor_id": None,
        }
    supervisor = db.scalar(
        select(models.Supervisor).where(models.Supervisor.user_id == user.id)
    )
    if supervisor is not None:
        return {"worker_id": None, "badge_number": None, "supervisor_id": supervisor.supervisor_id}
    return {"worker_id": None, "badge_number": None, "supervisor_id": None}


def _token_response(user: models.User, db: Session) -> dict:
    linked = _linked_identity(db, user)
    token = create_access_token(
        sub=str(user.id),
        role=user.role,
        worker_id=linked["worker_id"],
        supervisor_id=linked["supervisor_id"],
    )
    return TokenResponse(
        token=token,
        expires_in=settings.jwt_expires_minutes * 60,
        user=UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            **linked,
        ),
    ).model_dump()


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.scalar(select(models.User).where(models.User.email == email))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise err("INVALID_CREDENTIALS", "Email or password is incorrect.", 401)
    return ok(_token_response(user, db))


@router.post("/register")
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if db.scalar(select(models.User).where(models.User.email == email)):
        raise err("EMAIL_TAKEN", "An account with this email already exists.", 409)

    user = models.User(
        email=email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        name=payload.name,
    )
    db.add(user)
    db.flush()

    if payload.role == "worker":
        db.add(
            models.Worker(
                worker_id=payload.worker_id or f"W{user.id:03d}",
                badge_number=payload.badge_number,
                user_id=user.id,
                name=payload.name,
            )
        )
    else:
        db.add(
            models.Supervisor(
                supervisor_id=payload.supervisor_id or f"S{user.id:03d}",
                user_id=user.id,
                name=payload.name,
            )
        )
    db.commit()
    db.refresh(user)
    return ok(_token_response(user, db))


@router.get("/me")
def me(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    linked = _linked_identity(db, user)
    return ok(
        UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            **linked,
        ).model_dump()
    )
