"""Data-access helpers.

Database logic is isolated from AI/SOP code: services receive sessions and
work through these repositories.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import models


def get_or_create_worker(db: Session, worker_id: str, name: str = "Worker") -> models.Worker:
    worker = db.scalar(select(models.Worker).where(models.Worker.worker_id == worker_id))
    if worker is None:
        worker = models.Worker(worker_id=worker_id, name=name)
        db.add(worker)
        db.commit()
        db.refresh(worker)
    return worker


def get_job(db: Session, job_id: int) -> models.Job | None:
    return db.get(models.Job, job_id)


def get_sop_with_steps(db: Session, sop_id: int) -> models.SOP | None:
    return db.get(models.SOP, sop_id)


def get_session(db: Session, job_id: int) -> models.MaintenanceSession | None:
    return db.scalar(
        select(models.MaintenanceSession)
        .where(models.MaintenanceSession.job_id == job_id)
        .order_by(models.MaintenanceSession.id.desc())
    )


def create_session(db: Session, job: models.Job, worker: models.Worker, sop: models.SOP) -> models.MaintenanceSession:
    session = models.MaintenanceSession(
        job_id=job.id,
        worker_id=worker.id,
        sop_id=sop.id,
        status="IN_PROGRESS",
        current_step_number=1,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def add_alert(db: Session, job_id: int, worker_id: int, **fields) -> models.Alert:
    alert = models.Alert(job_id=job_id, worker_id=worker_id, **fields)
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def add_ai_detection(db: Session, job_id: int, worker_id: int, **fields) -> models.AIDetection:
    detection = models.AIDetection(job_id=job_id, worker_id=worker_id, **fields)
    db.add(detection)
    db.commit()
    db.refresh(detection)
    return detection
