"""Application configuration.

All secrets are read from environment variables (see .env.example).
Never hard-code database credentials, JWT secrets or cloud keys.
"""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Core ---
    app_name: str = "AI Maintenance Safety & Quality Monitor"
    debug: bool = False

    # --- Database ---
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/amsq"

    # --- Auth ---
    jwt_secret: str = "change-me-in-production-use-a-long-random-secret-32b"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24

    # --- AI mode ---
    # "demo"  -> clearly-labelled simulated detections (no model required)
    # "production" -> load the real YOLO weights
    ai_mode: str = "demo"
    yolo_model_path: str = "models/yolo/ppe_best.pt"

    # --- Demo data ---
    # Seed demo workers/jobs/SOPs/alerts on startup (idempotent).
    seed_demo_data: bool = True
    yolo_default_model: str = "yolov8n.pt"  # fallback COCO model for demo
    object_classes: List[str] = [
        "person", "screwdriver", "wrench", "hammer", "machine", "motor",
        "pump", "panel", "component", "bolt", "screw", "helmet", "gloves",
        "safety_shoes", "safety_vest", "uniform",
    ]

    # --- Route verification ---
    route_deviation_threshold_m: float = 250.0
    route_arrived_threshold_m: float = 120.0

    # --- Storage (S3-compatible object storage abstraction) ---
    s3_endpoint: str = ""  # e.g. https://s3.amazonaws.com or MinIO URL
    s3_bucket: str = "amsq-uploads"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    # --- Uploads ---
    max_upload_mb: int = 10
    allowed_image_types: List[str] = ["image/jpeg", "image/png", "image/webp"]
    allowed_video_types: List[str] = ["video/mp4", "video/webm", "video/quicktime"]

    # --- CORS ---
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # --- Scoring weights (must sum to 1.0) ---
    weight_ppe: float = 0.20
    weight_sop: float = 0.30
    weight_safety: float = 0.20
    weight_route: float = 0.10
    weight_sequence: float = 0.15
    weight_tool: float = 0.05


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    # Fix Render's postgres:// URLs to work with SQLAlchemy 2.0 and psycopg
    if settings.database_url.startswith("postgres://"):
        settings.database_url = settings.database_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif settings.database_url.startswith("postgresql://"):
        settings.database_url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return settings
