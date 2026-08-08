import { aiPost, humanizeCode, seededRandom } from "./ai-client";
import type { AIMode, PPECheckResult, PPEMap, PpeItem, ToolCheck } from "./types";

export interface PpeCheckContext {
  workerId: string;
  jobId: string;
  stage: "pre_departure" | "worksite";
  /** attempt counter — makes demo results vary between retries */
  attempt?: number;
}

export interface PPEDetectionService {
  checkPpe(image: Blob, ctx: PpeCheckContext): Promise<PPECheckResult>;
}

/** Raw snake_case response shape of the FastAPI backend. */
interface BackendPpeResult {
  worker_id: string;
  job_id: string;
  mode: "demo" | "production";
  source: "simulated" | "model";
  items: {
    helmet: PpeItem;
    safety_shoes: PpeItem;
    gloves: PpeItem;
    uniform: PpeItem;
    safety_vest: PpeItem;
  };
  tools: ToolCheck[];
  overall_status: PPECheckResult["overallStatus"];
  message?: string | null;
  timestamp: string;
}

/** Talks to the Python FastAPI backend: POST /api/ai/ppe-check */
class HttpPPEDetectionService implements PPEDetectionService {
  async checkPpe(image: Blob, ctx: PpeCheckContext): Promise<PPECheckResult> {
    const fd = new FormData();
    fd.append("worker_id", ctx.workerId);
    fd.append("job_id", ctx.jobId);
    fd.append("stage", ctx.stage);
    fd.append("image", image, "ppe_frame.jpg");
    const res = await aiPost<BackendPpeResult>("/api/ai/ppe-check", fd);
    if (!res.success || !res.data) {
      throw new Error(res.error?.message ?? "PPE service unavailable");
    }
    const d = res.data;
    return {
      workerId: d.worker_id,
      jobId: d.job_id,
      // Preserve the backend's honest mode/source: a backend running in
      // demo mode stays labeled SIMULATED — never relabeled as real AI.
      mode: d.mode === "production" ? "production" : "demo",
      source: d.source === "model" ? "model" : "simulated",
      items: {
        helmet: d.items.helmet,
        safetyShoes: d.items.safety_shoes,
        gloves: d.items.gloves,
        uniform: d.items.uniform,
        safetyVest: d.items.safety_vest,
      },
      tools: d.tools ?? [],
      overallStatus: d.overall_status,
      message: d.message ?? undefined,
      timestamp: Date.parse(d.timestamp) || Date.now(),
    };
  }
}

const ITEM_KEYS: (keyof PPEMap)[] = [
  "helmet",
  "safetyShoes",
  "gloves",
  "uniform",
  "safetyVest",
];

const ITEM_LABELS: Record<keyof PPEMap, string> = {
  helmet: "Helmet",
  safetyShoes: "Safety Shoes",
  gloves: "Gloves",
  uniform: "Uniform",
  safetyVest: "Safety Vest",
};

/** Clearly-labeled simulated PPE check. No real inference happens. */
export function demoPpeCheck(ctx: PpeCheckContext): PPECheckResult {
  const seed = `${ctx.workerId}:${ctx.jobId}:${ctx.stage}:${ctx.attempt ?? 0}`;
  const r = seededRandom(seed);
  // Pre-departure always passes so the flow advances; the worksite recheck
  // occasionally flags one item so the warning → fix → retry loop is visible.
  const failItem: keyof PPEMap | null =
    ctx.stage === "worksite" && r < 0.22
      ? ITEM_KEYS[Math.floor(r * ITEM_KEYS.length * 10) % ITEM_KEYS.length]
      : null;

  const conf = (base: number) => Math.min(0.99, base + seededRandom(seed + "c") * 0.06);
  const items: PPEMap = {
    helmet: { detected: failItem !== "helmet", confidence: conf(0.92) },
    safetyShoes: { detected: failItem !== "safetyShoes", confidence: conf(0.9) },
    gloves: { detected: failItem !== "gloves", confidence: conf(0.88) },
    uniform: { detected: failItem !== "uniform", confidence: conf(0.93) },
    safetyVest: { detected: failItem !== "safetyVest", confidence: conf(0.89) },
  };

  return {
    workerId: ctx.workerId,
    jobId: ctx.jobId,
    mode: "demo",
    source: "simulated",
    items,
    tools: [
      { tool: "Screwdriver", detected: true, confidence: conf(0.85) },
      { tool: "Wrench", detected: true, confidence: conf(0.82) },
    ],
    overallStatus: failItem ? "FAILED" : "PASSED",
    message: failItem
      ? `${ITEM_LABELS[failItem]} not detected. Please wear the required PPE before starting maintenance.`
      : undefined,
    timestamp: Date.now(),
  };
}

export function getPPEDetectionService(mode: AIMode): PPEDetectionService {
  if (mode === "production") return new HttpPPEDetectionService();
  return {
    checkPpe: (_image, ctx) => Promise.resolve(demoPpeCheck(ctx)),
  };
}

export { humanizeCode };
