"""Storage service.

Abstraction for cloud object storage (AWS S3 or any S3-compatible provider,
e.g. MinIO). Large media (videos, PPE images, frames, reports) is stored
here; only storage_key + url references are persisted in PostgreSQL.
"""
from __future__ import annotations

import io
import logging
import uuid
from pathlib import Path
from typing import Any, BinaryIO, Optional

from app.config import get_settings

logger = logging.getLogger("amsq.storage")


class StorageService:
    """S3-compatible storage with a local-disk fallback for development."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.configured = bool(
            self.settings.s3_endpoint and self.settings.s3_access_key
        )
        self.client: Optional[Any] = None
        self.local_dir = Path("uploads")
        self.local_dir.mkdir(parents=True, exist_ok=True)
        if self.configured:
            self._init_s3()

    def _init_s3(self) -> None:
        try:
            import boto3  # optional dependency

            self.client = boto3.client(
                "s3",
                endpoint_url=self.settings.s3_endpoint,
                aws_access_key_id=self.settings.s3_access_key,
                aws_secret_access_key=self.settings.s3_secret_key,
                region_name=self.settings.s3_region,
            )
            self.client.head_bucket(Bucket=self.settings.s3_bucket)
            logger.info("Storage: connected to S3-compatible endpoint")
        except Exception as exc:  # pragma: no cover
            logger.error("Storage: S3 init failed (%s) — falling back to local disk", exc)
            self.client = None
            self.configured = False

    def upload(self, data: bytes, *, kind: str, content_type: str, job_id: Optional[int] = None) -> dict:
        """Upload bytes and return {storage_key, url}. kind: image|video|report."""
        key = f"jobs/{job_id or 'unassigned'}/{kind}/{uuid.uuid4().hex}"
        if self.client is not None:
            self.client.put_object(
                Bucket=self.settings.s3_bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
            url = f"{self.settings.s3_endpoint}/{self.settings.s3_bucket}/{key}"
            return {"storage_key": key, "url": url}
        # Local fallback (dev only)
        filename = key.replace("/", "_")
        (self.local_dir / filename).write_bytes(data)
        return {"storage_key": key, "url": f"/uploads/{filename}"}

    def upload_fileobj(self, fileobj: BinaryIO, **kwargs) -> dict:
        return self.upload(fileobj.read(), **kwargs)


# Module-level singleton.
storage = StorageService()
