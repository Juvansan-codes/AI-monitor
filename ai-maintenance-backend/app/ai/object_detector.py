"""Maintenance object detection service.

Object classes are configurable via OBJECT_CLASSES (settings.object_classes)
rather than hard-coded throughout the application.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.ai.yolo_detector import YOLODetector
from app.config import get_settings

logger = logging.getLogger("amsq.objects")

# Maintenance tool/equipment classes (mirrors the frontend OBJECT_CLASSES).
DEFAULT_OBJECT_CLASSES: List[str] = [
    "person", "screwdriver", "wrench", "hammer", "machine", "motor",
    "pump", "panel", "component", "bolt", "screw",
]


class ObjectDetector:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.production: bool = self.settings.ai_mode == "production"
        self.yolo = YOLODetector()

    def availability(self) -> Dict[str, Any]:
        return self.yolo.health()

    def detect(self, image_bytes: bytes) -> Dict[str, Any]:
        if not self.production:
            return {
                "detections": [
                    {"class": "person", "confidence": 0.94, "bbox": [120, 80, 430, 620], "track_id": "T001"},
                    {"class": "screwdriver", "confidence": 0.88, "bbox": [240, 320, 380, 500], "track_id": "T002"},
                    {"class": "panel", "confidence": 0.83, "bbox": [60, 200, 220, 460], "track_id": "T003"},
                ],
                "source": "simulated",
                "mode": "demo",
            }

        if not self.yolo.available:
            return {"status": "MODEL_NOT_AVAILABLE", "message": "YOLO model is not configured.", "detections": []}

        boxes = self.yolo.detect(image_bytes)
        return {
            "detections": [b.as_dict() for b in boxes],
            "source": "model",
            "mode": "production",
        }
