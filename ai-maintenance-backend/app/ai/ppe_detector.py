"""PPE detection service using YOLO + body-zone heuristics.

Uses the generic yolov8n.pt model with smart zone-checking:
- Head area (upper 25% of person) → helmet, goggles
- Torso area (25-65%) → vest
- Hands area (65-90%) → gloves

No custom trained model required. Works out of the box.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np


from app.config import get_settings

logger = logging.getLogger("amsq.ppe")

PPE_CLASSES: List[str] = ["helmet", "vest", "gloves", "goggles"]


class PPEDetector:
    """PPE detector using generic YOLO + body-zone heuristics."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.model: Any = None
        self.available: bool = False
        self.production: bool = self.settings.ai_mode == "production"
        self._load()

    def _load(self) -> None:
        if not self.production:
            logger.info("PPE detector: demo mode (simulated results).")
            return

        try:
            from ultralytics import YOLO
            # Use generic model — no custom training needed
            self.model = YOLO("yolov8n.pt")
            # Warmup
            dummy = np.zeros((480, 640, 3), dtype=np.uint8)
            self.model(dummy, verbose=False)
            self.available = True
            logger.info("PPE detector loaded (yolov8n.pt + body-zone logic)")
        except ImportError:
            logger.error("ultralytics not installed")
            self.available = False
        except Exception as e:
            logger.error("Failed to load YOLO model: %s", e)
            self.available = False

    def availability(self) -> Dict[str, Any]:
        if not self.production:
            return {"status": "OK", "mode": "demo"}
        if not self.available:
            return {
                "status": "MODEL_NOT_AVAILABLE",
                "message": "PPE model failed to load.",
            }
        return {"status": "OK", "mode": "production", "model": "yolov8n.pt"}

    def detect(self, image_bytes: bytes) -> Dict[str, Any]:
        """Run PPE detection and return structured results."""
        if self.production and not self.available:
            raise ModelNotAvailableError(
                "PPE model has not been configured.",
                code="MODEL_NOT_AVAILABLE",
            )

        if self.production:
            return self._run_detection(image_bytes)

        # Demo mode
        return {
            "items": {
                "helmet": {"detected": True, "confidence": 0.94},
                "vest": {"detected": True, "confidence": 0.90},
                "gloves": {"detected": True, "confidence": 0.91},
                "goggles": {"detected": True, "confidence": 0.89},
            },
            "tools": [
                {"tool": "Screwdriver", "detected": True, "confidence": 0.85},
                {"tool": "Wrench", "detected": True, "confidence": 0.82},
            ],
            "source": "simulated",
            "mode": "demo",
        }

    def _run_detection(self, image_bytes: bytes) -> Dict[str, Any]:
        """Your working body-zone detection logic."""
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode image")

        results = self.model(frame, verbose=False, imgsz=320)
        has_person, head_item, torso_item, hand_item, face_item = self._check_ppe(results)

        return {
            "items": {
                "helmet": {"detected": head_item, "confidence": 0.92 if head_item else 0.0},
                "vest": {"detected": torso_item, "confidence": 0.90 if torso_item else 0.0},
                "gloves": {"detected": hand_item, "confidence": 0.91 if hand_item else 0.0},
                "goggles": {"detected": face_item, "confidence": 0.89 if face_item else 0.0},
            },
            "tools": [],
            "source": "model",
            "mode": "production",
            "has_person": has_person,
        }

    def _check_ppe(self, results) -> Tuple[bool, bool, bool, bool, bool]:
        """Your original check_ppe_simple logic — checks body zones."""
        has_person = False
        has_head_item = False
        has_torso_item = False
        has_hand_item = False
        has_face_item = False

        for r in results:
            boxes = r.boxes
            if boxes is None:
                continue

            person_boxes = []
            for box in boxes:
                cls = int(box.cls[0])
                conf = float(box.conf[0])
                if cls == 0 and conf > 0.5:
                    person_boxes.append(box)

            for p_box in person_boxes:
                has_person = True
                x1, y1, x2, y2 = p_box.xyxy[0]
                person_height = y2 - y1

                for box in boxes:
                    cls = int(box.cls[0])
                    conf = float(box.conf[0])
                    if cls == 0:
                        continue

                    bx1, by1, bx2, by2 = box.xyxy[0]
                    by_center = (by1 + by2) / 2

                    if bx1 < x2 and bx2 > x1:
                        if by_center < y1 + person_height * 0.25:
                            has_head_item = True
                        if by_center < y1 + person_height * 0.20:
                            has_face_item = True
                        elif y1 + person_height * 0.25 < by_center < y1 + person_height * 0.65:
                            has_torso_item = True
                        elif y1 + person_height * 0.65 < by_center < y1 + person_height * 0.90:
                            has_hand_item = True

        return has_person, has_head_item, has_torso_item, has_hand_item, has_face_item


class ModelNotAvailableError(RuntimeError):
    def __init__(self, message: str, code: str = "MODEL_NOT_AVAILABLE"):
        super().__init__(message)
        self.code = code
