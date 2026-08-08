import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthedUserId } from "./helpers";
import { JOB_STAGES, jobStageValidator, type JobStage } from "./schema";

const STAGE_LABELS: Record<JobStage, string> = {
  ASSIGNED: "Assigned",
  PPE_CHECK: "Pre-departure PPE check",
  TRAVELING: "Journey",
  DEVIATED: "Route deviation",
  ARRIVED: "Arrived at worksite",
  WORKSITE_CHECK: "Worksite safety check",
  WORKING: "Working",
  WARNING: "Warning",
  COMPLETED: "Completed",
};

const STAGE_TRANSITIONS: Record<JobStage, JobStage[]> = {
  ASSIGNED: ["PPE_CHECK"],
  PPE_CHECK: ["TRAVELING"],
  TRAVELING: ["DEVIATED", "ARRIVED"],
  DEVIATED: ["TRAVELING", "ARRIVED"],
  ARRIVED: ["WORKSITE_CHECK"],
  WORKSITE_CHECK: ["WORKING"],
  WORKING: ["WARNING", "COMPLETED"],
  WARNING: ["WORKING", "COMPLETED"],
  COMPLETED: [],
};

/** All jobs (supervisor). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await getAuthedUserId(ctx);
    const jobs = await ctx.db.query("jobs").order("desc").take(200);
    return jobs;
  },
});

export const getById = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    await getAuthedUserId(ctx);
    return await ctx.db.get(jobId);
  },
});

/** Validate + apply a job stage transition. */
export const setStage = mutation({
  args: { jobId: v.id("jobs"), to: jobStageValidator },
  handler: async (ctx, { jobId, to }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    const allowed = STAGE_TRANSITIONS[job.status] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid transition ${job.status} -> ${to}`);
    }
    const patch: {
      status: JobStage;
      stage: string;
      startedAt?: number;
      endedAt?: number;
    } = { status: to, stage: STAGE_LABELS[to] };
    if (to === "TRAVELING" && !job.startedAt) patch.startedAt = Date.now();
    if (to === "COMPLETED") patch.endedAt = Date.now();
    await ctx.db.patch(jobId, patch);
    return { status: to };
  },
});

/** Finish a job: persist computed scores + the completion report. */
export const completeJob = mutation({
  args: {
    jobId: v.id("jobs"),
    score: v.object({
      ppeCompliance: v.number(),
      sopCompliance: v.number(),
      safetyCompliance: v.number(),
      routeCompliance: v.number(),
      sequenceCompliance: v.number(),
      toolCompliance: v.number(),
      overallScore: v.number(),
    }),
    report: v.any(),
  },
  handler: async (ctx, { jobId, score, report }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    if (job.status === "COMPLETED") return { ok: true };

    await ctx.db.patch(jobId, {
      status: "COMPLETED",
      stage: STAGE_LABELS.COMPLETED,
      endedAt: Date.now(),
    });
    await ctx.db.insert("jobScores", {
      jobId,
      workerId: job.workerId,
      ...score,
      calculatedAt: Date.now(),
    });
    await ctx.db.insert("reports", {
      jobId,
      workerId: job.workerId,
      data: report,
      generatedAt: Date.now(),
    });
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .order("desc")
      .first();
    if (session && session.status !== "COMPLETED") {
      await ctx.db.patch(session._id, {
        status: "COMPLETED",
        endedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

export { JOB_STAGES };
