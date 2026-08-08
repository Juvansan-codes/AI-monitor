"""Tests for alert creation."""
from sqlalchemy import select

from app.alerts.alert_engine import AlertEngine
from app.database import models


def test_alert_is_persisted_with_metadata(db_session, worker_and_job):
    worker, job = worker_and_job
    alert = AlertEngine.create(
        db_session,
        job_id=job.id,
        worker_id=worker.id,
        alert_type="PPE_MISSING",
        severity="HIGH",
        message="Helmet not detected.",
        detected="Helmet",
        sop_step=None,
    )
    stored = db_session.get(models.Alert, alert.id)
    assert stored is not None
    assert stored.type == "PPE_MISSING"
    assert stored.severity == "HIGH"
    assert stored.job_id == job.id
    assert stored.worker_id == worker.id
    assert stored.resolved is False
    assert stored.timestamp is not None


def test_alerts_are_queryable_by_job(db_session, worker_and_job):
    worker, job = worker_and_job
    AlertEngine.create(db_session, job_id=job.id, worker_id=worker.id, alert_type="WRONG_SOP_STEP", severity="HIGH", message="x")
    AlertEngine.create(db_session, job_id=job.id, worker_id=worker.id, alert_type="SOP_STEP_SKIPPED", severity="MEDIUM", message="y")
    rows = db_session.scalars(select(models.Alert).where(models.Alert.job_id == job.id)).all()
    assert len(rows) == 2
