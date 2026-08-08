import { aiPost, humanizeCode, seededRandom } from "./ai-client";
import type { AIMode, PPECheckResult, PPEMap, PpeItem, ToolCheck } from "./types";

export interface PpeCheckContext {
  workerId: string;
  jobId: string;
  stage: "pre_departure" | "worksite";
  attempt?: number;
}

export interface PPEDetectionService {
  checkPpe(image: Blob, ctx: PpeCheckContext): Promise<PPECheckResult>;
}

/** Raw response shape from FastAPI backend. */
interface BackendPpeResult {
  worker_id: string;
  job_id: string;
  mode: "demo" | "production";
  source: "simulated" | "model";
  items: {
    helmet: PpeItem;
    vest: PpeItem;
    gloves: PpeItem;
    goggles: PpeItem;
  };
  tools: ToolCheck[];
  overall_status: PPECheckResult["overallStatus"];
  message?: string | null;
  timestamp: string;
}

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
      mode: d.mode === "production" ? "production" : "demo",
      source: d.source === "model" ? "model" : "simulated",
      items: {
        helmet: d.items.helmet,
        vest: d.items.vest,
        gloves: d.items.gloves,
        goggles: d.items.goggles,
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
  "vest",
  "gloves",
  "goggles",
];

const ITEM_LABELS: Record<keyof PPEMap, string> = {
  helmet: "Helmet",
  vest: "Safety Vest",
  gloves: "Gloves",
  goggles: "Goggles",
};

export function demoPpeCheck(ctx: PpeCheckContext): PPECheckResult {
  const seed = `${ctx.workerId}:${ctx.jobId}:${ctx.stage}:${ctx.attempt ?? 0}`;
  const r = seededRandom(seed);
  const failItem: keyof PPEMap | null =
    ctx.stage === "worksite" && r < 0.22
      ? ITEM_KEYS[Math.floor(r * ITEM_KEYS.length * 10) % ITEM_KEYS.length]
      : null;

  const conf = (base: number) => Math.min(0.99, base + seededRandom(seed + "c") * 0.06);
  const items: PPEMap = {
    helmet: { detected: failItem !== "helmet", confidence: conf(0.92) },
    vest: { detected: failItem !== "vest", confidence: conf(0.90) },
    gloves: { detected: failItem !== "gloves", confidence: conf(0.88) },
    goggles: { detected: failItem !== "goggles", confidence: conf(0.89) },
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
