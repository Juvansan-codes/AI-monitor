"""Schemas for jobs, GPS locations and scores."""
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class LocationCreate(BaseModel):
    worker_id: str
    job_id: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    timestamp: Optional[datetime] = None


class LocationOut(BaseModel):
    id: int
    job_id: int
    worker_id: int
    latitude: float
    longitude: float
    timestamp: datetime
    source: str

    model_config = {"from_attributes": True}


class RouteStatus(BaseModel):
    status: Literal["ON_ROUTE", "DEVIATED", "ARRIVED"]
    distance_to_route_m: float
    distance_to_destination_m: float
    remaining_meters: float
    eta_minutes: int
    progress_pct: int


class JobCreate(BaseModel):
    job_number: str
    title: str
    customer: str = ""
    destination_address: str = ""
    company_lat: float
    company_lng: float
    destination_lat: float
    destination_lng: float
    planned_route: List[List[float]] = []
    worker_id: str
    sop_id: Optional[int] = None


class JobOut(BaseModel):
    id: int
    job_number: str
    title: str
    customer: str
    status: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None

    model_config = {"from_attributes": True}


class JobStateUpdate(BaseModel):
    to: Literal[
        "ASSIGNED", "PPE_CHECK", "TRAVELING", "DEVIATED",
        "ARRIVED", "WORKSITE_CHECK", "WORKING", "WARNING", "COMPLETED",
    ]


class ScoreOut(BaseModel):
    job_id: int
    ppe_compliance: float
    sop_compliance: float
    safety_compliance: float
    route_compliance: float
    sequence_compliance: float
    tool_compliance: float
    overall_score: float
    calculated_at: datetime

    model_config = {"from_attributes": True}
