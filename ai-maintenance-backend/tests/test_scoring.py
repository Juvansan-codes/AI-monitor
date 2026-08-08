"""Tests for the scoring engine."""
from app.sop.scoring import ScoringEngine


def test_perfect_job_scores_100():
    engine = ScoringEngine()
    result = engine.compute(
        ppe_checks=[{"items": {"helmet": {"detected": True}, "gloves": {"detected": True}}}],
        sop_completed=8,
        sop_total=8,
        alerts=[],
        gps_points=100,
        route_deviations=0,
    )
    assert result["ppe_compliance"] == 100
    assert result["sop_compliance"] == 100
    assert result["overall_score"] == 100


def test_missing_ppe_drops_score():
    engine = ScoringEngine()
    result = engine.compute(
        ppe_checks=[
            {
                "items": {
                    "helmet": {"detected": True},
                    "gloves": {"detected": False},
                    "shoes": {"detected": True},
                }
            }
        ],
        sop_completed=8,
        sop_total=8,
    )
    assert result["ppe_compliance"] < 100
    assert result["overall_score"] < 100


def test_skipped_steps_penalise_sop_and_sequence():
    engine = ScoringEngine()
    clean = engine.compute(sop_completed=8, sop_total=8)
    sloppy = engine.compute(sop_completed=7, sop_total=8, skipped_steps=1)
    assert sloppy["sop_compliance"] < clean["sop_compliance"]
    assert sloppy["sequence_compliance"] < clean["sequence_compliance"]
    assert sloppy["overall_score"] < clean["overall_score"]


def test_unresolved_critical_alert_penalises_safety():
    engine = ScoringEngine()
    result = engine.compute(
        alerts=[{"severity": "CRITICAL", "resolved": False}],
        sop_completed=8,
        sop_total=8,
    )
    assert result["safety_compliance"] == 75


def test_route_deviation_reduces_route_compliance():
    engine = ScoringEngine()
    result = engine.compute(gps_points=100, route_deviations=10, sop_completed=8, sop_total=8)
    assert result["route_compliance"] < 100


def test_score_range():
    engine = ScoringEngine()
    result = engine.compute(sop_completed=0, sop_total=8, skipped_steps=5, incorrect_steps=3)
    assert 0 <= result["overall_score"] <= 100
