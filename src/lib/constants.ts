import type { AlertType, JobStage, Severity } from "@/convex/schema";

export type Tone = "ok" | "warn" | "crit" | "neutral" | "info";

export const STAGE_META: Record<JobStage, { label: string; tone: Tone }> = {
  ASSIGNED: { label: "Assigned", tone: "neutral" },
  PPE_CHECK: { label: "Pre-departure PPE check", tone: "info" },
  TRAVELING: { label: "Journey", tone: "info" },
  DEVIATED: { label: "Route deviation", tone: "warn" },
  ARRIVED: { label: "Arrived at worksite", tone: "info" },
  WORKSITE_CHECK: { label: "Worksite safety check", tone: "info" },
  WORKING: { label: "Working", tone: "ok" },
  WARNING: { label: "Warning", tone: "crit" },
  COMPLETED: { label: "Completed", tone: "ok" },
};

export const JOURNEY_TIMELINE: { key: JobStage | "started"; label: string }[] = [
  { key: "ASSIGNED", label: "Company" },
  { key: "started", label: "Started" },
  { key: "TRAVELING", label: "En route" },
  { key: "ARRIVED", label: "Arrived" },
  { key: "WORKSITE_CHECK", label: "Worksite check" },
  { key: "WORKING", label: "Working" },
  { key: "COMPLETED", label: "Completed" },
];

export const SEVERITY_META: Record<Severity, { label: string; tone: Tone }> = {
  LOW: { label: "LOW", tone: "neutral" },
  MEDIUM: { label: "MEDIUM", tone: "warn" },
  HIGH: { label: "HIGH", tone: "crit" },
  CRITICAL: { label: "CRITICAL", tone: "crit" },
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  PPE_MISSING: "PPE Missing",
  WRONG_SOP_STEP: "Wrong SOP Step",
  SOP_STEP_SKIPPED: "SOP Step Skipped",
  WRONG_TOOL: "Wrong Tool",
  SAFETY_VIOLATION: "Safety Violation",
  ROUTE_DEVIATION: "Route Deviation",
  LOW_CONFIDENCE: "Low Confidence",
};

export const PPE_ITEMS: {
  key: "helmet" | "vest" | "gloves" | "goggles";
  label: string;
}[] = [
  { key: "helmet", label: "Helmet" },
  { key: "vest", label: "Safety Vest" },
  { key: "gloves", label: "Gloves" },
  { key: "goggles", label: "Goggles" },
];

export const REQUIRED_TOOLS = [
  "Screwdriver",
  "Wrench",
  "Torque wrench",
  "Hammer",
];

/** Terminal-themed tone → tailwind classes. */
export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-emerald-700",
  warn: "text-amber-700",
  crit: "text-red-700",
  info: "text-sky-800",
  neutral: "text-stone-600",
};

export const TONE_BG: Record<Tone, string> = {
  ok: "bg-emerald-600",
  warn: "bg-amber-500",
  crit: "bg-red-600",
  info: "bg-sky-600",
  neutral: "bg-stone-400",
};
