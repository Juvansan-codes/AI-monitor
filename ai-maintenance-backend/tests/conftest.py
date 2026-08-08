"""Shared test fixtures: in-memory SQLite + sample data."""
import os
import sys
from pathlib import Path

# Ensure `app` is importable when running pytest from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("AI_MODE", "demo")

from app.database import models  # noqa: E402
from app.database.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def db_session():
    # StaticPool keeps a single connection so the in-memory database (and its
    # tables) is shared by every session/query in the test.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine)
    session = testing_session()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def motor_sop():
    """Sample SOP: Motor Component Replacement (8 steps)."""
    sop = models.SOP(name="Motor Component Replacement", description="demo", required_tools=["Screwdriver"], required_ppe=["Helmet"])
    actions = [
        ("Power OFF", "power_off", True),
        ("Wear PPE", "wear_ppe", True),
        ("Open Panel", "open_panel", False),
        ("Remove Component", "remove_component", False),
        ("Install New Component", "install_component", False),
        ("Tighten Screws", "tighten_screws", False),
        ("Close Panel", "close_panel", False),
        ("Power ON", "power_on", True),
    ]
    for i, (action, code, critical) in enumerate(actions, start=1):
        sop.steps.append(
            models.SOPStep(
                step_number=i,
                action=action,
                action_code=code,
                safety_critical=critical,
            )
        )
    return sop


@pytest.fixture()
def client(db_session):
    """TestClient with get_db overridden by the in-memory SQLite session."""
    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def worker_and_job(db_session):
    worker = models.Worker(worker_id="W102", name="Maya Patel")
    db_session.add(worker)
    db_session.flush()
    job = models.Job(
        job_number="JOB-1024",
        title="Motor Maintenance",
        customer="Bayline",
        company_lat=37.7694,
        company_lng=-122.4862,
        destination_lat=37.72,
        destination_lng=-122.156,
        worker_id=worker.id,
        status="WORKING",
    )
    db_session.add(job)
    db_session.commit()
    return worker, job
