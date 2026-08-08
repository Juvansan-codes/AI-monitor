# AI Maintenance Safety & Quality Monitor — Backend

Python / FastAPI / YOLO / OpenCV backend for the AI Maintenance Safety & Quality
Monitoring System. It connects to the existing frontend web app and provides the
actual AI capabilities:

- PPE detection (helmet, gloves, shoes, vest, uniform)
- Maintenance object detection (person, tools, equipment)
- Rule-based action recognition (swappable for a real temporal model later)
- SOP step-by-step verification (correct / wrong / skipped steps)
- Alert engine with WebSockets (worker + supervisor)
- Quality scoring (PPE / SOP / sequence / tool / safety)
- Job state machine + GPS route verification
- S3-compatible object storage abstraction for frames/videos/reports

> **Honesty rule:** the system distinguishes `AI_MODE=demo` from
> `AI_MODE=production`. Demo mode returns clearly-labelled simulated detections.
> It never presents simulated results as real AI. In production mode a real
> YOLO weights file is loaded; if it is missing the API answers
> `MODEL_NOT_AVAILABLE` instead of fabricating results.

---

## 1. Requirements

- Python 3.11+
- PostgreSQL 14+
- (production mode only) a trained YOLO weights file, e.g. `models/yolo/ppe_best.pt`

## 2. Installation

```bash
cd ai-maintenance-backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt` installs FastAPI, Uvicorn, SQLAlchemy, psycopg, Ultralytics
YOLO, OpenCV, NumPy, Pydantic, PyJWT and pytest.

> On a fresh machine the heavy GPU/vision wheels (`torch`, `opencv-python`,
> `ultralytics`) can take a few minutes. They are only *required* in
> `AI_MODE=production`; in demo mode the detector classes are imported lazily
> and never load a model.

## 3. PostgreSQL setup

```sql
CREATE DATABASE amsq;
CREATE USER amsq WITH PASSWORD 'replace-me';
GRANT ALL PRIVILEGES ON DATABASE amsq TO amsq;
```

Tables are created automatically on startup (see `app/database/models.py` and
`app/database/database.py`). Point the app at your database with `DATABASE_URL`:

```
DATABASE_URL=postgresql+psycopg://amsq:replace-me@localhost:5432/amsq
```

## 4. Environment variables

Copy `env.example` and rename it to `.env`:

```bash
cp env.example .env
# fill in real values
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy PostgreSQL connection string |
| `JWT_SECRET` | long random string (≥32 bytes) used to sign auth tokens |
| `JWT_EXPIRES_MINUTES` | token lifetime in minutes (default 1440) |
| `SEED_DEMO_DATA` | seed demo workers/jobs/SOPs/alerts on startup (default `true`) |
| `AI_MODE` | `demo` (default, simulated) or `production` (real YOLO) |
| `YOLO_MODEL_PATH` | path to custom weights, e.g. `models/yolo/ppe_best.pt` |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_REGION` | S3-compatible object storage |
| `CORS_ORIGINS` | JSON list of allowed frontend origins |
| `MAX_UPLOAD_MB` | maximum uploaded frame/file size |
| `DEBUG` | FastAPI debug / verbose logging |

The app reads `.env` via python-dotenv. **Never commit `.env`** — it is in
`.gitignore`. All secrets stay server-side; nothing is exposed to the frontend.

## 5. Starting FastAPI

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API is served at `http://localhost:8000`.

## 6. Swagger / API docs

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

Every endpoint is documented and can be exercised from the browser. Responses
use a consistent envelope:

```json
{ "success": true, "data": {}, "error": null }
```

Errors:

```json
{ "success": false, "data": null, "error": { "code": "MODEL_NOT_AVAILABLE", "message": "..." } }
```

## 7. Adding YOLO weights

```bash
mkdir -p models/yolo
# copy your trained model, e.g.
cp /path/to/ppe_best.pt models/yolo/ppe_best.pt
```

Set `AI_MODE=production` and `YOLO_MODEL_PATH=models/yolo/ppe_best.pt`. The
`YOLODetector` class (`app/ai/yolo_detector.py`) loads the model once at first
use and caches it. If the file is missing the API returns `MODEL_NOT_AVAILABLE`
— it never silently fabricates detections.

Supported object classes are configured in `app/ai/object_detector.py`
(`OBJECT_CLASSES`), not hard-coded through the app.

## 8. Running in demo mode (default)

With `AI_MODE=demo` no model or GPU is needed. All responses include
`"mode": "demo"` and every simulated result is labelled as such. This is for
integration testing of the full pipeline (upload → detect → SOP engine →
alert engine → scoring) before real weights are available.

### Demo accounts & seeded data

On startup (when `SEED_DEMO_DATA=true`) an idempotent seeder creates a
clearly-demo dataset in PostgreSQL: 3 workers, 1 supervisor, 3 SOPs (Motor
Component Replacement, Pump Seal Replacement, Conveyor Belt Tensioning), 3
jobs with planned routes and GPS tracks, maintenance sessions, PPE checks,
AI detections, alerts, scores and a completed job report.

| Email | Password | Role | Linked id |
| --- | --- | --- | --- |
| `worker@demo.com` | `worker123` | worker | W101 |
| `worker2@demo.com` | `worker123` | worker | W102 |
| `worker3@demo.com` | `worker123` | worker | W103 |
| `supervisor@demo.com` | `super123` | supervisor | S01 |

Demo rows are never presented as real production records — AI detections are
`mode: "demo"` / `source: "simulated"` throughout.

## 9. How the frontend connects

The frontend talks to this backend with REST + WebSockets:

| Purpose | Endpoint |
| --- | --- |
| Login (JWT) | `POST /api/auth/login` |
| Register user + linked worker/supervisor | `POST /api/auth/register` |
| Current user | `GET /api/auth/me` (bearer token) |
| Jobs list / detail | `GET /api/jobs`, `GET /api/jobs/{id}` |
| Create job | `POST /api/jobs` |
| Location updates | `POST /api/location` |
| Job locations | `GET /api/jobs/{job_id}/locations` |
| PPE check | `POST /api/ai/ppe-check` |
| Frame analysis | `POST /api/ai/detect` (multipart) |
| Video frame | `POST /api/ai/video/frame` (design ready for `video/chunk`) |
| SOP for job | `GET /api/jobs/{job_id}/sop` |
| SOP progress | `POST /api/jobs/{job_id}/sop/progress` |
| Alerts | `GET /api/jobs/{job_id}/alerts`, `POST /api/alerts` |
| Score | `GET /api/jobs/{job_id}/score` |
| Report | `GET /api/jobs/{job_id}/report` |
| Realtime alerts | `WS /ws/jobs/{job_id}` |

Typical frame flow:

```
Camera → frontend canvas → multipart POST /api/ai/detect → YOLODetector
→ PPEDetector / ObjectDetector → ActionRecognizer → SOPVerificationEngine
→ AlertEngine (stores + broadcasts over WebSocket) → scoring → response
```

In the frontend, each of these is behind a service interface
(`PPEDetectionService`, `ObjectDetectionService`, `ActionRecognitionService`,
`SOPVerificationService`, `RouteVerificationService`), so the UI never depends
on YOLO internals.

**Frontend wiring:** set the Vite env var `VITE_AI_API_URL` to this backend's
origin (e.g. `http://localhost:8000`) and restart the frontend dev server. The
AI client then:

- sends camera frames as `multipart/form-data` to `/api/ai/ppe-check` and
  `/api/ai/detect` (snake_case responses are mapped to the frontend types),
- uses the server-side `current_action`/`sop_status` from `/api/ai/detect`
  when available,
- subscribes to `WS /ws/jobs/{job_id}` for real-time backend alert pushes
  during active monitoring.

When `VITE_AI_API_URL` is unset the UI shows "AI service not connected" — it
never fabricates results. If the backend runs with `AI_MODE=demo`, responses
are labelled `mode: "demo"` / `source: "simulated"` and the frontend displays
them as SIMULATED.

## 10. Replacing demo detection with a real trained model

1. Train/fine-tune your models (e.g. Ultralytics YOLOv8 for PPE and for
   maintenance objects).
2. Drop the weights into `models/yolo/` (e.g. `ppe_best.pt`, `objects_best.pt`).
3. Point `YOLO_MODEL_PATH` at them and set `AI_MODE=production`.
4. Map model class names to the canonical classes in `object_detector.py` /
   `ppe_detector.py` (e.g. `screwdriver`, `wrench`, `helmet`).
5. For true temporal action recognition, implement the
   `ActionRecognitionModel` interface in `app/ai/action_recognizer.py` and swap
   it in — the rest of the pipeline (SOP engine, alerts, scoring, routes) does
   not change.

## 11. Job state machine

```
ASSIGNED → PPE_CHECK → TRAVELING → ARRIVED → WORKSITE_CHECK → WORKING → COMPLETED
```

Invalid transitions are rejected (e.g. `ASSIGNED → WORKING` is refused).
`DEVIATED` and `WARNING` are non-terminal states that can be entered from
`TRAVELING` / `WORKING`.

## 12. Security & privacy

- JWT auth on protected endpoints, CORS restricted to `CORS_ORIGINS`.
- Upload validation: image file-type checks and `MAX_UPLOAD_MB` size limit.
- **No facial recognition.** Workers are tracked by anonymous IDs (`T001`, …)
  and `worker_id`; no biometric data is stored.
- Secrets live only in `.env` and are never returned by the API.

## 13. Running tests

```bash
source .venv/bin/activate
pytest -q
```

Coverage includes: PPE result processing, SOP sequence checking, skipped steps,
wrong sequence, alert creation, score calculation, job state transitions, GPS
route verification and API validation.

## 14. Project structure

```
app/
├── main.py                  # FastAPI app, CORS, router wiring, WS endpoint
├── api/                     # route modules (camera, ppe, detection, actions, sop, alerts, jobs)
├── ai/                      # yolo_detector, ppe_detector, object_detector, action_recognizer, tracker
├── sop/                     # sop_engine, workflow, scoring
├── alerts/                  # alert_engine
├── ws/                      # websocket connection manager
├── database/                # SQLAlchemy engine, models, repositories
├── schemas/                 # Pydantic models (detection, sop, alert, job)
└── services/                # video_service, storage_service, route_verification
models/yolo/                 # drop trained weights here
tests/                       # pytest suite
uploads/                     # local fallback storage when S3 is not configured
```
