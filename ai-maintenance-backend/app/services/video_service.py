"""Video & frame handling.

The frontend sends periodic frames (POST /api/ai/video/frame); short video
chunks are supported via POST /api/ai/video/chunk. Continuous streaming is
not required for v1.
"""
from __future__ import annotations

import io
import logging
import uuid
from typing import Optional

from fastapi import HTTPException, UploadFile

from app.config import get_settings
from app.services.storage_service import storage

logger = logging.getLogger("amsq.video")


class VideoService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def read_limited(self, upload: UploadFile, kind: str) -> bytes:
        """Read an upload with size + type validation."""
        if upload.content_type not in self.settings.allowed_image_types and kind == "image":
            raise HTTPException(400, f"Unsupported image type: {upload.content_type}")
        if upload.content_type not in self.settings.allowed_video_types and kind == "video":
            raise HTTPException(400, f"Unsupported video type: {upload.content_type}")

        limit = self.settings.max_upload_mb * 1024 * 1024
        data = await upload.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, f"Upload exceeds {self.settings.max_upload_mb} MB limit")
        return data

    async def save_frame(self, upload: UploadFile, job_id: Optional[int]) -> dict:
        data = await self.read_limited(upload, "image")
        ref = storage.upload(data, kind="frame", content_type=upload.content_type or "image/jpeg", job_id=job_id)
        return ref

    async def save_video_chunk(self, upload: UploadFile, job_id: Optional[int]) -> dict:
        data = await self.read_limited(upload, "video")
        ref = storage.upload(data, kind="video", content_type=upload.content_type or "video/mp4", job_id=job_id)
        return ref
