"""Schemas for SOP management and verification."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class SOPStepCreate(BaseModel):
    step_number: int = Field(..., ge=1)
    action: str
    action_code: str
    required_tools: List[str] = []
    safety_critical: bool = False
    description: str = ""


class SOPCreate(BaseModel):
    name: str
    description: str = ""
    required_tools: List[str] = []
    required_ppe: List[str] = []
    steps: List[SOPStepCreate]


class SOPOut(BaseModel):
    id: int
    name: str
    description: str
    required_tools: List[str]
    required_ppe: List[str]
    steps: List[SOPStepCreate]

    model_config = {"from_attributes": True}


class SOPProgressUpdate(BaseModel):
    current_step_number: int
    completed_steps: List[int] = []
    skipped_steps: List[int] = []
    incorrect_steps: List[int] = []


class SOPVerdict(BaseModel):
    status: str
    expected_step: Optional[int] = None
    expected_action: Optional[str] = None
    detected_action: Optional[str] = None
    message: str
    advance: bool = False
    skipped_steps: Optional[List[int]] = None
    timestamp: datetime
