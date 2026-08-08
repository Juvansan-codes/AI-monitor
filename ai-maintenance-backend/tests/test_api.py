"""API validation tests using FastAPI TestClient (demo mode).

The real Postgres dependency (get_db) is overridden with the in-memory
SQLite session (see conftest.py) so the suite runs without a live server.
"""
import os

os.environ.setdefault("AI_MODE", "demo")


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["error"] is None


def test_root_reports_ai_mode(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["ai_mode"] == "demo"


def test_ppe_check_rejects_oversized_or_bad_input(client):
    # Missing required form fields -> validation error
    res = client.post("/api/ai/ppe-check", files={"image": ("f.jpg", b"x", "image/jpeg")})
    assert res.status_code == 422


def test_ppe_check_demo_mode_returns_envelope(client):
    res = client.post(
        "/api/ai/ppe-check",
        data={"worker_id": "W102", "job_id": "1", "stage": "pre_departure"},
        files={"image": ("frame.jpg", b"fake-image", "image/jpeg")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert data["mode"] == "demo"
    assert data["source"] == "simulated"
    assert data["overall_status"] in ("PASSED", "FAILED")
    assert "helmet" in data["items"]
    assert "safety_shoes" in data["items"]


def test_detect_demo_mode_returns_simulated_detections(client):
    res = client.post(
        "/api/ai/detect",
        data={"job_id": "1", "worker_id": "W102"},
        files={"image": ("frame.jpg", b"fake-image", "image/jpeg")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert data["mode"] == "demo"
    assert len(data["detections"]) > 0
    assert data["detections"][0]["class"] == "person"
    assert data["detections"][0]["track_id"] is not None


def test_invalid_job_state_transition_is_rejected(client):
    # Unknown job -> friendly error envelope, not a crash.
    res = client.post("/api/jobs/999999/state", json={"to": "WORKING"})
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is False
    assert body["error"]["code"] == "NOT_FOUND"
