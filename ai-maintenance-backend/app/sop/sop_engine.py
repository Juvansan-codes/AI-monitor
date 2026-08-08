"""Generic SOP state machine.

SOP steps come from PostgreSQL — nothing here is hard-coded.
State tracked: current_step, completed_steps, pending_steps, skipped_steps,
incorrect_steps.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Set

from app.database import models


class SOPState:
    def __init__(
        self,
        current_step_number: int = 1,
        completed_steps: Optional[List[int]] = None,
        skipped_steps: Optional[List[int]] = None,
        incorrect_steps: Optional[List[int]] = None,
    ) -> None:
        self.current_step_number = current_step_number
        self.completed_steps: Set[int] = set(completed_steps or [])
        self.skipped_steps: Set[int] = set(skipped_steps or [])
        self.incorrect_steps: Set[int] = set(incorrect_steps or [])

    @classmethod
    def from_session(cls, session: models.MaintenanceSession) -> "SOPState":
        return cls(
            current_step_number=session.current_step_number,
            completed_steps=session.completed_steps,
            skipped_steps=session.skipped_steps,
            incorrect_steps=session.incorrect_steps,
        )

    def pending_steps(self, total_steps: int) -> List[int]:
        return [
            n
            for n in range(1, total_steps + 1)
            if n not in self.completed_steps and n not in self.skipped_steps
        ]

    def to_session_payload(self) -> Dict:
        return {
            "current_step_number": self.current_step_number,
            "completed_steps": sorted(self.completed_steps),
            "skipped_steps": sorted(self.skipped_steps),
            "incorrect_steps": sorted(self.incorrect_steps),
        }


class SOPEngine:
    """Wraps a SOP's ordered steps and advances/records against them."""

    def __init__(self, sop: models.SOP) -> None:
        self.sop = sop
        self.steps: List[models.SOPStep] = sorted(sop.steps, key=lambda s: s.step_number)
        self.total_steps = len(self.steps)

    def expected_step(self, state: SOPState) -> Optional[models.SOPStep]:
        return next(
            (s for s in self.steps if s.step_number == state.current_step_number),
            None,
        )

    def all_done(self, state: SOPState) -> bool:
        return state.current_step_number > self.total_steps or (
            len(state.completed_steps) + len(state.skipped_steps) >= self.total_steps
            and self.total_steps > 0
        )
