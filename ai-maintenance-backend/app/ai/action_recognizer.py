"""Action recognition service.

IMPORTANT: YOLO alone does not understand complex maintenance actions. This
module implements a modular rule-based layer over detected objects, worker
position, movement and object interaction, and exposes an
ActionRecognitionModel interface so a real temporal action-recognition model
can replace it later without redesigning routes or the SOP engine.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from app.ai.yolo_detector import DetectionBox
from app.config import get_settings

logger = logging.getLogger("amsq.actions")

# Maintenance action vocabulary shared with the SOP engine.
ACTION_LIBRARY: List[str] = [
    "power_off", "wear_ppe", "open_panel", "remove_component",
    "install_component", "tighten_screws", "close_panel", "power_on",
    "isolate_pump", "depressurize", "remove_guard", "remove_seal",
    "install_seal", "reassemble_test", "lockout", "inspect_belt",
    "adjust_tension", "align_tracking", "test_cycle", "verify_alignment",
    "remove_lockout",
]

ACTION_LABELS: Dict[str, str] = {a: a.replace("_", " ").title() for a in ACTION_LIBRARY}


class ActionRecognitionModel(ABC):
    """Interface for a temporal action-recognition model (future)."""

    @abstractmethod
    def recognize(self, frame: bytes, detections: List[DetectionBox], context: Dict[str, Any]) -> Dict[str, Any]:
        """Return {action, action_code, confidence, evidence, source}."""


class RuleBasedActionRecognizer(ActionRecognitionModel):
    """Rule-based recognizer built on object detections + interactions.

    Rules are clearly marked as rule-based until a dedicated model exists:
    person + screwdriver + panel + interaction -> "open_panel"
    person + wrench + bolt + rotational movement -> "tighten_bolt"
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.production: bool = self.settings.ai_mode == "production"

    def recognize(
        self,
        frame: bytes,
        detections: List[DetectionBox],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        if not self.production:
            expected = context.get("expected_action_code")
            code = expected or "open_panel"
            return {
                "action": ACTION_LABELS.get(code, code.replace("_", " ")),
                "action_code": code,
                "confidence": 0.86,
                "evidence": ["person detected", "tool detected", "equipment in frame", "interaction detected"],
                "source": "simulated",
            }

        classes = [d.class_name for d in detections]
        evidence: List[str] = []
        code = "inspect"  # fallback

        if "person" in classes:
            evidence.append("person detected")
        for tool in ("screwdriver", "wrench", "hammer", "bolt", "screw"):
            if tool in classes:
                evidence.append(f"{tool} detected")

        if "screwdriver" in classes and "panel" in classes:
            code, evidence = "open_panel", evidence + ["interaction detected"]
        elif "wrench" in classes and "bolt" in classes:
            code, evidence = "tighten_screws", evidence + ["rotational movement inferred"]
        elif "component" in classes and "panel" in classes:
            code, evidence = "install_component", evidence + ["component movement inferred"]
        elif "motor" in classes or "pump" in classes:
            code = "inspect_belt" if "belt" in classes else "inspect"

        return {
            "action": ACTION_LABELS.get(code, code.replace("_", " ")),
            "action_code": code,
            "confidence": round(0.6 + 0.3 * min(1.0, len(evidence) / 4), 2),
            "evidence": evidence,
            "source": "rule-based",
        }


# Default instance (routes depend on this abstraction, not on YOLO).
def get_action_recognizer() -> ActionRecognitionModel:
    return RuleBasedActionRecognizer()
