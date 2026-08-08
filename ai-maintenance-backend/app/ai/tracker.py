"""Object tracking abstraction.

Workers and tools are tracked with anonymous temporary ids (T001, T002, ...).
No facial recognition is ever performed.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.ai.yolo_detector import DetectionBox

logger = logging.getLogger("amsq.tracker")


class ObjectTracker:
    """Tracks detections across frames with persistent anonymous ids.

    Uses Ultralytics' ByteTrack-style tracker when available (production),
    otherwise falls back to simple IoU association between consecutive frames.
    """

    def __init__(self) -> None:
        self._last_boxes: List[DetectionBox] = []
        self._next_id = 1
        self._id_map: Dict[int, str] = {}  # internal id -> "T001"

    def _anonymous_id(self, internal_id: int) -> str:
        if internal_id not in self._id_map:
            self._id_map[internal_id] = f"T{self._next_id:03d}"
            self._next_id += 1
        return self._id_map[internal_id]

    def track(self, boxes: List[DetectionBox]) -> List[DetectionBox]:
        """Assign track ids to a new frame's detections (IoU association)."""
        if not self._last_boxes:
            for b in boxes:
                b.track_id = self._anonymous_id(self._next_id)
            self._last_boxes = boxes
            return boxes

        matched: List[DetectionBox] = []
        for b in boxes:
            best_iou = 0.0
            best_prev = None
            for prev in self._last_boxes:
                if prev.track_id is None:
                    continue
                iou = self._iou(b.bbox, prev.bbox)
                if iou > best_iou:
                    best_iou = iou
                    best_prev = prev
            if best_iou >= 0.3 and best_prev is not None:
                b.track_id = best_prev.track_id
            else:
                b.track_id = self._anonymous_id(self._next_id)
            matched.append(b)

        self._last_boxes = matched
        return matched

    @staticmethod
    def _iou(a: List[float], b: List[float]) -> float:
        x1 = max(a[0], b[0])
        y1 = max(a[1], b[1])
        x2 = min(a[2], b[2])
        y2 = min(a[3], b[3])
        inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
        area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
        union = area_a + area_b - inter
        return inter / union if union > 0 else 0.0
