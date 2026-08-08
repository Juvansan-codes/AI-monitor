import { aiPost, seededRandom } from "./ai-client";
import type { AIMode, Detection, DetectionResult } from "./types";

/** Configurable object classes (mirrors the FastAPI backend config). */
export const OBJECT_CLASSES = [
  "person",
  "screwdriver",
  "wrench",
  "hammer",
  "machine",
  "motor",
  "pump",
  "panel",
  "component",
  "bolt",
  "screw",
  "helmet",
  "gloves",
  "safety_shoes",
  "safety_vest",
  "uniform",
] as const;

export interface DetectionContext {
  workerId: string;
  jobId: string;
  trackId?: string;
  /** expected SOP action code — sent as a hint to the backend recognizer */
  expectedActionCode?: string;
}

export interface ObjectDetectionService {
  detect(image: Blob, ctx: DetectionContext): Promise<DetectionResult>;
}

/** Raw snake_case response shape of the FastAPI backend. */
interface BackendDetection {
  class: string;
  confidence: number;
  bbox?: number[];
  track_id?: string;
}
interface BackendActionResult {
  action: string;
  action_code: string;
  confidence: number;
  evidence?: string[];
  source: "simulated" | "rule-based" | "model";
}
interface BackendSopStatus {
  status: "PASS" | "WARNING" | "ERROR" | "CRITICAL";
  expected_step?: number;
  expected_action?: string;
  detected_action?: string;
  message?: string;
}
interface BackendDetectionResult {
  job_id: string;
  worker_id: string;
  timestamp: string;
  mode: "demo" | "production";
  detections: BackendDetection[];
  current_action?: BackendActionResult | null;
  sop_status?: BackendSopStatus | null;
}

/** Talks to the Python FastAPI backend: POST /api/ai/detect */
class HttpObjectDetectionService implements ObjectDetectionService {
  async detect(image: Blob, ctx: DetectionContext): Promise<DetectionResult> {
    const fd = new FormData();
    fd.append("worker_id", ctx.workerId);
    fd.append("job_id", ctx.jobId);
    if (ctx.trackId) fd.append("track_id", ctx.trackId);
    if (ctx.expectedActionCode) fd.append("expected_action", ctx.expectedActionCode);
    fd.append("image", image, "frame.jpg");
    const res = await aiPost<BackendDetectionResult>("/api/ai/detect", fd);
    if (!res.success || !res.data) {
      throw new Error(res.error?.message ?? "Detection service unavailable");
    }
    const d = res.data;
    return {
      jobId: d.job_id,
      workerId: d.worker_id,
      // Preserve the backend's honest mode/source (never relabel demo as model).
      mode: d.mode === "production" ? "production" : "demo",
      source: d.mode === "production" ? "model" : "simulated",
      detections: (d.detections ?? []).map((det) => ({
        class: det.class,
        confidence: det.confidence,
        bbox: det.bbox,
        trackId: det.track_id,
      })),
      currentAction: d.current_action
        ? {
            action: d.current_action.action,
            actionCode: d.current_action.action_code,
            confidence: d.current_action.confidence,
            evidence: d.current_action.evidence ?? [],
            source: d.current_action.source,
          }
        : undefined,
      sopStatus: d.sop_status
        ? {
            status: d.sop_status.status,
            expectedStep: d.sop_status.expected_step,
            expectedAction: d.sop_status.expected_action,
            detectedAction: d.sop_status.detected_action,
            message: d.sop_status.message,
          }
        : undefined,
      timestamp: Date.parse(d.timestamp) || Date.now(),
    };
  }
}

/** Clearly-labeled simulated detections. No real inference happens. */
export function demoDetect(ctx: DetectionContext): DetectionResult {
  const seed = `${ctx.workerId}:${ctx.jobId}:${ctx.trackId ?? "T001"}`;
  const r = seededRandom(seed);
  const tools = ["screwdriver", "wrench", "panel", "motor", "component", "bolt"];
  const pick = Math.floor(r * tools.length);
  const detections: Detection[] = [
    { class: "person", confidence: Math.min(0.99, 0.9 + r * 0.08), bbox: [120, 60, 420, 640], trackId: ctx.trackId ?? "T001" },
    { class: tools[pick], confidence: Math.min(0.97, 0.78 + r * 0.16), bbox: [240, 320, 380, 500] },
    { class: tools[(pick + 2) % tools.length], confidence: Math.min(0.95, 0.7 + r * 0.2), bbox: [80, 200, 200, 420] },
  ];
  return {
    jobId: ctx.jobId,
    workerId: ctx.workerId,
    mode: "demo",
    source: "simulated",
    detections,
    timestamp: Date.now(),
  };
}

export function getObjectDetectionService(mode: AIMode): ObjectDetectionService {
  if (mode === "production") return new HttpObjectDetectionService();
  return { detect: (_image, ctx) => Promise.resolve(demoDetect(ctx)) };
}
