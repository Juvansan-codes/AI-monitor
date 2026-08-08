"""Camera endpoints.

POST /api/ai/video/frame — individual frames from the worker device.
POST /api/ai/video/chunk  — short video chunks (architecture ready).

Continuous streaming is not required; the frontend sends frames periodically.
Media is stored via StorageService; only metadata/refs go to the database.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import ok, rate_limit
from app.services.video_service import VideoService

router = APIRouter(prefix="/api/ai/video", tags=["camera"])
video_service = VideoService()


@router.post("/frame")
async def upload_frame(
    job_id: str = Form(...),
    worker_id: str = Form(...),
    image: UploadFile = File(...),
    _=Depends(rate_limit),
):
    ref = await video_service.save_frame(image, int(job_id) if job_id.isdigit() else None)
    return ok({"job_id": job_id, "worker_id": worker_id, "stored": True, **ref})


@router.post("/chunk")
async def upload_chunk(
    job_id: str = Form(...),
    worker_id: str = Form(...),
    video: UploadFile = File(...),
    _=Depends(rate_limit),
):
    ref = await video_service.save_video_chunk(video, int(job_id) if job_id.isdigit() else None)
    return ok({"job_id": job_id, "worker_id": worker_id, "stored": True, **ref})
