"""Schemas for alerts."""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel

AlertType = Literal[
    "PPE_MISSING",
    "WRONG_SOP_STEP",
    "SOP_STEP_SKIPPED",
    "WRONG_TOOL",
    "SAFETY_VIOLATION",
    "LOW_AI_CONFIDENCE",
]

Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


class AlertCreate(BaseModel):
    job_id: int
    worker_id: int
    type: AlertType
    severity: Severity
    message: str
    expected: Optional[str] = None
    detected: Optional[str] = None
    sop_step: Optional[int] = None


class AlertOut(BaseModel):
    id: int
    job_id: int
    worker_id: int
    type: str
    severity: str
    message: str
    expected: Optional[str] = None
    detected: Optional[str] = None
    sop_step: Optional[int] = None
    resolved: bool
    timestamp: datetime

    model_config = {"from_attributes": True}


class WSAlertMessage(BaseModel):
    type: str = "SOP_ALERT"
    severity: str
    message: str
    expected: Optional[str] = None
    detected: Optional[str] = None
    sop_step: Optional[int] = None
    timestamp: datetime
