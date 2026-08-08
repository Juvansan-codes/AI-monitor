"""Alert engine.

Every alert is: persisted to PostgreSQL, associated with job + worker + SOP
step, timestamped, and broadcast in real time to connected worker/supervisor
WebSocket clients for the job.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.database import models, repositories
from app.ws.manager import manager

logger = logging.getLogger("amsq.alerts")


class AlertEngine:
    SEVERITIES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")

    @staticmethod
    def create(
        db: Session,
        *,
        job_id: int,
        worker_id: int,
        alert_type: str,
        severity: str,
        message: str,
        expected: Optional[str] = None,
        detected: Optional[str] = None,
        sop_step: Optional[int] = None,
    ) -> models.Alert:
        alert = repositories.add_alert(
            db,
            job_id=job_id,
            worker_id=worker_id,
            type=alert_type,
            severity=severity,
            message=message,
            expected=expected,
            detected=detected,
            sop_step=sop_step,
            resolved=False,
        )
        logger.info("Alert %s [%s] stored for job %s", alert_type, severity, job_id)
        return alert

    @staticmethod
    async def broadcast(alert: models.Alert) -> None:
        """Push an alert to every WebSocket client subscribed to its job."""
        payload: Dict = {
            "type": "SOP_ALERT"
            if alert.type in ("WRONG_SOP_STEP", "SOP_STEP_SKIPPED")
            else alert.type,
            "severity": alert.severity,
            "message": alert.message,
            "expected": alert.expected,
            "detected": alert.detected,
            "sop_step": alert.sop_step,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await manager.broadcast(str(alert.job_id), payload)
