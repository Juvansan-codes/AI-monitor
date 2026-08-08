"""Tests for route verification (GPS is separate from AI)."""
from app.services.route_verification import RouteVerificationService

ROUTE = [
    [37.7694, -122.4862],
    [37.762, -122.45],
    [37.748, -122.4],
    [37.72, -122.156],
]
DESTINATION = (37.72, -122.156)


def test_on_route():
    service = RouteVerificationService()
    result = service.verify(route=ROUTE, current=(37.762, -122.45), destination=DESTINATION)
    assert result["status"] == "ON_ROUTE"


def test_arrived_when_close_to_destination():
    service = RouteVerificationService()
    result = service.verify(route=ROUTE, current=(37.72005, -122.15605), destination=DESTINATION)
    assert result["status"] == "ARRIVED"


def test_deviated_when_far_from_route():
    service = RouteVerificationService()
    result = service.verify(route=ROUTE, current=(37.65, -122.3), destination=DESTINATION)
    assert result["status"] == "DEVIATED"
    # Deviation is factual — never classified as a safety violation here.
    assert "penaliz" not in result["message"].lower() or "not" in result["message"].lower()


def test_thresholds_are_configurable():
    service = RouteVerificationService()
    far = service.verify(route=ROUTE, current=(37.69, -122.28), destination=DESTINATION)
    # With a wider deviation threshold this should not be DEVIATED.
    service.deviation_threshold_m = 50000
    wide = service.verify(route=ROUTE, current=(37.69, -122.28), destination=DESTINATION)
    assert far["status"] == "DEVIATED" or far["distance_to_route_m"] > 500
    assert wide["status"] != "DEVIATED"
