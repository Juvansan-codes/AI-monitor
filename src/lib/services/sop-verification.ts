import type { ActionResult, SopAlert, SopVerdict } from "./types";

export interface SopStepLike {
  stepNumber: number;
  action: string;
  actionCode: string;
  safetyCritical: boolean;
}

/**
 * Generic SOP verification engine. SOP steps come from the database — this
 * engine never hard-codes steps. It mirrors the Python backend's
 * SOPVerificationEngine so behavior stays consistent.
 *
 * Rules:
 * - matching action  → PASS, advance
 * - later step done first → intermediate steps recorded as SKIPPED
 * - anything else → ERROR, do NOT advance the SOP state
 */
export class SOPVerificationEngine {
  private steps: SopStepLike[];

  constructor(steps: SopStepLike[]) {
    this.steps = steps;
  }

  verify(currentStepNumber: number, detected: ActionResult): SopVerdict {
    const expected = this.steps.find((s) => s.stepNumber === currentStepNumber);

    if (!expected) {
      return { status: "PASS", message: "All steps completed.", advance: false };
    }

    if (detected.actionCode === expected.actionCode) {
      return {
        status: "PASS",
        expectedStep: expected.stepNumber,
        expectedAction: expected.action,
        detectedAction: detected.action,
        message: `Step ${expected.stepNumber} · ${expected.action} verified.`,
        advance: true,
      };
    }

    // Skipped-step detection: a LATER step was performed first.
    const detectedStep = this.steps.find((s) => s.actionCode === detected.actionCode);
    if (detectedStep && detectedStep.stepNumber > expected.stepNumber) {
      const skipped = this.steps
        .filter(
          (s) =>
            s.stepNumber >= expected.stepNumber &&
            s.stepNumber < detectedStep.stepNumber,
        )
        .map((s) => s.stepNumber);
      const criticalSkipped =
        skipped.some((n) => {
          const s = this.steps.find((x) => x.stepNumber === n);
          return s?.safetyCritical;
        }) || expected.safetyCritical;
      const alert: SopAlert = {
        type: "SOP_STEP_SKIPPED",
        severity: criticalSkipped ? "CRITICAL" : "HIGH",
        message: `Step ${skipped.join(", ")} was skipped. Expected ${expected.action} before ${detected.action}.`,
        expected: expected.action,
        detected: detected.action,
        sopStep: expected.stepNumber,
      };
      return {
        status: "WARNING",
        expectedStep: expected.stepNumber,
        expectedAction: expected.action,
        detectedAction: detected.action,
        message: alert.message,
        alert,
        advance: true,
        skippedSteps: skipped,
      };
    }

    // Wrong step / wrong order: record and STOP advancing.
    const alert: SopAlert = {
      type: "WRONG_SOP_STEP",
      severity: expected.safetyCritical ? "CRITICAL" : "HIGH",
      message: `Incorrect SOP sequence. Expected ${expected.action}, detected ${detected.action}.`,
      expected: expected.action,
      detected: detected.action,
      sopStep: expected.stepNumber,
    };
    return {
      status: "ERROR",
      expectedStep: expected.stepNumber,
      expectedAction: expected.action,
      detectedAction: detected.action,
      message: alert.message,
      alert,
      advance: false,
    };
  }
}
