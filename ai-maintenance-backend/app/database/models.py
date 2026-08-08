"""SQLAlchemy ORM models.

Storage note: large media (videos, frames, images) is never stored here.
Only metadata + storage_key/URL references are persisted.
"""
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32))  # "worker" | "supervisor"
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Worker(Base):
    __tablename__ = "workers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    worker_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)  # anonymous id e.g. W102
    badge_number: Mapped[str | None] = mapped_column(String(32), nullable=True)  # employee badge, e.g. B-2214
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    jobs: Mapped[list["Job"]] = relationship(back_populates="worker")


class Supervisor(Base):
    __tablename__ = "supervisors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    supervisor_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255))


class SOP(Base):
    __tablename__ = "sops"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    required_tools: Mapped[list] = mapped_column(JSON, default=list)
    required_ppe: Mapped[list] = mapped_column(JSON, default=list)

    steps: Mapped[list["SOPStep"]] = relationship(
        back_populates="sop", cascade="all, delete-orphan", order_by="SOPStep.step_number"
    )


class SOPStep(Base):
    __tablename__ = "sop_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sop_id: Mapped[int] = mapped_column(ForeignKey("sops.id"), index=True)
    step_number: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(255))  # "Power OFF"
    action_code: Mapped[str] = mapped_column(String(64), index=True)  # "power_off"
    required_tools: Mapped[list] = mapped_column(JSON, default=list)
    safety_critical: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str] = mapped_column(Text, default="")

    sop: Mapped["SOP"] = relationship(back_populates="steps")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_number: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    customer: Mapped[str] = mapped_column(String(255), default="")
    destination_address: Mapped[str] = mapped_column(String(255), default="")
    company_lat: Mapped[float] = mapped_column(Float)
    company_lng: Mapped[float] = mapped_column(Float)
    destination_lat: Mapped[float] = mapped_column(Float)
    destination_lng: Mapped[float] = mapped_column(Float)
    planned_route: Mapped[list] = mapped_column(JSON, default=list)  # [[lat, lng], ...]

    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    sop_id: Mapped[int | None] = mapped_column(ForeignKey("sops.id"), nullable=True)

    # Job state machine: ASSIGNED -> PPE_CHECK -> TRAVELING -> ARRIVED ->
    # WORKSITE_CHECK -> WORKING -> COMPLETED (DEVIATED/WARNING are transient)
    status: Mapped[str] = mapped_column(String(32), default="ASSIGNED", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_gps_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    worker: Mapped["Worker"] = relationship(back_populates="jobs")
    sop: Mapped["SOP | None"] = relationship()
    locations: Mapped[list["Location"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    source: Mapped[str] = mapped_column(String(32), default="gps")  # gps | demo | offline-cache

    job: Mapped["Job"] = relationship(back_populates="locations")


class PPECheck(Base):
    __tablename__ = "ppe_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    stage: Mapped[str] = mapped_column(String(32))  # pre_departure | worksite
    items: Mapped[dict] = mapped_column(JSON)  # {helmet: {detected, confidence}, ...}
    tools: Mapped[list] = mapped_column(JSON, default=list)
    overall_status: Mapped[str] = mapped_column(String(32))  # PASSED | FAILED | NOT_AVAILABLE
    mode: Mapped[str] = mapped_column(String(32), default="demo")
    image_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MaintenanceSession(Base):
    __tablename__ = "maintenance_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    sop_id: Mapped[int] = mapped_column(ForeignKey("sops.id"))
    status: Mapped[str] = mapped_column(String(32), default="NOT_STARTED")  # IN_PROGRESS | COMPLETED | ...
    current_step_number: Mapped[int] = mapped_column(Integer, default=1)
    completed_steps: Mapped[list] = mapped_column(JSON, default=list)
    skipped_steps: Mapped[list] = mapped_column(JSON, default=list)
    incorrect_steps: Mapped[list] = mapped_column(JSON, default=list)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AIDetection(Base):
    __tablename__ = "ai_detections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("maintenance_sessions.id"), nullable=True)
    detections: Mapped[list] = mapped_column(JSON, default=list)
    ppe_status: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    detected_action: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sop_status: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    mode: Mapped[str] = mapped_column(String(32), default="demo")
    frame_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    type: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(16))  # LOW | MEDIUM | HIGH | CRITICAL
    message: Mapped[str] = mapped_column(Text)
    expected: Mapped[str | None] = mapped_column(String(255), nullable=True)
    detected: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sop_step: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class JobScore(Base):
    __tablename__ = "job_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    ppe_compliance: Mapped[float] = mapped_column(Float, default=0)
    sop_compliance: Mapped[float] = mapped_column(Float, default=0)
    safety_compliance: Mapped[float] = mapped_column(Float, default=0)
    route_compliance: Mapped[float] = mapped_column(Float, default=0)
    sequence_compliance: Mapped[float] = mapped_column(Float, default=0)
    tool_compliance: Mapped[float] = mapped_column(Float, default=0)
    overall_score: Mapped[float] = mapped_column(Float, default=0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), index=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    data: Mapped[dict] = mapped_column(JSON)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
