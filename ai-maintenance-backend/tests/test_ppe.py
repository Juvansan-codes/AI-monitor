"""Tests for PPE result processing (demo mode + mapping)."""
from app.ai.ppe_detector import PPEDetector


def test_demo_mode_returns_labelled_simulated_results():
    detector = PPEDetector()
    assert detector.production is False
    result = detector.detect(b"fake-image-bytes-in-demo-mode")
    assert result["mode"] == "demo"
    assert result["source"] == "simulated"
    items = result["items"]
    assert set(items) == {"helmet", "safety_shoes", "gloves", "uniform", "safety_vest"}
    for key, item in items.items():
        assert "detected" in item and "confidence" in item
        assert 0 <= item["confidence"] <= 1


def test_availability_reports_demo_honestly():
    detector = PPEDetector()
    availability = detector.availability()
    assert availability["status"] == "OK"
    assert availability["mode"] == "demo"


def test_mapping_model_detections_to_items():
    from app.ai.yolo_detector import DetectionBox

    detector = PPEDetector()
    detections = [
        DetectionBox("helmet", 0.95, [10, 10, 50, 50]),
        DetectionBox("gloves", 0.88, [60, 60, 90, 90]),
    ]
    mapped = detector._map_model_detections(detections)
    assert mapped["source"] == "model"
    assert mapped["items"]["helmet"]["detected"] is True
    assert mapped["items"]["gloves"]["detected"] is True
    assert mapped["items"]["uniform"]["detected"] is False
    assert mapped["items"]["helmet"]["confidence"] == 0.95
