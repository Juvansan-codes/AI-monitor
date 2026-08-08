import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthedUserId } from "./helpers";
import {
  alertTypeValidator,
  detectionItemValidator,
  severityValidator,
  sessionStatusValidator,
} from "./schema";

const detectedActionInput = v.object({
  action: v.string(),
  actionCode: v.string(),
  confidence: v.number(),
  evidence: v.array(v.string()),
  source: v.string(),
});

export const getForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    await getAuthedUserId(ctx);
    return (
      (await ctx.db
        .query("sessions")
        .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
        .order("desc")
        .first()) ?? null
    );
  },
});

export const start = mutation({
  args: { jobId: v.id("jobs"), workerId: v.id("workers"), sopId: v.id("sops") },
  handler: async (ctx, { jobId, workerId, sopId }) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .order("desc")
      .first();
    if (existing && existing.status === "IN_PROGRESS") return existing._id;
    const sessionId = await ctx.db.insert("sessions", {
      jobId,
      workerId,
      sopId,
      status: "IN_PROGRESS",
      currentStepNumber: 1,
      completedSteps: [],
      skippedSteps: [],
      incorrectSteps: [],
      startedAt: Date.now(),
    });
    return sessionId;
  },
});

/**
 * Persist one AI frame analysis:
 * - stores the aiDetection document
 * - applies SOP progress changes to the session
 * - creates any alerts raised by the SOP engine
 * - keeps the job state machine in sync (WARNING on critical alerts)
 */
export const recordDetection = mutation({
  args: {
    jobId: v.id("jobs"),
    workerId: v.id("workers"),
    sessionId: v.optional(v.id("sessions")),
    detections: v.array(detectionItemValidator),
    detectedAction: v.optional(detectedActionInput),
    sopStatus: v.optional(
      v.object({
        status: v.string(),
        expectedStep: v.optional(v.number()),
        expectedAction: v.optional(v.string()),
        detectedAction: v.optional(v.string()),
        message: v.optional(v.string()),
      }),
    ),
    mode: v.string(),
    sessionUpdate: v.optional(
      v.object({
        currentStepNumber: v.number(),
        completedSteps: v.array(v.number()),
        skippedSteps: v.array(v.number()),
        incorrectSteps: v.array(v.number()),
        status: sessionStatusValidator,
      }),
    ),
    alertsToCreate: v.array(
      v.object({
        type: alertTypeValidator,
        severity: severityValidator,
        message: v.string(),
        expected: v.optional(v.string()),
        detected: v.optional(v.string()),
        sopStep: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("aiDetections", {
      jobId: args.jobId,
      workerId: args.workerId,
      sessionId: args.sessionId,
      detections: args.detections,
      detectedAction: args.detectedAction,
      sopStatus: args.sopStatus,
      mode: args.mode,
      timestamp: now,
    });

    if (args.sessionUpdate && args.sessionId) {
      await ctx.db.patch(args.sessionId, args.sessionUpdate);
    }

    for (const a of args.alertsToCreate) {
      await ctx.db.insert("alerts", {
        jobId: args.jobId,
        workerId: args.workerId,
        type: a.type,
        severity: a.severity,
        message: a.message,
        expected: a.expected,
        detected: a.detected,
        sopStep: a.sopStep,
        resolved: false,
        timestamp: now,
      });
    }

    const job = await ctx.db.get(args.jobId);
    if (job && job.status !== "COMPLETED") {
      const critical = args.alertsToCreate.some(
        (a) => a.severity === "HIGH" || a.severity === "CRITICAL",
      );
      if (critical && job.status !== "WARNING") {
        await ctx.db.patch(args.jobId, { status: "WARNING", stage: "Warning" });
      } else if (!critical && job.status === "WARNING") {
        await ctx.db.patch(args.jobId, { status: "WORKING", stage: "Working" });
      }
    }
    return { ok: true, timestamp: now };
  },
});

export const complete = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "COMPLETED") {
      await ctx.db.patch(sessionId, { status: "COMPLETED", endedAt: Date.now() });
    }
    return { ok: true };
  },
});
