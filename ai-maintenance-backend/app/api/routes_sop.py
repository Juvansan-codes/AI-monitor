"""SOP endpoints.

GET  /api/jobs/{job_id}/sop             -> assigned SOP + steps (from DB)
POST /api/jobs/{job_id}/sop/progress    -> update session progress
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import ok
from app.database import models, repositories
from app.database.database import get_db
from app.schemas.sop import SOPOut, SOPProgressUpdate

router = APIRouter(prefix="/api/jobs", tags=["sop"])


@router.get("/{job_id}/sop")
def get_job_sop(job_id: int, db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if job is None:
        return {"success": False, "data": None, "error": {"code": "NOT_FOUND", "message": "Job not found."}}
    if job.sop_id is None:
        return {"success": True, "data": None, "error": None}
    sop = db.get(models.SOP, job.sop_id)
    if sop is None:
        return {"success": False, "data": None, "error": {"code": "NOT_FOUND", "message": "SOP not found."}}
    return ok(SOPOut.model_validate(sop).model_dump())


@router.post("/{job_id}/sop/progress")
def update_sop_progress(job_id: int, payload: SOPProgressUpdate, db: Session = Depends(get_db)):
    session = repositories.get_session(db, job_id)
    if session is None:
        return {"success": False, "data": None, "error": {"code": "NO_SESSION", "message": "No maintenance session for this job."}}
    session.current_step_number = payload.current_step_number
    session.completed_steps = payload.completed_steps
    session.skipped_steps = payload.skipped_steps
    session.incorrect_steps = payload.incorrect_steps
    db.commit()
    db.refresh(session)
    return ok({"current_step_number": session.current_step_number, "completed_steps": session.completed_steps})
