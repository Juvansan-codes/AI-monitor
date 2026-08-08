"""AI Maintenance Safety & Quality Monitor — FastAPI application.

Run:
    uvicorn app.main:app --reload --port 8000

Docs:
    http://localhost:8000/docs  (Swagger)
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import routes_alerts, routes_actions, routes_auth, routes_camera, routes_detection, routes_jobs, routes_ppe, routes_sop
from app.config import get_settings
from app.database.database import SessionLocal, init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
)
logger = logging.getLogger("amsq")

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "AI backend for the AI Maintenance Safety & Quality Monitor.\n\n"
        "- AI_MODE=demo returns clearly-labelled simulated detections.\n"
        "- AI_MODE=production loads real YOLO weights from models/yolo/.\n"
        "No result is ever presented as real AI when the model is unavailable."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers.
app.include_router(routes_jobs.router)
app.include_router(routes_ppe.router)
app.include_router(routes_detection.router)
app.include_router(routes_camera.router)
app.include_router(routes_actions.router)
app.include_router(routes_sop.router)
app.include_router(routes_alerts.router)
app.include_router(routes_auth.router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    if settings.seed_demo_data:
        from app.database.seed import seed_demo_data

        db = SessionLocal()
        try:
            seed_demo_data(db)
        finally:
            db.close()
    logger.info("AI mode: %s", settings.ai_mode)
    if settings.ai_mode == "production":
        logger.warning("Production AI mode requires trained weights in models/yolo/")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Return the flat {success, data, error} envelope for HTTP errors."""
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        return JSONResponse(status_code=exc.status_code, content=detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "error": {"code": "HTTP_ERROR", "message": str(detail)},
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"success": False, "data": None, "error": {"code": "INTERNAL_ERROR", "message": str(exc)}},
    )


@app.get("/")
def root():
    return {
        "service": settings.app_name,
        "version": "1.0.0",
        "ai_mode": settings.ai_mode,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health():
    return {"success": True, "data": {"status": "ok", "ai_mode": settings.ai_mode}, "error": None}
