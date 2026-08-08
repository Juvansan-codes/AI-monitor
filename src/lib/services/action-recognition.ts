import { aiPost, humanizeCode, seededRandom } from "./ai-client";
import type { AIMode, ActionResult, Detection } from "./types";

/** Plausible maintenance actions (rule-based demo library). */
export const ACTION_LIBRARY = [
  "power_off",
  "wear_ppe",
  "open_panel",
  "remove_component",
  "install_component",
  "tighten_screws",
  "close_panel",
  "power_on",
  "isolate_pump",
  "depressurize",
  "remove_guard",
  "remove_seal",
  "install_seal",
  "reassemble_test",
  "lockout",
  "inspect_belt",
  "adjust_tension",
  "align_tracking",
  "test_cycle",
  "verify_alignment",
  "remove_lockout",
] as const;

export interface ActionRecognitionContext {
  workerId: string;
  jobId: string;
  detections: Detection[];
  /** expected step hint — the recognizer must still validate independently */
  expectedActionCode?: string;
  expectedLabel?: string;
  stepIndex?: number;
}

/**
 * Interface for a future temporal action-recognition model. Swapping the
 * rule-based/simulated implementation for a real model only requires a new
 * implementation of this interface — no route or UI changes.
 */
export interface ActionRecognitionModel {
  recognize(
    image: Blob,
    context: ActionRecognitionContext,
  ): Promise<ActionResult>;
}

/** Raw snake_case response shape of the FastAPI backend. */
interface BackendActionResult {
  action: string;
  action_code: string;
  confidence: number;
  evidence?: string[];
  source: "simulated" | "rule-based" | "model";
}

/** Talks to the Python FastAPI backend: POST /api/ai/actions/recognize */
class HttpActionRecognitionService implements ActionRecognitionModel {
  async recognize(image: Blob, ctx: ActionRecognitionContext): Promise<ActionResult> {
    const fd = new FormData();
    fd.append("worker_id", ctx.workerId);
    fd.append("job_id", ctx.jobId);
    if (ctx.expectedActionCode) fd.append("expected_action", ctx.expectedActionCode);
    fd.append("detections", JSON.stringify(ctx.detections));
    fd.append("image", image, "action_frame.jpg");
    const res = await aiPost<BackendActionResult>("/api/ai/actions/recognize", fd);
    if (!res.success || !res.data) {
      throw new Error(res.error?.message ?? "Action recognition service unavailable");
    }
    const d = res.data;
    return {
      action: d.action,
      actionCode: d.action_code,
      confidence: d.confidence,
      evidence: d.evidence ?? [],
      // Preserve the backend's honest source label (simulated/rule-based/model).
      source: d.source === "model" ? "model" : d.source === "rule-based" ? "rule-based" : "simulated",
    };
  }
}

/**
 * Clearly-labeled simulated recognizer. Mostly reports the expected action;
 * ~18% of the time it reports a plausible wrong action so the SOP deviation
 * warning flow can be exercised. Labeled SIMULATED in the UI.
 */
export function demoRecognize(ctx: ActionRecognitionContext): ActionResult {
  const seed = `${ctx.workerId}:${ctx.jobId}:${ctx.stepIndex ?? 0}:act`;
  const r = seededRandom(seed);
  let code = ctx.expectedActionCode ?? "open_panel";
  if (ctx.expectedActionCode && r > 0.82) {
    const others = ACTION_LIBRARY.filter((a) => a !== ctx.expectedActionCode);
    code = others[Math.floor(r * others.length) % others.length];
  }
  return {
    action: humanizeCode(code),
    actionCode: code,
    confidence: Math.min(0.95, 0.62 + r * 0.31),
    evidence: [
      "person detected",
      "tool detected",
      "equipment in frame",
      "worker/object interaction detected",
    ],
    source: "simulated",
  };
}

export function getActionRecognitionService(mode: AIMode): ActionRecognitionModel {
  if (mode === "production") return new HttpActionRecognitionService();
  return { recognize: (_image, ctx) => Promise.resolve(demoRecognize(ctx)) };
}
