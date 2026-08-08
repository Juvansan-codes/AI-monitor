"""POST /api/ai/detect — full frame analysis pipeline."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.action_recognizer import get_action_recognizer
from app.ai.object_detector import ObjectDetector
from app.ai.tracker import ObjectTracker
from app.alerts.alert_engine import AlertEngine
from app.api.deps import ok
from app.database import models, repositories
from app.database.database import get_db
from app.schemas.detection import DetectionResult
from app.sop.sop_engine import SOPState
from app.sop.workflow import SOPVerificationEngine
from app.services.video_service import VideoService

router = APIRouter(prefix="/api/ai", tags=["detection"])

object_detector = ObjectDetector()
action_recognizer = get_action_recognizer()
video_service = VideoService()
tracker = ObjectTracker()


@router.post("/detect")
async def detect(
    job_id: str = Form(...),
    worker_id: str = Form(...),
    image: UploadFile = File(...),
    expected_action: str = Form(""),
    db: Session = Depends(get_db),
):
    if object_detector.production and not object_detector.yolo.available:
        return {
            "success": False,
            "data": None,
            "error": {"code": "MODEL_NOT_AVAILABLE", "message": "YOLO model is not configured."},
        }

    frame = await video_service.read_limited(image, "image")
    detected = object_detector.detect(frame)
    if "status" in detected and detected["status"] == "MODEL_NOT_AVAILABLE":
        return {"success": False, "data": None, "error": {"code": "MODEL_NOT_AVAILABLE", "message": detected["message"]}}

    from app.ai.yolo_detector import DetectionBox

    detections = [
        DetectionBox(
            d["class"],
            d["confidence"],
            d.get("bbox") or [0, 0, 0, 0],
            d.get("track_id"),
        )
        for d in detected["detections"]
    ]
    tracked = tracker.track(detections)
    det_list = [t.as_dict() for t in tracked]

    action = action_recognizer.recognize(frame, tracked, {"expected_action_code": expected_action})

    # SOP verification (steps come from the database).
    worker = db.scalar(select(models.Worker).where(models.Worker.worker_id == worker_id))
    job = db.get(models.Job, int(job_id)) if job_id.isdigit() else None
    sop_status = None
    alerts_to_broadcast = []

    if job and job.sop_id:
        sop = db.get(models.SOP, job.sop_id)
        session = repositories.get_session(db, job.id)
        if sop and session:
            engine = SOPVerificationEngine(sop)
            state = SOPState.from_session(session)
            verdict = engine.verify(state, action["action_code"], action["action"])
            sop_status = {
                "status": verdict["status"],
                "expected_step": verdict.get("expected_step"),
                "expected_action": verdict.get("expected_action"),
                "detected_action": verdict.get("detected_action"),
                "message": verdict.get("message"),
            }
            if verdict.get("advance"):
                if verdict.get("skipped_steps"):
                    state.skipped_steps.update(verdict["skipped_steps"])
                    state.current_step_number = max(
                        state.current_step_number + 1,
                        verdict["skipped_steps"][-1] + 1,
                    )
                else:
                    state.completed_steps.add(state.current_step_number)
                    state.current_step_number += 1
            else:
                state.incorrect_steps.add(state.current_step_number)

            session.current_step_number = state.current_step_number
            session.completed_steps = sorted(state.completed_steps)
            session.skipped_steps = sorted(state.skipped_steps)
            session.incorrect_steps = sorted(state.incorrect_steps)
            if state.current_step_number > len(sop.steps):
                session.status = "COMPLETED"
                session.ended_at = datetime.now(timezone.utc)

            alert_spec = verdict.get("alert")
            if alert_spec:
                alert = AlertEngine.create(
                    db,
                    job_id=job.id,
                    worker_id=worker.id,
                    alert_type=alert_spec["type"],
                    severity=alert_spec["severity"],
                    message=alert_spec["message"],
                    expected=alert_spec.get("expected"),
                    detected=alert_spec.get("detected"),
                    sop_step=alert_spec.get("sop_step"),
                )
                alerts_to_broadcast.append(alert)
            db.commit()

    repositories.add_ai_detection(
        db,
        job_id=job.id if job else 0,
        worker_id=worker.id if worker else 0,
        session_id=session.id if job and job.sop_id and session else None,
        detections=det_list,
        detected_action=action,
        sop_status=sop_status,
        mode=detected.get("mode", "demo"),
    )

    for alert in alerts_to_broadcast:
        await AlertEngine.broadcast(alert)

    payload = DetectionResult(
        job_id=job_id,
        worker_id=worker_id,
        timestamp=datetime.now(timezone.utc),
        mode=detected.get("mode", "demo"),
        detections=det_list,
        current_action=action,
        sop_status=sop_status,
    )
    # by_alias=True so detections serialize as {"class": ...} (matching as_dict).
    return ok(payload.model_dump(by_alias=True))
