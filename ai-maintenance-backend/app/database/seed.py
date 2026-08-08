"""Demo data seeding for the AI Maintenance backend.

Idempotent: if demo workers already exist the seeder skips everything, so it
is safe to run on every startup. All data is clearly demo data — never
presented as real production records.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import models
from app.services.auth_service import hash_password

logger = logging.getLogger("amsq.seed")

# Demo accounts (email / password / role):
#   worker@demo.com      / worker123      (worker, W101)
#   worker2@demo.com     / worker123      (worker, W102)
#   worker3@demo.com     / worker123      (worker, W103)
#   supervisor@demo.com  / super123       (supervisor, S01)
DEMO_PASSWORD_WORKER = "worker123"
DEMO_PASSWORD_SUPERVISOR = "super123"

COMPANY = (37.7694, -122.4862)  # demo company yard (SF)


def _now(**offset) -> datetime:
    return datetime.now(timezone.utc) - timedelta(**offset)


def _worker(db: Session, worker_id: str, name: str, email: str, badge_number: str) -> models.Worker:
    user = models.User(
        email=email,
        hashed_password=hash_password(DEMO_PASSWORD_WORKER),
        role="worker",
        name=name,
    )
    db.add(user)
    db.flush()
    worker = models.Worker(
        worker_id=worker_id, badge_number=badge_number, user_id=user.id, name=name
    )
    db.add(worker)
    return worker


def _add_sop(
    db: Session,
    name: str,
    description: str,
    steps: Sequence[tuple[str, str, bool]],
    tools: List[str],
    ppe: List[str],
) -> models.SOP:
    sop = models.SOP(
        name=name,
        description=description,
        required_tools=tools,
        required_ppe=ppe,
    )
    for i, (action, code, critical) in enumerate(steps, start=1):
        sop.steps.append(
            models.SOPStep(
                step_number=i,
                action=action,
                action_code=code,
                safety_critical=critical,
            )
        )
    db.add(sop)
    return sop


def _add_job(
    db: Session,
    worker: models.Worker,
    sop: models.SOP,
    job_number: str,
    title: str,
    customer: str,
    destination: tuple[float, float],
    address: str,
    status: str,
    started_hours_ago: float,
) -> models.Job:
    job = models.Job(
        job_number=job_number,
        title=title,
        customer=customer,
        destination_address=address,
        company_lat=COMPANY[0],
        company_lng=COMPANY[1],
        destination_lat=destination[0],
        destination_lng=destination[1],
        planned_route=[
            [COMPANY[0] + (destination[0] - COMPANY[0]) * f, COMPANY[1] + (destination[1] - COMPANY[1]) * f]
            for f in (0.0, 0.25, 0.5, 0.75, 1.0)
        ],
        worker_id=worker.id,
        sop_id=sop.id,
        status=status,
        started_at=_now(hours=started_hours_ago) if status != "ASSIGNED" else None,
        ended_at=_now(hours=0.5) if status == "COMPLETED" else None,
        current_lat=destination[0],
        current_lng=destination[1],
        last_gps_at=_now(minutes=4),
    )
    db.add(job)
    db.flush()
    return job


def _add_locations(db: Session, job: models.Job, worker: models.Worker, n: int = 6) -> None:
    for i in range(1, n + 1):
        f = i / (n + 1)
        lat = job.company_lat + (job.destination_lat - job.company_lat) * f
        lng = job.company_lng + (job.destination_lng - job.company_lng) * f
        db.add(
            models.Location(
                job_id=job.id,
                worker_id=worker.id,
                lat=round(lat, 6),
                lng=round(lng, 6),
                timestamp=_now(minutes=90 - i * 12),
                source="demo",
            )
        )


def _add_session(
    db: Session,
    job: models.Job,
    worker: models.Worker,
    sop: models.SOP,
    current_step: int,
    completed: List[int],
    status: str,
) -> models.MaintenanceSession:
    session = models.MaintenanceSession(
        job_id=job.id,
        worker_id=worker.id,
        sop_id=sop.id,
        status=status,
        current_step_number=current_step,
        completed_steps=completed,
        skipped_steps=[4] if status == "COMPLETED" else [],
        incorrect_steps=[],
        started_at=job.started_at,
        ended_at=job.ended_at,
    )
    db.add(session)
    db.flush()
    return session


def seed_demo_data(db: Session) -> bool:
    """Seed the demo dataset once. Returns True when seeded, False when skipped."""
    if db.scalar(select(models.Worker).where(models.Worker.worker_id == "W101")):
        logger.info("Demo data already present — skipping seed.")
        return False

    logger.info("Seeding demo data (3 workers, 3 SOPs, 3 jobs, GPS, alerts, scores)...")

    # --- Workers + linked users ---
    w101 = _worker(db, "W101", "Maya Patel", "worker@demo.com", "B-2214")
    w102 = _worker(db, "W102", "Jonas Berg", "worker2@demo.com", "B-2217")
    w103 = _worker(db, "W103", "Priya Nair", "worker3@demo.com", "B-2209")

    supervisor_user = models.User(
        email="supervisor@demo.com",
        hashed_password=hash_password(DEMO_PASSWORD_SUPERVISOR),
        role="supervisor",
        name="Amir Haddad",
    )
    db.add(supervisor_user)
    db.flush()
    db.add(
        models.Supervisor(
            supervisor_id="S01",
            user_id=supervisor_user.id,
            name="Amir Haddad",
        )
    )

    # --- SOPs (from the database, never hard-coded in the engine) ---
    sop_motor = _add_sop(
        db,
        "Motor Component Replacement",
        "Replace the failed motor component per the standard procedure.",
        [
            ("Power OFF", "power_off", True),
            ("Wear PPE", "wear_ppe", True),
            ("Open Panel", "open_panel", False),
            ("Remove Component", "remove_component", False),
            ("Install New Component", "install_component", False),
            ("Tighten Screws", "tighten_screws", False),
            ("Close Panel", "close_panel", False),
            ("Power ON", "power_on", True),
        ],
        tools=["Screwdriver", "Wrench"],
        ppe=["Helmet", "Gloves", "Safety Shoes"],
    )
    sop_pump = _add_sop(
        db,
        "Pump Seal Replacement",
        "Replace a worn mechanical seal on a process pump.",
        [
            ("Isolate Pump", "isolate_pump", True),
            ("Depressurize", "depressurize", True),
            ("Remove Guard", "remove_guard", False),
            ("Remove Seal", "remove_seal", False),
            ("Install Seal", "install_seal", False),
            ("Reassemble Guard", "reinstall_guard", False),
            ("Test Cycle", "test_cycle", False),
            ("Power ON", "power_on", True),
        ],
        tools=["Wrench", "Seal Kit"],
        ppe=["Helmet", "Gloves", "Safety Glasses"],
    )
    sop_belt = _add_sop(
        db,
        "Conveyor Belt Tensioning",
        "Adjust belt tension and tracking on the packaging line conveyor.",
        [
            ("Power OFF", "power_off", True),
            ("Lockout", "lockout", True),
            ("Remove Guard", "remove_guard", False),
            ("Inspect Belt", "inspect_belt", False),
            ("Adjust Tension", "adjust_tension", False),
            ("Align Tracking", "align_tracking", False),
            ("Reinstall Guard", "reinstall_guard", False),
            ("Test Cycle", "test_cycle", False),
            ("Remove Lockout", "remove_lockout", True),
            ("Power ON", "power_on", True),
        ],
        tools=["Tension Gauge", "Allen Key"],
        ppe=["Helmet", "Gloves", "Safety Vest"],
    )

    # --- Jobs ---
    job_motor = _add_job(
        db, w101, sop_motor, "JOB-1024", "Motor Maintenance", "Bayline",
        (37.72, -122.156), "Bayline Plant 3, Brisbane", "WORKING", 2.0,
    )
    job_pump = _add_job(
        db, w102, sop_pump, "JOB-1031", "Pump Seal Replacement", "Delta Foods",
        (37.43, -122.15), "Delta Foods Cold Storage, Palo Alto", "WORKING", 3.5,
    )
    job_belt = _add_job(
        db, w103, sop_belt, "JOB-1047", "Conveyor Belt Tensioning", "NorthStar Logistics",
        (37.5, -121.95), "NorthStar DC 2, Fremont", "COMPLETED", 7.0,
    )

    _add_locations(db, job_motor, w101)
    _add_locations(db, job_pump, w102)
    _add_locations(db, job_belt, w103)

    # --- Maintenance sessions ---
    session_motor = _add_session(db, job_motor, w101, sop_motor, 3, [1, 2], "IN_PROGRESS")
    _add_session(db, job_pump, w102, sop_pump, 2, [1], "IN_PROGRESS")
    _add_session(db, job_belt, w103, sop_belt, 9, [1, 2, 3, 5, 6, 7, 8], "COMPLETED")

    # --- PPE checks ---
    ok_items = {
        "helmet": {"detected": True, "confidence": 0.94},
        "safety_shoes": {"detected": True, "confidence": 0.9},
        "gloves": {"detected": True, "confidence": 0.91},
        "uniform": {"detected": True, "confidence": 0.93},
        "safety_vest": {"detected": True, "confidence": 0.89},
    }
    failed_items = {**ok_items, "gloves": {"detected": False, "confidence": 0.12}}
    for job, worker in ((job_motor, w101), (job_pump, w102), (job_belt, w103)):
        db.add(
            models.PPECheck(
                job_id=job.id,
                worker_id=worker.id,
                stage="pre_departure",
                items=ok_items,
                tools=[{"tool": "Screwdriver", "detected": True, "confidence": 0.86}],
                overall_status="PASSED",
                mode="demo",
                timestamp=_now(hours=3),
            )
        )
    db.add(
        models.PPECheck(
            job_id=job_pump.id,
            worker_id=w102.id,
            stage="worksite",
            items=failed_items,
            tools=[{"tool": "Wrench", "detected": True, "confidence": 0.84}],
            overall_status="FAILED",
            mode="demo",
            timestamp=_now(hours=1),
        )
    )

    # --- Alerts (severities/types as in the spec) ---
    db.add(
        models.Alert(
            job_id=job_motor.id, worker_id=w101.id,
            type="WRONG_SOP_STEP", severity="HIGH",
            message="Incorrect SOP sequence. Expected Open Panel, detected Install Component.",
            expected="Open Panel", detected="Install Component", sop_step=3,
            timestamp=_now(minutes=50),
        )
    )
    db.add(
        models.Alert(
            job_id=job_pump.id, worker_id=w102.id,
            type="PPE_MISSING", severity="HIGH",
            message="Gloves not detected. Please wear the required PPE before continuing.",
            detected="Gloves",
            timestamp=_now(minutes=55),
        )
    )
    db.add(
        models.Alert(
            job_id=job_belt.id, worker_id=w103.id,
            type="ROUTE_DEVIATION", severity="LOW",
            message="Position 380 m from the planned route. Deviation recorded; not classified as a safety violation.",
            resolved=True, resolved_at=_now(hours=5), timestamp=_now(hours=6),
        )
    )

    # --- AI detections (clearly demo/simulated) ---
    db.add(
        models.AIDetection(
            job_id=job_motor.id, worker_id=w101.id, session_id=session_motor.id,
            detections=[
                {"class": "person", "confidence": 0.94, "bbox": [120, 80, 430, 620], "track_id": "T001"},
                {"class": "screwdriver", "confidence": 0.88, "bbox": [240, 320, 380, 500], "track_id": "T002"},
                {"class": "panel", "confidence": 0.83, "bbox": [60, 200, 220, 460], "track_id": "T003"},
            ],
            detected_action={"action": "Open Panel", "action_code": "open_panel", "confidence": 0.86, "evidence": ["person detected", "screwdriver detected", "panel detected", "interaction detected"], "source": "rule-based"},
            sop_status={"status": "PASS", "expected_step": 3, "expected_action": "Open Panel", "detected_action": "Open Panel", "message": "Step 3 · Open Panel verified."},
            mode="demo", timestamp=_now(minutes=40),
        )
    )
    db.add(
        models.AIDetection(
            job_id=job_pump.id, worker_id=w102.id,
            detections=[
                {"class": "person", "confidence": 0.92, "bbox": [100, 60, 410, 630], "track_id": "T001"},
                {"class": "wrench", "confidence": 0.85, "bbox": [250, 300, 400, 480], "track_id": "T002"},
                {"class": "pump", "confidence": 0.9, "bbox": [40, 180, 240, 520], "track_id": "T003"},
            ],
            detected_action={"action": "Isolate Pump", "action_code": "isolate_pump", "confidence": 0.81, "evidence": ["person detected", "pump detected"], "source": "rule-based"},
            sop_status={"status": "PASS", "expected_step": 1, "expected_action": "Isolate Pump", "detected_action": "Isolate Pump", "message": "Step 1 · Isolate Pump verified."},
            mode="demo", timestamp=_now(minutes=30),
        )
    )

    # --- Scores + report (completed job only for the report) ---
    db.add(models.JobScore(job_id=job_motor.id, worker_id=w101.id, ppe_compliance=100, sop_compliance=78, safety_compliance=92, route_compliance=96, sequence_compliance=80, tool_compliance=90, overall_score=86, calculated_at=_now(minutes=5)))
    db.add(models.JobScore(job_id=job_pump.id, worker_id=w102.id, ppe_compliance=82, sop_compliance=70, safety_compliance=84, route_compliance=98, sequence_compliance=75, tool_compliance=88, overall_score=80, calculated_at=_now(minutes=5)))
    db.add(models.JobScore(job_id=job_belt.id, worker_id=w103.id, ppe_compliance=100, sop_compliance=92, safety_compliance=100, route_compliance=96, sequence_compliance=90, tool_compliance=95, overall_score=95, calculated_at=_now(hours=3)))

    db.add(
        models.Report(
            job_id=job_belt.id,
            worker_id=w103.id,
            data={
                "demo": True,
                "job_number": "JOB-1047",
                "title": "Conveyor Belt Tensioning",
                "customer": "NorthStar Logistics",
                "worker_id": "W103",
                "worker_name": "Priya Nair",
                "started_at": _now(hours=7).isoformat(),
                "ended_at": _now(hours=3).isoformat(),
                "journey_duration_minutes": 42,
                "ppe_compliance": 100,
                "sop_compliance": 92,
                "safety_compliance": 100,
                "route_compliance": 96,
                "sequence_compliance": 90,
                "tool_compliance": 95,
                "overall_score": 95,
                "violations": [
                    {
                        "type": "ROUTE_DEVIATION",
                        "severity": "LOW",
                        "message": "Position 380 m from the planned route.",
                        "timestamp": _now(hours=6).isoformat(),
                        "sop_step": None,
                    }
                ],
            },
            generated_at=_now(hours=3),
        )
    )

    db.commit()
    logger.info("Demo data seeded: workers=3 users=4 sops=3 jobs=3")
    return True
