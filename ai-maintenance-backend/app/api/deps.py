"""Shared API helpers: response envelope, JWT auth, basic rate limiting."""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import models
from app.database.database import get_db
from app.services.auth_service import decode_token

bearer_scheme = HTTPBearer(auto_error=False)


def ok(data: Any) -> Dict[str, Any]:
    return {"success": True, "data": data, "error": None}


def err(code: str, message: str, http_status: int = 400) -> HTTPException:
    return HTTPException(
        status_code=http_status,
        detail={"success": False, "data": None, "error": {"code": code, "message": message}},
    )


def get_current_worker_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[str]:
    """Return the anonymous worker_id from an optional bearer token.

    For local/dev usage the header may be omitted; routes still require
    explicit worker_id/job_id parameters so nothing is exposed to the frontend.
    """
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise err("UNAUTHORIZED", "Invalid or expired token.", 401)
    return payload.get("worker_id")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """Require a valid bearer token and return the matching User row."""
    if credentials is None:
        raise err("UNAUTHORIZED", "Missing bearer token.", 401)
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise err("UNAUTHORIZED", "Invalid or expired token.", 401)
    user = db.get(models.User, int(payload["sub"]))
    if user is None:
        raise err("UNAUTHORIZED", "User no longer exists.", 401)
    return user


# --- Basic in-memory rate limiting structure (per-IP sliding window) ---
_requests: Dict[str, list] = {}
RATE_LIMIT = 120  # requests per window
RATE_WINDOW_SECONDS = 60


def rate_limit(request: Request) -> None:
    """Dependency: lightweight per-IP rate limiter (replace with Redis in prod)."""
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window = _requests.setdefault(client, [])
    window[:] = [t for t in window if now - t < RATE_WINDOW_SECONDS]
    if len(window) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests")
    window.append(now)
