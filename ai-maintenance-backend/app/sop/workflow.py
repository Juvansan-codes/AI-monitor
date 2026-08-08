"""SOPVerificationEngine.

Compares a detected action against the expected SOP step and returns
PASS / WARNING / ERROR / CRITICAL. Never advances the SOP state on an
incorrect action (the caller decides).
"""
from __future__ import annotations

from typing import Dict, List, Optional

from app.database import models
from app.sop.sop_engine import SOPState


class SOPVerificationEngine:
    def __init__(self, sop: models.SOP) -> None:
        self.steps: List[models.SOPStep] = sorted(sop.steps, key=lambda s: s.step_number)

    def expected(self, state: SOPState) -> Optional[models.SOPStep]:
        return next(
            (s for s in self.steps if s.step_number == state.current_step_number),
            None,
        )

    def verify(self, state: SOPState, detected_action_code: str, detected_label: Optional[str] = None) -> Dict:
        """Return a verdict dict:
        {status, expected_step, expected_action, detected_action, message,
         advance, skipped_steps, alert?}
        """
        exp = self.expected(state)
        if exp is None:
            return {"status": "PASS", "message": "All steps completed.", "advance": False}

        if detected_action_code == exp.action_code:
            return {
                "status": "PASS",
                "expected_step": exp.step_number,
                "expected_action": exp.action,
                "detected_action": detected_label or detected_action_code,
                "message": f"Step {exp.step_number} · {exp.action} verified.",
                "advance": True,
            }

        # Skipped-step detection: a LATER step was performed first.
        detected_step = next(
            (s for s in self.steps if s.action_code == detected_action_code),
            None,
        )
        if detected_step is not None and detected_step.step_number > exp.step_number:
            skipped = [
                s.step_number
                for s in self.steps
                if exp.step_number <= s.step_number < detected_step.step_number
            ]
            # A safety-critical step may never be skipped: escalate to ERROR
            # (CRITICAL alert) and do NOT advance.
            critical = exp.safety_critical or any(
                s.safety_critical for s in self.steps if s.step_number in skipped
            )
            message = (
                f"Step {', '.join(str(n) for n in skipped)} was skipped. "
                f"Expected {exp.action} before {detected_label or detected_step.action}."
            )
            if critical:
                return {
                    "status": "ERROR",
                    "expected_step": exp.step_number,
                    "expected_action": exp.action,
                    "detected_action": detected_label or detected_step.action,
                    "message": message,
                    "advance": False,
                    "skipped_steps": skipped,
                    "alert": {
                        "type": "SOP_STEP_SKIPPED",
                        "severity": "CRITICAL",
                        "message": message,
                        "expected": exp.action,
                        "detected": detected_label or detected_step.action,
                        "sop_step": exp.step_number,
                    },
                }
            return {
                "status": "WARNING",
                "expected_step": exp.step_number,
                "expected_action": exp.action,
                "detected_action": detected_label or detected_step.action,
                "message": message,
                "advance": True,
                "skipped_steps": skipped,
                "alert": {
                    "type": "SOP_STEP_SKIPPED",
                    "severity": "HIGH",
                    "message": message,
                    "expected": exp.action,
                    "detected": detected_label or detected_step.action,
                    "sop_step": exp.step_number,
                },
            }

        # Wrong step / wrong order: do NOT advance.
        message = (
            f"Incorrect SOP sequence. Expected {exp.action}, "
            f"detected {detected_label or detected_action_code}."
        )
        return {
            "status": "ERROR",
            "expected_step": exp.step_number,
            "expected_action": exp.action,
            "detected_action": detected_label or detected_action_code,
            "message": message,
            "advance": False,
            "alert": {
                "type": "WRONG_SOP_STEP",
                "severity": "CRITICAL" if exp.safety_critical else "HIGH",
                "message": message,
                "expected": exp.action,
                "detected": detected_label or detected_action_code,
                "sop_step": exp.step_number,
            },
        }
