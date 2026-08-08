"""PPE detection endpoint: POST /api/ai/ppe-check"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.ppe_detector import ModelNotAvailableError, PPEDetector
from app.alerts.alert_engine import AlertEngine
from app.api.deps import ok
from app.database import models
from app.database.database import get_db
from app.schemas.detection import PPECheckResult
from app.services.video_service import VideoService

router = APIRouter(prefix="/api/ai", tags=["ppe"])

ppe_detector = PPEDetector()
video_service = VideoService()

ITEM_LABELS = {
    "helmet": "Helmet",
    "safety_shoes": "Safety Shoes",
    "gloves": "Gloves",
    "uniform": "Uniform",
    "safety_vest": "Safety Vest",
}


@router.post("/ppe-check")
async def ppe_check(
    worker_id: str = Form(...),
    job_id: str = Form(...),
    stage: str = Form("pre_departure"),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if ppe_detector.production and not ppe_detector.available:
        return {
            "success": False,
            "data": None,
            "error": {
                "code": "MODEL_NOT_AVAILABLE",
                "message": "PPE model has not been configured.",
            },
        }

    frame = await video_service.read_limited(image, "image")
    try:
        result = ppe_detector.detect(frame)
    except ModelNotAvailableError as exc:
        return {"success": False, "data": None, "error": {"code": exc.code, "message": str(exc)}}

    items = result["items"]
    missing = [ITEM_LABELS[k] for k, v in items.items() if not v["detected"]]
    overall = "FAILED" if missing else "PASSED"

    # Persist the check (metadata only; frame ref added when storage is used).
    worker = db.scalar(select(models.Worker).where(models.Worker.worker_id == worker_id))
    job = db.get(models.Job, int(job_id)) if job_id.isdigit() else None
    if worker and job:
        db.add(
            models.PPECheck(
                job_id=job.id,
                worker_id=worker.id,
                stage=stage,
                items=items,
                tools=result.get("tools", []),
                overall_status=overall,
                mode=result["mode"],
            )
        )
        db.commit()

        if overall == "FAILED":
            AlertEngine.create(
                db,
                job_id=job.id,
                worker_id=worker.id,
                alert_type="PPE_MISSING",
                severity="HIGH",
                message=f"{', '.join(missing)} not detected. Please wear the required PPE before continuing.",
                detected=", ".join(missing),
            )

    payload = PPECheckResult(
        worker_id=worker_id,
        job_id=job_id,
        mode=result["mode"],
        source=result["source"],
        items=items,
        tools=result.get("tools", []),
        overall_status=overall,
        message=f"{', '.join(missing)} not detected. Please wear the required PPE before starting maintenance." if missing else None,
        timestamp=datetime.now(timezone.utc),
    )
    return ok(payload.model_dump())
