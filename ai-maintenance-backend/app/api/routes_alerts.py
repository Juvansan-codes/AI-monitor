"""Alert endpoints + WebSocket channel.

GET /api/jobs/{job_id}/alerts  -> stored alerts for a job
POST /api/alerts               -> create an alert (e.g. from worksite checks)
WS  /ws/jobs/{job_id}          -> real-time alert stream
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.alerts.alert_engine import AlertEngine
from app.api.deps import ok
from app.database import models
from app.database.database import get_db
from app.schemas.alert import AlertCreate, AlertOut
from app.ws.manager import manager

router = APIRouter(tags=["alerts"])


@router.get("/api/jobs/{job_id}/alerts")
def job_alerts(job_id: int, db: Session = Depends(get_db)):
    alerts = db.scalars(
        select(models.Alert).where(models.Alert.job_id == job_id).order_by(models.Alert.timestamp.desc()).limit(100)
    ).all()
    return ok([AlertOut.model_validate(a).model_dump() for a in alerts])


@router.post("/api/alerts")
async def create_alert(payload: AlertCreate, db: Session = Depends(get_db)):
    alert = AlertEngine.create(
        db,
        job_id=payload.job_id,
        worker_id=payload.worker_id,
        alert_type=payload.type,
        severity=payload.severity,
        message=payload.message,
        expected=payload.expected,
        detected=payload.detected,
        sop_step=payload.sop_step,
    )
    await AlertEngine.broadcast(alert)
    return ok(AlertOut.model_validate(alert).model_dump())


@router.websocket("/ws/jobs/{job_id}")
async def job_websocket(websocket: WebSocket, job_id: str):
    await manager.connect(job_id, websocket)
    try:
        while True:
            # Keep the socket open; clients may send ping messages.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(job_id, websocket)
