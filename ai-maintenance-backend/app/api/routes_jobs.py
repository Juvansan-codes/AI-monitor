"""Job, GPS and route endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_worker_id, ok, rate_limit
from app.database import models
from app.database.database import get_db
from app.schemas.job import (
    JobCreate,
    JobOut,
    JobStateUpdate,
    LocationCreate,
    LocationOut,
    RouteStatus,
    ScoreOut,
)
from app.services.route_verification import RouteVerificationService

router = APIRouter(prefix="/api", tags=["jobs"])

# Valid job state transitions (state machine guard).
TRANSITIONS: dict = {
    "ASSIGNED": ["PPE_CHECK"],
    "PPE_CHECK": ["TRAVELING"],
    "TRAVELING": ["DEVIATED", "ARRIVED"],
    "DEVIATED": ["TRAVELING", "ARRIVED"],
    "ARRIVED": ["WORKSITE_CHECK"],
    "WORKSITE_CHECK": ["WORKING"],
    "WORKING": ["WARNING", "COMPLETED"],
    "WARNING": ["WORKING", "COMPLETED"],
    "COMPLETED": [],
}


@router.post("/jobs", response_model=dict)
def create_job(payload: JobCreate, db: Session = Depends(get_db), _=Depends(rate_limit)):
    worker = db.scalar(select(models.Worker).where(models.Worker.worker_id == payload.worker_id))
    if worker is None:
        return {"success": False, "data": None, "error": {"code": "WORKER_NOT_FOUND", "message": f"Worker {payload.worker_id} does not exist."}}

    job = models.Job(
        job_number=payload.job_number,
        title=payload.title,
        customer=payload.customer,
        destination_address=payload.destination_address,
        company_lat=payload.company_lat,
        company_lng=payload.company_lng,
        destination_lat=payload.destination_lat,
        destination_lng=payload.destination_lng,
        planned_route=payload.planned_route,
        worker_id=worker.id,
        sop_id=payload.sop_id,
        status="ASSIGNED",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return ok(JobOut.model_validate(job).model_dump())


@router.get("/jobs")
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.scalars(select(models.Job).order_by(models.Job.id.desc()).limit(200)).all()
    return ok([JobOut.model_validate(j).model_dump() for j in jobs])


@router.get("/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if job is None:
        return {"success": False, "data": None, "error": {"code": "NOT_FOUND", "message": "Job not found."}}
    return ok(JobOut.model_validate(job).model_dump())


@router.post("/jobs/{job_id}/state")
def update_job_state(job_id: int, payload: JobStateUpdate, db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if job is None:
        return {"success": False, "data": None, "error": {"code": "NOT_FOUND", "message": "Job not found."}}
    if payload.to not in TRANSITIONS.get(job.status, []):
        return {
            "success": False,
            "data": None,
            "error": {"code": "INVALID_TRANSITION", "message": f"Invalid transition {job.status} -> {payload.to}"},
        }
    job.status = payload.to
    now = datetime.now(timezone.utc)
    if payload.to == "TRAVELING" and job.started_at is None:
        job.started_at = now
    if payload.to == "COMPLETED":
        job.ended_at = now
    db.commit()
    db.refresh(job)
    return ok({"job_id": job_id, "status": job.status})


@router.post("/location")
def report_location(payload: LocationCreate, db: Session = Depends(get_db), _=Depends(rate_limit)):
    job = db.get(models.Job, payload.job_id) if payload.job_id.isdigit() else None
    worker = db.scalar(select(models.Worker).where(models.Worker.worker_id == payload.worker_id))
    if job is None or worker is None:
        return {"success": False, "data": None, "error": {"code": "NOT_FOUND", "message": "Job or worker not found."}}

    point = models.Location(
        job_id=job.id,
        worker_id=worker.id,
        lat=payload.latitude,
        lng=payload.longitude,
        timestamp=payload.timestamp or datetime.now(timezone.utc),
        source="gps",
    )
    db.add(point)
    job.current_lat = payload.latitude
    job.current_lng = payload.longitude
    job.last_gps_at = datetime.now(timezone.utc)
    worker.is_online = True
    worker.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return ok({"stored": True})


@router.get("/jobs/{job_id}/locations")
def job_locations(job_id: int, db: Session = Depends(get_db)):
    points = db.scalars(
        select(models.Location).where(models.Location.job_id == job_id).order_by(models.Location.timestamp)
    ).all()
    return ok([LocationOut.model_validate(p).model_dump() for p in points])


@router.get("/jobs/{job_id}/route")
def job_route_status(job_id: int, db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if job is None:
        return {"success": False, "data": None, "error": {"code": "NOT_FOUND", "message": "Job not found."}}
    if job.current_lat is None or job.current_lng is None:
        return ok({"status": "ON_ROUTE", "message": "No GPS fix yet."})

    service = RouteVerificationService()
    result = service.verify(
        route=job.planned_route or [[job.company_lat, job.company_lng], [job.destination_lat, job.destination_lng]],
        current=(job.current_lat, job.current_lng),
        destination=(job.destination_lat, job.destination_lng),
    )
    return ok(result)


@router.get("/jobs/{job_id}/score")
def job_score(job_id: int, db: Session = Depends(get_db)):
    score = db.scalar(select(models.JobScore).where(models.JobScore.job_id == job_id).order_by(models.JobScore.id.desc()))
    if score is None:
        return {"success": True, "data": None, "error": None}
    return ok(ScoreOut.model_validate(score).model_dump())


@router.get("/jobs/{job_id}/report")
def job_report(job_id: int, db: Session = Depends(get_db)):
    report = db.scalar(select(models.Report).where(models.Report.job_id == job_id).order_by(models.Report.id.desc()))
    if report is None:
        return {"success": True, "data": None, "error": None}
    return ok(report.data)
