"""PPE detection service.

Expects a custom YOLO weights file at models/yolo/ppe_best.pt trained on:
helmet, safety_gloves, safety_shoes, safety_vest, uniform.

If the model is not configured the service returns MODEL_NOT_AVAILABLE —
it never silently returns fake successful results.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.ai.yolo_detector import YOLODetector
from app.config import get_settings

logger = logging.getLogger("amsq.ppe")

# Custom model class order (adjust to your training dataset order).
PPE_CLASSES: List[str] = ["helmet", "safety_gloves", "safety_shoes", "safety_vest", "uniform"]


class PPEDetector:
    """Runs PPE inference (or honest simulation in demo mode)."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.weights = Path(self.settings.yolo_model_path)
        self.model: Any = None
        self.available: bool = False
        self.production: bool = self.settings.ai_mode == "production"
        self._load()

    def _load(self) -> None:
        if not self.production:
            logger.info("PPE detector: demo mode (simulated results).")
            return
        if not self.weights.exists():
            logger.error("PPE model not configured: %s", self.weights)
            self.available = False
            return
        try:
            from ultralytics import YOLO

            self.model = YOLO(str(self.weights))
            self.available = True
        except ImportError:  # pragma: no cover
            logger.error("ultralytics not installed")
            self.available = False

    def availability(self) -> Dict[str, Any]:
        if not self.production:
            return {"status": "OK", "mode": "demo"}
        if not self.available:
            return {
                "status": "MODEL_NOT_AVAILABLE",
                "message": "PPE model has not been configured.",
            }
        return {"status": "OK", "mode": "production", "model": str(self.weights)}

    def detect(self, image_bytes: bytes) -> Dict[str, Any]:
        """Return {items, source, mode} or raise ModelNotAvailableError."""
        if self.production and not self.available:
            raise ModelNotAvailableError(
                "PPE model has not been configured.",
                code="MODEL_NOT_AVAILABLE",
            )

        if self.production:
            detections = YOLODetector().detect(image_bytes)  # reuse generic inference
            return self._map_model_detections(detections)

        # Demo mode: clearly-labelled simulated output (never claimed as real).
        return {
            "items": {
                "helmet": {"detected": True, "confidence": 0.94},
                "safety_shoes": {"detected": True, "confidence": 0.89},
                "gloves": {"detected": True, "confidence": 0.91},
                "uniform": {"detected": True, "confidence": 0.93},
                "safety_vest": {"detected": True, "confidence": 0.9},
            },
            "tools": [
                {"tool": "Screwdriver", "detected": True, "confidence": 0.85},
                {"tool": "Wrench", "detected": True, "confidence": 0.82},
            ],
            "source": "simulated",
            "mode": "demo",
        }

    def _map_model_detections(self, detections) -> Dict[str, Any]:
        items: Dict[str, Dict[str, Any]] = {
            "helmet": {"detected": False, "confidence": 0.0},
            "safety_shoes": {"detected": False, "confidence": 0.0},
            "gloves": {"detected": False, "confidence": 0.0},
            "uniform": {"detected": False, "confidence": 0.0},
            "safety_vest": {"detected": False, "confidence": 0.0},
        }
        for d in detections:
            key = d.class_name
            if key in items and d.confidence > items[key]["confidence"]:
                items[key] = {"detected": True, "confidence": d.confidence}
        return {"items": items, "tools": [], "source": "model", "mode": "production"}


class ModelNotAvailableError(RuntimeError):
    def __init__(self, message: str, code: str = "MODEL_NOT_AVAILABLE"):
        super().__init__(message)
        self.code = code
