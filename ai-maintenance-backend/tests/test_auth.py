"""Tests for demo data seeding and the JWT auth endpoints."""
import os

os.environ.setdefault("AI_MODE", "demo")

from app.database import models  # noqa: E402
from app.database.seed import seed_demo_data  # noqa: E402


def test_seed_creates_demo_data(db_session):
    seed_demo_data(db_session)
    assert db_session.query(models.Worker).count() == 3
    assert db_session.query(models.User).count() == 4  # 3 workers + 1 supervisor
    assert db_session.query(models.Supervisor).count() == 1
    assert db_session.query(models.SOP).count() == 3
    assert db_session.query(models.SOPStep).count() >= 26  # 8 + 8 + 10 steps
    assert db_session.query(models.Job).count() == 3
    assert db_session.query(models.Location).count() >= 18
    assert db_session.query(models.Alert).count() == 3
    assert db_session.query(models.JobScore).count() == 3
    assert db_session.query(models.Report).count() == 1


def test_seed_is_idempotent(db_session):
    seed_demo_data(db_session)
    seed_demo_data(db_session)
    assert db_session.query(models.Worker).count() == 3
    assert db_session.query(models.Job).count() == 3


def test_login_returns_jwt_and_worker_link(client, db_session):
    seed_demo_data(db_session)
    res = client.post(
        "/api/auth/login",
        json={"email": "worker@demo.com", "password": "worker123"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert data["token"]
    assert data["token_type"] == "bearer"
    assert data["user"]["role"] == "worker"
    assert data["user"]["worker_id"] == "W101"


def test_login_rejects_wrong_password(client, db_session):
    seed_demo_data(db_session)
    res = client.post(
        "/api/auth/login",
        json={"email": "worker@demo.com", "password": "wrong-password"},
    )
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_rejects_unknown_email(client, db_session):
    seed_demo_data(db_session)
    res = client.post(
        "/api/auth/login",
        json={"email": "nobody@demo.com", "password": "whatever123"},
    )
    assert res.status_code == 401


def test_me_returns_current_supervisor(client, db_session):
    seed_demo_data(db_session)
    login = client.post(
        "/api/auth/login",
        json={"email": "supervisor@demo.com", "password": "super123"},
    ).json()
    token = login["data"]["token"]
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["role"] == "supervisor"
    assert data["supervisor_id"] == "S01"


def test_me_rejects_bad_token(client):
    res = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHORIZED"


def test_register_creates_worker_and_returns_token(client, db_session):
    res = client.post(
        "/api/auth/register",
        json={
            "email": "newworker@demo.com",
            "password": "password123",
            "name": "Test Worker",
            "role": "worker",
            "worker_id": "W200",
        },
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["token"]
    assert data["user"]["worker_id"] == "W200"
    # The new worker can now log in.
    login = client.post(
        "/api/auth/login",
        json={"email": "newworker@demo.com", "password": "password123"},
    )
    assert login.status_code == 200
