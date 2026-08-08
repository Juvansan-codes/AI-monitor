"""Schemas for detection, PPE and action-recognition payloads."""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class Detection(BaseModel):
    class_name: str = Field(..., alias="class", description="Detected object class")
    confidence: float = Field(..., ge=0.0, le=1.0)
    bbox: Optional[List[float]] = None  # [x1, y1, x2, y2]
    track_id: Optional[str] = None  # anonymous tracker id, e.g. "T001"

    model_config = {"populate_by_name": True}


class PPEItem(BaseModel):
    detected: bool
    confidence: float = Field(..., ge=0.0, le=1.0)


class PPEMap(BaseModel):
    helmet: PPEItem
    safety_shoes: PPEItem
    gloves: PPEItem
    uniform: PPEItem
    safety_vest: PPEItem


class ToolCheck(BaseModel):
    tool: str
    detected: bool
    confidence: float = Field(..., ge=0.0, le=1.0)


class PPECheckResult(BaseModel):
    worker_id: str
    job_id: str
    mode: Literal["demo", "production"]
    source: Literal["simulated", "model"]
    items: PPEMap
    tools: List[ToolCheck] = []
    overall_status: Literal["PASSED", "FAILED", "NOT_AVAILABLE"]
    message: Optional[str] = None
    timestamp: datetime


class ActionResult(BaseModel):
    action: str
    action_code: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    evidence: List[str] = []
    source: Literal["simulated", "rule-based", "model"]


class SOPStatus(BaseModel):
    status: Literal["PASS", "WARNING", "ERROR", "CRITICAL"]
    expected_step: Optional[int] = None
    expected_action: Optional[str] = None
    detected_action: Optional[str] = None
    message: Optional[str] = None


class DetectionResult(BaseModel):
    job_id: str
    worker_id: str
    timestamp: datetime
    mode: Literal["demo", "production"]
    detections: List[Detection] = []
    ppe_status: Optional[PPEMap] = None
    current_action: Optional[ActionResult] = None
    sop_status: Optional[SOPStatus] = None

    model_config = {"populate_by_name": True, "serialize_by_alias": True}
