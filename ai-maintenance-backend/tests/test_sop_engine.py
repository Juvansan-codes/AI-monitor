"""Tests for the SOP engine and workflow verification."""
from app.database import models
from app.sop.sop_engine import SOPEngine, SOPState
from app.sop.workflow import SOPVerificationEngine


def _build_sop():
    sop = models.SOP(name="Motor Component Replacement")
    actions = [
        ("Power OFF", "power_off", True),
        ("Wear PPE", "wear_ppe", True),
        ("Open Panel", "open_panel", False),
        ("Remove Component", "remove_component", False),
        ("Install New Component", "install_component", False),
        ("Tighten Screws", "tighten_screws", False),
        ("Close Panel", "close_panel", False),
        ("Power ON", "power_on", True),
    ]
    for i, (action, code, critical) in enumerate(actions, start=1):
        sop.steps.append(models.SOPStep(step_number=i, action=action, action_code=code, safety_critical=critical))
    return sop


def test_correct_step_passes_and_advances():
    sop = _build_sop()
    engine = SOPVerificationEngine(sop)
    state = SOPState(current_step_number=3)
    verdict = engine.verify(state, "open_panel", "Open Panel")
    assert verdict["status"] == "PASS"
    assert verdict["advance"] is True


def test_wrong_step_does_not_advance():
    # An EARLIER step performed out of order is a wrong-step error: the
    # state must not advance (skipping a later step is covered separately).
    sop = _build_sop()
    engine = SOPVerificationEngine(sop)
    state = SOPState(current_step_number=4)  # expected: remove_component
    verdict = engine.verify(state, "open_panel", "Open Panel")  # step 3, wrong order
    assert verdict["status"] == "ERROR"
    assert verdict["advance"] is False
    assert verdict["alert"]["type"] == "WRONG_SOP_STEP"
    assert verdict["alert"]["severity"] == "HIGH"  # step 4 is not safety-critical


def test_safety_critical_wrong_step_is_critical():
    sop = _build_sop()
    engine = SOPVerificationEngine(sop)
    state = SOPState(current_step_number=1)  # power_off is safety critical
    verdict = engine.verify(state, "open_panel", "Open Panel")
    assert verdict["status"] == "ERROR"
    assert verdict["alert"]["severity"] == "CRITICAL"


def test_skipped_step_detection():
    """1→2→3→5: step 4 (Remove Component) must be flagged as SKIPPED."""
    sop = _build_sop()
    engine = SOPVerificationEngine(sop)
    state = SOPState(current_step_number=4)
    verdict = engine.verify(state, "install_component", "Install New Component")
    assert verdict["status"] == "WARNING"
    assert verdict["skipped_steps"] == [4]
    assert verdict["alert"]["type"] == "SOP_STEP_SKIPPED"
    assert verdict["advance"] is True


def test_expected_step_unknown_when_all_done():
    sop = _build_sop()
    engine = SOPVerificationEngine(sop)
    state = SOPState(current_step_number=9)
    verdict = engine.verify(state, "anything", "Anything")
    assert verdict["status"] == "PASS"
    assert verdict["advance"] is False


def test_sop_engine_state_pending():
    sop = _build_sop()
    engine = SOPEngine(sop)
    state = SOPState(current_step_number=3, completed_steps=[1, 2])
    pending = state.pending_steps(engine.total_steps)
    assert pending == [3, 4, 5, 6, 7, 8]
    assert engine.all_done(state) is False
    state.current_step_number = 9
    assert engine.all_done(state) is True
