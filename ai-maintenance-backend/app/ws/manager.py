"""WebSocket connection manager.

Frontend subscribes via /ws/jobs/{job_id}; alerts for that job are broadcast
to every connected client (worker + supervisor). The abstraction is also
available for future real-time AI frame updates.
"""
from __future__ import annotations

import logging
from typing import Dict, List

from fastapi import WebSocket

logger = logging.getLogger("amsq.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self._jobs: Dict[str, List[WebSocket]] = {}

    async def connect(self, job_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._jobs.setdefault(job_id, []).append(websocket)
        logger.info("WebSocket connected for job %s (%d clients)", job_id, len(self._jobs[job_id]))

    def disconnect(self, job_id: str, websocket: WebSocket) -> None:
        if job_id in self._jobs:
            try:
                self._jobs[job_id].remove(websocket)
            except ValueError:
                pass
            if not self._jobs[job_id]:
                self._jobs.pop(job_id, None)

    def connections_for_job(self, job_id: str) -> List[WebSocket]:
        return list(self._jobs.get(job_id, []))

    async def broadcast(self, job_id: str, payload: dict) -> None:
        dead: List[WebSocket] = []
        for ws in self.connections_for_job(job_id):
            try:
                await ws.send_json(payload)
            except Exception:  # pragma: no cover - stale socket
                dead.append(ws)
        for ws in dead:
            self.disconnect(job_id, ws)


# Module-level singleton shared by the alert engine and ws routes.
manager = ConnectionManager()
