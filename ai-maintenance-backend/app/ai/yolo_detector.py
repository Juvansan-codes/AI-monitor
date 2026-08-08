"""Reusable YOLO detector.

Decoupled from FastAPI routes and from the SOP logic. In AI_MODE=demo the
detector produces clearly-labelled simulated output; in production it loads
a real Ultralytics YOLO model.

The detector is never coupled to the frontend — routes convert its output.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import get_settings

logger = logging.getLogger("amsq.yolo")

# YOLO class names (COCO) used when running with the default pretrained model.
COCO_CLASSES: Dict[int, str] = {
    0: "person",
    24: "backpack",
    25: "umbrella",
    27: "tie",
    28: "suitcase",
    31: "skis",
    32: "snowboard",
    39: "bottle",
    41: "cup",
    43: "knife",
    44: "spoon",
    45: "bowl",
    46: "banana",
    47: "apple",
    49: "orange",
    50: "broccoli",
    56: "chair",
    57: "couch",
    58: "potted plant",
    62: "tv",
    63: "laptop",
    64: "mouse",
    65: "remote",
    66: "keyboard",
    67: "cell phone",
    73: "book",
    74: "clock",
    75: "vase",
    76: "scissors",
    77: "teddy bear",
    79: "hair drier",
}


class DetectionBox:
    """One detected object."""

    __slots__ = ("class_name", "confidence", "bbox", "track_id")

    def __init__(self, class_name: str, confidence: float, bbox: List[float], track_id: Optional[str] = None):
        self.class_name = class_name
        self.confidence = round(float(confidence), 4)
        self.bbox = [round(float(v), 1) for v in bbox]
        self.track_id = track_id

    def as_dict(self) -> Dict[str, Any]:
        return {
            "class": self.class_name,
            "confidence": self.confidence,
            "bbox": self.bbox,
            "track_id": self.track_id,
        }

    def __repr__(self) -> str:  # pragma: no cover
        return f"<DetectionBox {self.class_name} {self.confidence}>"


class YOLODetector:
    """Loads a YOLO model once and exposes detect().

    Model availability is reported honestly: if the configured weights file
    does not exist the detector refuses to run in production mode rather than
    returning fake results.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model: Any = None
        self.available: bool = False
        self.production: bool = self.settings.ai_mode == "production"
        self._load()

    def _load(self) -> None:
        if not self.production:
            logger.info("AI_MODE=demo — no model loaded. Simulated detections only.")
            return

        weights = Path(self.settings.yolo_model_path)
        if not weights.exists():
            # Do NOT silently fall back to fake results in production mode.
            logger.error("Configured YOLO weights not found: %s", weights)
            self.available = False
            return

        try:
            from ultralytics import YOLO  # deferred import keeps demo mode light

            self.model = YOLO(str(weights))
            self.available = True
            logger.info("Loaded YOLO model from %s", weights)
        except ImportError:  # pragma: no cover
            logger.error("ultralytics is not installed (see requirements.txt)")
            self.available = False

    def detect(self, image_bytes: bytes, conf: float = 0.35) -> List[DetectionBox]:
        """Run inference on a raw image; returns DetectionBox list."""
        if not self.production:
            raise RuntimeError("YOLODetector is not available in demo mode")

        if not self.available or self.model is None:
            return []  # caller reports MODEL_NOT_AVAILABLE honestly

        import numpy as np
        import cv2

        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")

        results = self.model.predict(img, conf=conf, verbose=False)
        boxes: List[DetectionBox] = []
        for r in results:
            for b in r.boxes:
                x1, y1, x2, y2 = [float(v) for v in b.xyxy[0]]
                confidence = float(b.conf[0])
                cls_id = int(b.cls[0])
                class_name = self.settings.object_classes[cls_id] if cls_id < len(self.settings.object_classes) else COCO_CLASSES.get(cls_id, f"class_{cls_id}")
                boxes.append(DetectionBox(class_name, confidence, [x1, y1, x2, y2]))
        return boxes

    def health(self) -> Dict[str, Any]:
        if not self.production:
            return {"mode": "demo", "model_available": False, "message": "Simulated detections are active."}
        if not self.available:
            return {
                "mode": "production",
                "model_available": False,
                "message": f"YOLO model not configured: {self.settings.yolo_model_path}",
            }
        return {"mode": "production", "model_available": True, "model_path": self.settings.yolo_model_path}
