"""Route verification service.

GPS is responsible for location; AI is responsible for camera-based safety
and maintenance verification. A deviation is reported factually and is never
automatically classified as a safety violation.
"""
from __future__ import annotations

import math
from typing import Dict, List, Tuple

from app.config import get_settings

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def _to_xy(lat: float, lng: float, cos_lat: float) -> Tuple[float, float]:
    x = math.radians(lng) * EARTH_RADIUS_M * cos_lat
    y = math.radians(lat) * EARTH_RADIUS_M
    return x, y


def distance_to_route_m(lat: float, lng: float, route: List[List[float]]) -> float:
    if not route:
        return float("inf")
    if len(route) == 1:
        return haversine_m(lat, lng, route[0][0], route[0][1])
    mid_lat = sum(p[0] for p in route) / len(route)
    cos_lat = math.cos(math.radians(mid_lat))
    px, py = _to_xy(lat, lng, cos_lat)
    best = float("inf")
    for (a1, b1), (a2, b2) in zip(route, route[1:]):
        ax, ay = _to_xy(a1, b1, cos_lat)
        bx, by = _to_xy(a2, b2, cos_lat)
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        t = 0.0 if length_sq == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
        cx, cy = ax + t * dx, ay + t * dy
        best = min(best, math.hypot(px - cx, py - cy))
    return best


def route_length_m(route: List[List[float]]) -> float:
    return sum(
        haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(route, route[1:])
    )


class RouteVerificationService:
    def __init__(self) -> None:
        settings = get_settings()
        self.deviation_threshold_m = settings.route_deviation_threshold_m
        self.arrived_threshold_m = settings.route_arrived_threshold_m
        self.avg_speed_kph = 40.0

    def verify(
        self,
        *,
        route: List[List[float]],
        current: Tuple[float, float],
        destination: Tuple[float, float],
    ) -> Dict:
        lat, lng = current
        dist_dest = haversine_m(lat, lng, destination[0], destination[1])
        dist_route = distance_to_route_m(lat, lng, route)
        remaining = max(0.0, dist_dest - self.arrived_threshold_m)
        eta_min = int(remaining / 1000 / (self.avg_speed_kph / 60))
        total = route_length_m(route) or 1.0
        progress = int(min(100, (max(0.0, total - remaining) / total) * 100))

        if dist_dest <= self.arrived_threshold_m:
            status, message = "ARRIVED", "Destination reached."
        elif dist_route > self.deviation_threshold_m:
            status = "DEVIATED"
            message = f"Position is {round(dist_route)} m from the planned route. Deviation recorded, not penalized automatically."
        else:
            status, message = "ON_ROUTE", "Following the assigned route."

        return {
            "status": status,
            "message": message,
            "distance_to_route_m": round(dist_route, 1),
            "distance_to_destination_m": round(dist_dest, 1),
            "remaining_meters": round(remaining, 1),
            "eta_minutes": eta_min,
            "progress_pct": progress,
            "deviation_threshold_m": self.deviation_threshold_m,
        }
