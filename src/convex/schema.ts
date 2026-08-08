import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// User roles ----------------------------------------------------------------
export const ROLES = {
  WORKER: "worker",
  SUPERVISOR: "supervisor",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.WORKER),
  v.literal(ROLES.SUPERVISOR),
);
export type Role = Infer<typeof roleValidator>;

// Job lifecycle -------------------------------------------------------------
// ASSIGNED → PPE_CHECK → TRAVELING → (DEVIATED ⇄ TRAVELING) → ARRIVED
// → WORKSITE_CHECK → WORKING → (WARNING ⇄ WORKING) → COMPLETED
export const JOB_STAGES = [
  "ASSIGNED",
  "PPE_CHECK",
  "TRAVELING",
  "DEVIATED",
  "ARRIVED",
  "WORKSITE_CHECK",
  "WORKING",
  "WARNING",
  "COMPLETED",
] as const;

export const jobStageValidator = v.union(
  ...JOB_STAGES.map((s) => v.literal(s)),
);
export type JobStage = Infer<typeof jobStageValidator>;

// Alert domain --------------------------------------------------------------
export const ALERT_TYPES = [
  "PPE_MISSING",
  "WRONG_SOP_STEP",
  "SOP_STEP_SKIPPED",
  "WRONG_TOOL",
  "SAFETY_VIOLATION",
  "ROUTE_DEVIATION",
  "LOW_CONFIDENCE",
] as const;

export const alertTypeValidator = v.union(
  ...ALERT_TYPES.map((t) => v.literal(t)),
);
export type AlertType = Infer<typeof alertTypeValidator>;

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const severityValidator = v.union(
  ...SEVERITIES.map((s) => v.literal(s)),
);
export type Severity = Infer<typeof severityValidator>;

export const sessionStatusValidator = v.union(
  v.literal("NOT_STARTED"),
  v.literal("IN_PROGRESS"),
  v.literal("PAUSED"),
  v.literal("COMPLETED"),
  v.literal("STOPPED"),
);
export type SessionStatus = Infer<typeof sessionStatusValidator>;

// Shared object shapes ------------------------------------------------------
export const ppeItemValidator = v.object({
  detected: v.boolean(),
  confidence: v.number(),
});

export const detectionItemValidator = v.object({
  class: v.string(),
  confidence: v.number(),
  bbox: v.optional(v.array(v.number())),
});

export const ppeMapValidator = v.object({
  helmet: ppeItemValidator,
  vest: ppeItemValidator,
  gloves: ppeItemValidator,
  goggles: ppeItemValidator,
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    users: defineTable({
      name: v.optional(v.string()), // do not remove
      image: v.optional(v.string()), // do not remove
      email: v.optional(v.string()), // do not remove
      emailVerificationTime: v.optional(v.number()), // do not remove
      isAnonymous: v.optional(v.boolean()), // do not remove

      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    // Worker identities. Workers are identified by their anonymous WORKER ID
    // (e.g. "W102"). No facial recognition / biometric data is stored.
    workers: defineTable({
      userId: v.optional(v.id("users")), // linked auth user (null until claimed)
      workerId: v.string(), // anonymous worker id, e.g. "W102"
      badgeNumber: v.optional(v.string()), // employee badge number, e.g. "B-2214"
      name: v.string(),
      email: v.optional(v.string()),
      isDemo: v.boolean(), // seeded demo data
      isOnline: v.boolean(),
      currentJobId: v.optional(v.id("jobs")),
      lastSeenAt: v.optional(v.number()),
    })
      .index("by_workerId", ["workerId"])
      .index("by_userId", ["userId"]),

    supervisors: defineTable({
      userId: v.optional(v.id("users")),
      supervisorId: v.string(),
      name: v.string(),
      isDemo: v.boolean(),
    })
      .index("by_supervisorId", ["supervisorId"])
      .index("by_userId", ["userId"]),

    jobs: defineTable({
      jobNumber: v.string(), // e.g. "JOB-1024"
      title: v.string(), // e.g. "Motor Maintenance"
      customer: v.string(),
      destinationAddress: v.string(),
      companyLat: v.number(),
      companyLng: v.number(),
      destinationLat: v.number(),
      destinationLng: v.number(),
      plannedRoute: v.array(v.array(v.number())), // [[lat, lng], ...]
      workerId: v.id("workers"),
      sopId: v.optional(v.id("sops")),
      status: jobStageValidator,
      stage: v.string(), // human readable current stage label
      startedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
      currentLat: v.optional(v.number()),
      currentLng: v.optional(v.number()),
      lastGpsAt: v.optional(v.number()),
      isDemo: v.boolean(),
    })
      .index("by_workerId", ["workerId"])
      .index("by_jobNumber", ["jobNumber"])
      .index("by_status", ["status"]),

    locations: defineTable({
      jobId: v.id("jobs"),
      workerId: v.id("workers"),
      lat: v.number(),
      lng: v.number(),
      timestamp: v.number(),
      source: v.string(), // "gps" | "demo" | "offline-cache"
      synced: v.boolean(),
    })
      .index("by_jobId", ["jobId"])
      .index("by_workerId", ["workerId"]),

    ppeChecks: defineTable({
      jobId: v.id("jobs"),
      workerId: v.id("workers"),
      stage: v.union(v.literal("pre_departure"), v.literal("worksite")),
      items: ppeMapValidator,
      tools: v.array(
        v.object({
          tool: v.string(),
          detected: v.boolean(),
          confidence: v.number(),
        }),
      ),
      overallStatus: v.union(
        v.literal("PASSED"),
        v.literal("FAILED"),
        v.literal("NOT_AVAILABLE"),
      ),
      mode: v.string(), // "demo" | "production" | "unavailable"
      timestamp: v.number(),
      imageRef: v.optional(v.string()), // cloud storage reference (future)
    })
      .index("by_jobId", ["jobId"])
      .index("by_workerId", ["workerId"]),

    sops: defineTable({
      name: v.string(),
      description: v.string(),
      requiredTools: v.array(v.string()),
      requiredPpe: v.array(v.string()),
      isDemo: v.boolean(),
    }).index("by_name", ["name"]),

    sopSteps: defineTable({
      sopId: v.id("sops"),
      stepNumber: v.number(),
      action: v.string(), // display text, e.g. "Power OFF"
      actionCode: v.string(), // machine key, e.g. "power_off"
      requiredTools: v.array(v.string()),
      safetyCritical: v.boolean(),
      description: v.optional(v.string()),
    })
      .index("by_sopId", ["sopId"])
      .index("by_sop_step", ["sopId", "stepNumber"]),

    sessions: defineTable({
      jobId: v.id("jobs"),
      workerId: v.id("workers"),
      sopId: v.id("sops"),
      status: v.union(
        v.literal("NOT_STARTED"),
        v.literal("IN_PROGRESS"),
        v.literal("PAUSED"),
        v.literal("COMPLETED"),
        v.literal("STOPPED"),
      ),
      currentStepNumber: v.number(),
      completedSteps: v.array(v.number()),
      skippedSteps: v.array(v.number()),
      incorrectSteps: v.array(v.number()),
      startedAt: v.optional(v.number()),
      endedAt: v.optional(v.number()),
    })
      .index("by_jobId", ["jobId"])
      .index("by_workerId", ["workerId"]),

    aiDetections: defineTable({
      jobId: v.id("jobs"),
      workerId: v.id("workers"),
      sessionId: v.optional(v.id("sessions")),
      detections: v.array(detectionItemValidator),
      ppeStatus: v.optional(ppeMapValidator),
      detectedAction: v.optional(
        v.object({
          action: v.string(),
          actionCode: v.string(),
          confidence: v.number(),
          evidence: v.array(v.string()),
          source: v.string(), // "simulated" | "rule-based" | "model"
        }),
      ),
      sopStatus: v.optional(
        v.object({
          status: v.string(), // PASS | WARNING | ERROR | CRITICAL
          expectedStep: v.optional(v.number()),
          expectedAction: v.optional(v.string()),
          detectedAction: v.optional(v.string()),
          message: v.optional(v.string()),
        }),
      ),
      mode: v.string(), // "demo" | "production"
      timestamp: v.number(),
    }).index("by_jobId", ["jobId"]),

    alerts: defineTable({
      jobId: v.id("jobs"),
      workerId: v.id("workers"),
      type: alertTypeValidator,
      severity: severityValidator,
      message: v.string(),
      expected: v.optional(v.string()),
      detected: v.optional(v.string()),
      sopStep: v.optional(v.number()),
      resolved: v.boolean(),
      resolvedAt: v.optional(v.number()),
      acknowledgedAt: v.optional(v.number()),
      timestamp: v.number(),
    })
      .index("by_jobId", ["jobId"])
      .index("by_workerId", ["workerId"])
      .index("by_resolved", ["resolved"]),

    jobScores: defineTable({
      jobId: v.id("jobs"),
      workerId: v.id("workers"),
      ppeCompliance: v.number(), // 0-100
      sopCompliance: v.number(),
      safetyCompliance: v.number(),
      routeCompliance: v.number(),
      sequenceCompliance: v.number(),
      toolCompliance: v.number(),
      overallScore: v.number(),
      calculatedAt: v.number(),
    }).index("by_jobId", ["jobId"]),

    reports: defineTable({
      jobId: v.id("jobs"),
      workerId: v.id("workers"),
      data: v.any(), // full report document (violations, durations, scores)
      generatedAt: v.number(),
    }).index("by_jobId", ["jobId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
