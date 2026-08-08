import type { Doc } from "@/convex/_generated/dataModel";

export interface ScoreInput {
  ppeChecks: Doc<"ppeChecks">[];
  alerts: Doc<"alerts">[];
  session: {
    completedSteps: number[];
    skippedSteps: number[];
    incorrectSteps: number[];
  } | null;
  totalSteps: number;
  routeDeviations: number;
  gpsPoints: number;
}

export interface ScoreResult {
  ppeCompliance: number;
  sopCompliance: number;
  safetyCompliance: number;
  routeCompliance: number;
  sequenceCompliance: number;
  toolCompliance: number;
  overallScore: number;
}

/** Configurable weights (sums to 1). */
export const SCORE_WEIGHTS = {
  ppe: 0.2,
  sop: 0.3,
  safety: 0.2,
  route: 0.1,
  sequence: 0.15,
  tool: 0.05,
} as const;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function computeJobScore(input: ScoreInput): ScoreResult {
  // PPE compliance: mean of per-check detected-item ratio
  let ppeCompliance = 100;
  if (input.ppeChecks.length > 0) {
    const ratios = input.ppeChecks.map((c) => {
      const items = Object.values(c.items);
      if (items.length === 0) return 0;
      return items.filter((i) => i.detected).length / items.length;
    });
    ppeCompliance = (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100;
  }

  // SOP compliance: completed steps minus penalties for skips/incorrect
  const totalSteps = Math.max(1, input.totalSteps);
  const completed = input.session?.completedSteps.length ?? 0;
  const skipped = input.session?.skippedSteps.length ?? 0;
  const incorrect = input.session?.incorrectSteps.length ?? 0;
  let sopCompliance = (completed / totalSteps) * 100 - skipped * 12 - incorrect * 8;

  // Safety compliance: unresolved high/critical alerts deduct
  let safetyCompliance = 100;
  for (const a of input.alerts) {
    if (a.resolved) continue;
    if (a.severity === "CRITICAL") safetyCompliance -= 25;
    else if (a.severity === "HIGH") safetyCompliance -= 15;
    else if (a.severity === "MEDIUM") safetyCompliance -= 8;
  }

  // Route compliance: share of GPS points off the planned route
  let routeCompliance = 100;
  if (input.gpsPoints > 0) {
    routeCompliance -= (input.routeDeviations / input.gpsPoints) * 100 * 2;
  }

  // Sequence compliance: wrong-order / skipped steps
  let sequenceCompliance = 100 - incorrect * 12 - skipped * 10;

  // Tool compliance: wrong-tool alerts
  const wrongTools = input.alerts.filter((a) => a.type === "WRONG_TOOL").length;
  let toolCompliance = 100 - wrongTools * 15;

  const overallScore = clamp(
    clamp(ppeCompliance) * SCORE_WEIGHTS.ppe +
      clamp(sopCompliance) * SCORE_WEIGHTS.sop +
      clamp(safetyCompliance) * SCORE_WEIGHTS.safety +
      clamp(routeCompliance) * SCORE_WEIGHTS.route +
      clamp(sequenceCompliance) * SCORE_WEIGHTS.sequence +
      clamp(toolCompliance) * SCORE_WEIGHTS.tool,
  );

  return {
    ppeCompliance: clamp(ppeCompliance),
    sopCompliance: clamp(sopCompliance),
    safetyCompliance: clamp(safetyCompliance),
    routeCompliance: clamp(routeCompliance),
    sequenceCompliance: clamp(sequenceCompliance),
    toolCompliance: clamp(toolCompliance),
    overallScore,
  };
}
