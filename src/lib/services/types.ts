import type { AlertType, Severity } from "@/convex/schema";

export type AIMode = "production" | "demo" | "unavailable";

export interface PpeItem {
  detected: boolean;
  confidence: number;
}

export interface PPEMap {
  helmet: PpeItem;
  vest: PpeItem;
  gloves: PpeItem;
  goggles: PpeItem;
}

export interface ToolCheck {
  tool: string;
  detected: boolean;
  confidence: number;
}

export interface PPECheckResult {
  workerId: string;
  jobId: string;
  mode: AIMode;
  source: "simulated" | "model";
  items: PPEMap;
  tools: ToolCheck[];
  overallStatus: "PASSED" | "FAILED" | "NOT_AVAILABLE";
  message?: string;
  timestamp: number;
}

export interface Detection {
  class: string;
  confidence: number;
  bbox?: number[];
  trackId?: string;
}

export interface DetectionResult {
  jobId: string;
  workerId: string;
  mode: AIMode;
  source: "simulated" | "model";
  detections: Detection[];
  /** server-side recognized action (FastAPI /api/ai/detect pipeline) */
  currentAction?: ActionResult;
  /** server-side SOP verdict for the frame */
  sopStatus?: SopStatus;
  timestamp: number;
}

export interface SopStatus {
  status: SopVerdictStatus;
  expectedStep?: number;
  expectedAction?: string;
  detectedAction?: string;
  message?: string;
}

export interface ActionResult {
  action: string; // human label, e.g. "Open Panel"
  actionCode: string; // machine key, e.g. "open_panel"
  confidence: number;
  evidence: string[];
  source: "simulated" | "rule-based" | "model";
}

export type SopVerdictStatus = "PASS" | "WARNING" | "ERROR" | "CRITICAL";

export interface SopAlert {
  type: AlertType;
  severity: Severity;
  message: string;
  expected?: string;
  detected?: string;
  sopStep?: number;
}

export interface SopVerdict {
  status: SopVerdictStatus;
  expectedStep?: number;
  expectedAction?: string;
  detectedAction?: string;
  message: string;
  alert?: SopAlert;
  /** whether the SOP state machine should advance after this verdict */
  advance: boolean;
  skippedSteps?: number[];
}
