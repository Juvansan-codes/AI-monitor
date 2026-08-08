"""Quality scoring engine.

Computes PPE, SOP, safety, route, sequence and tool compliance and rolls them
into a 0-100 overall score. Weights are configurable via settings.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from app.config import get_settings


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, round(value, 1)))


class ScoringEngine:
    def __init__(self) -> None:
        s = get_settings()
        self.weights = {
            "ppe": s.weight_ppe,
            "sop": s.weight_sop,
            "safety": s.weight_safety,
            "route": s.weight_route,
            "sequence": s.weight_sequence,
            "tool": s.weight_tool,
        }

    def compute(
        self,
        *,
        ppe_checks: Optional[List[Dict]] = None,
        sop_completed: int = 0,
        sop_total: int = 1,
        skipped_steps: int = 0,
        incorrect_steps: int = 0,
        alerts: Optional[List[Dict]] = None,
        route_deviations: int = 0,
        gps_points: int = 0,
        wrong_tools: int = 0,
    ) -> Dict[str, float]:
        """Return dict of compliance scores + overall_score (0-100)."""
        ppe_checks = ppe_checks or []
        alerts = alerts or []

        # PPE compliance: mean of per-check detected ratio
        if ppe_checks:
            ratios = []
            for check in ppe_checks:
                items = list(check.get("items", {}).values())
                if items:
                    ratios.append(sum(1 for i in items if i.get("detected")) / len(items))
            ppe = (sum(ratios) / len(ratios)) * 100 if ratios else 100.0
        else:
            ppe = 100.0

        # SOP compliance
        sop = (sop_completed / max(1, sop_total)) * 100 - skipped_steps * 12 - incorrect_steps * 8

        # Safety compliance
        safety = 100.0
        for alert in alerts:
            if alert.get("resolved"):
                continue
            severity = alert.get("severity")
            if severity == "CRITICAL":
                safety -= 25
            elif severity == "HIGH":
                safety -= 15
            elif severity == "MEDIUM":
                safety -= 8

        # Route compliance
        route = 100.0
        if gps_points > 0:
            route -= (route_deviations / gps_points) * 100 * 2

        # Sequence compliance
        sequence = 100.0 - incorrect_steps * 12 - skipped_steps * 10

        # Tool compliance
        tool = 100.0 - wrong_tools * 15

        parts = {
            "ppe_compliance": _clamp(ppe),
            "sop_compliance": _clamp(sop),
            "safety_compliance": _clamp(safety),
            "route_compliance": _clamp(route),
            "sequence_compliance": _clamp(sequence),
            "tool_compliance": _clamp(tool),
        }
        overall = sum(parts[k] * w for k, w in [
            ("ppe_compliance", self.weights["ppe"]),
            ("sop_compliance", self.weights["sop"]),
            ("safety_compliance", self.weights["safety"]),
            ("route_compliance", self.weights["route"]),
            ("sequence_compliance", self.weights["sequence"]),
            ("tool_compliance", self.weights["tool"]),
        ])
        parts["overall_score"] = _clamp(overall)
        return parts
