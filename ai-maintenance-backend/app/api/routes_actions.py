"""Action recognition endpoint: POST /api/ai/actions/recognize"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.ai.action_recognizer import get_action_recognizer
from app.ai.object_detector import ObjectDetector
from app.api.deps import ok
from app.services.video_service import VideoService

router = APIRouter(prefix="/api/ai/actions", tags=["actions"])

object_detector = ObjectDetector()
action_recognizer = get_action_recognizer()
video_service = VideoService()


@router.post("/recognize")
async def recognize_action(
    job_id: str = Form(...),
    worker_id: str = Form(...),
    expected_action: str = Form(""),
    detections: str = Form("[]"),  # optional JSON of {class, confidence, bbox}
    image: UploadFile = File(...),
):
    frame = await video_service.read_limited(image, "image")

    # Prefer client-supplied detections (the frontend already ran detection),
    # otherwise run detection server-side.
    detected = object_detector.detect(frame)
    raw = detected.get("detections", [])
    from app.ai.yolo_detector import DetectionBox

    boxes = [
        DetectionBox(d["class"], d["confidence"], d.get("bbox") or [0, 0, 0, 0])
        for d in raw
    ]

    result = action_recognizer.recognize(frame, boxes, {"expected_action_code": expected_action})
    return ok(result)
