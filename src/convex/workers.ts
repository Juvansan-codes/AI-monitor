import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getAuthedUserId } from "./helpers";
import { ROLES, roleValidator } from "./schema";

/** Attach a role + identity profile to the current auth user. */
export const ensureProfile = mutation({
  args: { role: roleValidator },
  handler: async (ctx, { role }) => {
    const userId = await getAuthedUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Role already established: return their home path.
    if (user.role && user.role !== role) {
      return user.role === ROLES.SUPERVISOR ? "/supervisor" : "/worker";
    }

    await ctx.db.patch(userId, { role });

    if (role === ROLES.WORKER) {
      const all = await ctx.db.query("workers").collect();
      const unclaimed = all.filter((w) => !w.userId);
      const demo = unclaimed.find((w) => w.isDemo) ?? unclaimed[0];
      if (demo) {
        await ctx.db.patch(demo._id, {
          userId,
          isOnline: true,
          lastSeenAt: Date.now(),
        });
      } else {
        const nextNumber = 100 + all.length + 1;
        await ctx.db.insert("workers", {
          userId,
          workerId: `W${nextNumber}`,
          name: user.name ?? `Worker ${nextNumber}`,
          isDemo: false,
          isOnline: true,
          lastSeenAt: Date.now(),
        });
      }
      return "/worker";
    }

    const sups = await ctx.db.query("supervisors").collect();
    const unclaimed = sups.filter((s) => !s.userId);
    const demo = unclaimed.find((s) => s.isDemo) ?? unclaimed[0];
    if (demo) {
      await ctx.db.patch(demo._id, { userId });
    } else {
      await ctx.db.insert("supervisors", {
        userId,
        supervisorId: "SV1",
        name: user.name ?? "Supervisor",
        isDemo: false,
      });
    }
    return "/supervisor";
  },
});

/** Current user identity: role + linked worker/supervisor profile. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthedUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) return { role: null, worker: null, supervisor: null };
    const worker =
      user.role === ROLES.WORKER
        ? ((await ctx.db
            .query("workers")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .first()) ?? null)
        : null;
    const supervisor =
      user.role === ROLES.SUPERVISOR
        ? ((await ctx.db
            .query("supervisors")
            .withIndex("by_userId", (q) => q.eq("userId", userId))
            .first()) ?? null)
        : null;
    return { role: user.role ?? null, worker, supervisor };
  },
});

/** Rich context for the worker app: worker + current job + SOP + progress. */
export const currentWorkerContext = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthedUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user || user.role !== ROLES.WORKER) {
      return { role: null, worker: null, job: null, sop: null, steps: [], session: null, ppeChecks: [], alerts: [], score: null, locations: [], report: null, aiDetections: [] };
    }
    const worker: Doc<"workers"> | null =
      (await ctx.db
        .query("workers")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first()) ?? null;
    if (!worker) {
      return { role: ROLES.WORKER, worker: null, job: null, sop: null, steps: [], session: null, ppeChecks: [], alerts: [], score: null, locations: [], report: null, aiDetections: [] };
    }

    const job: Doc<"jobs"> | null = worker.currentJobId
      ? await ctx.db.get(worker.currentJobId)
      : null;
    let sop: Doc<"sops"> | null = null;
    let steps: Doc<"sopSteps">[] = [];
    let session: Doc<"sessions"> | null = null;
    let ppeChecks: Doc<"ppeChecks">[] = [];
    let alerts: Doc<"alerts">[] = [];
    let score: Doc<"jobScores"> | null = null;
    let locations: Doc<"locations">[] = [];
    let report: Doc<"reports"> | null = null;
    let aiDetections: Doc<"aiDetections">[] = [];

    if (job) {
      if (job.sopId) {
        sop = await ctx.db.get(job.sopId);
        const allSteps = await ctx.db
          .query("sopSteps")
          .withIndex("by_sopId", (q) => q.eq("sopId", job.sopId!))
          .collect();
        steps = allSteps.sort((a, b) => a.stepNumber - b.stepNumber);
      }
      session =
        (await ctx.db
          .query("sessions")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .first()) ?? null;
      ppeChecks = await ctx.db
        .query("ppeChecks")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .order("desc")
        .take(30);
      alerts = await ctx.db
        .query("alerts")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .order("desc")
        .take(60);
      score =
        (await ctx.db
          .query("jobScores")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .first()) ?? null;
      locations = await ctx.db
        .query("locations")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .order("desc")
        .take(200);
      report =
        (await ctx.db
          .query("reports")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .first()) ?? null;
      aiDetections = await ctx.db
        .query("aiDetections")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .order("desc")
        .take(200);
    }

    return { role: ROLES.WORKER, worker, job, sop, steps, session, ppeChecks, alerts, score, locations, report, aiDetections };
  },
});

type EnrichedWorker = {
  worker: Doc<"workers">;
  job: Doc<"jobs"> | null;
  session: Doc<"sessions"> | null;
  latestPpe: Doc<"ppeChecks"> | null;
  score: Doc<"jobScores"> | null;
  latestAlert: Doc<"alerts"> | null;
  latestLocation: Doc<"locations"> | null;
};

/** Supervisor command-center context: all workers enriched with live status. */
export const supervisorOverview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthedUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user || user.role !== ROLES.SUPERVISOR) return null;

    const workers = await ctx.db.query("workers").collect();
    const enriched: EnrichedWorker[] = [];
    for (const w of workers) {
      const job: Doc<"jobs"> | null = w.currentJobId
        ? await ctx.db.get(w.currentJobId)
        : null;
      let session: Doc<"sessions"> | null = null;
      let latestPpe: Doc<"ppeChecks"> | null = null;
      let score: Doc<"jobScores"> | null = null;
      let latestAlert: Doc<"alerts"> | null = null;
      let latestLocation: Doc<"locations"> | null = null;
      if (job) {
        session =
          (await ctx.db
            .query("sessions")
            .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
            .order("desc")
            .first()) ?? null;
        latestPpe =
          (await ctx.db
            .query("ppeChecks")
            .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
            .order("desc")
            .first()) ?? null;
        score =
          (await ctx.db
            .query("jobScores")
            .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
            .order("desc")
            .first()) ?? null;
        latestAlert =
          (await ctx.db
            .query("alerts")
            .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
            .order("desc")
            .first()) ?? null;
        latestLocation =
          (await ctx.db
            .query("locations")
            .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
            .order("desc")
            .first()) ?? null;
      }
      enriched.push({ worker: w, job, session, latestPpe, score, latestAlert, latestLocation });
    }

    const recentAlerts = (
      await ctx.db.query("alerts").order("desc").take(40)
    ).map((a) => ({
      alert: a,
      worker: enriched.find((e) => e.worker._id === a.workerId)?.worker ?? null,
      job: enriched.find((e) => e.worker._id === a.workerId)?.job ?? null,
    }));

    const active = enriched.filter((e) => e.job && e.job.status !== "COMPLETED");
    const working = active.filter(
      (e) => e.job!.status === "WORKING" || e.job!.status === "WARNING",
    );
    const enRoute = active.filter(
      (e) =>
        e.job!.status === "TRAVELING" ||
        e.job!.status === "DEVIATED" ||
        e.job!.status === "ARRIVED",
    );
    const withScores = enriched.filter((e) => e.score);
    const avgSopCompliance = withScores.length
      ? Math.round(
          withScores.reduce((s, e) => s + e.score!.sopCompliance, 0) /
            withScores.length,
        )
      : 0;
    const activeAlerts = recentAlerts.filter((r) => !r.alert.resolved);

    return {
      workers: enriched,
      recentAlerts,
      counts: {
        totalWorkers: workers.length,
        activeJobs: active.length,
        enRoute: enRoute.length,
        working: working.length,
        activeAlerts: activeAlerts.length,
        avgSopCompliance,
      },
    };
  },
});

/** Detail page for a single worker (supervisor). */
export const getWorkerDetail = query({
  args: { workerId: v.string() },
  handler: async (ctx, { workerId }) => {
    const worker: Doc<"workers"> | null =
      (await ctx.db
        .query("workers")
        .withIndex("by_workerId", (q) => q.eq("workerId", workerId))
        .first()) ?? null;
    if (!worker) return null;

    const job: Doc<"jobs"> | null = worker.currentJobId
      ? await ctx.db.get(worker.currentJobId)
      : null;
    let sop: Doc<"sops"> | null = null;
    let steps: Doc<"sopSteps">[] = [];
    let session: Doc<"sessions"> | null = null;
    let ppeChecks: Doc<"ppeChecks">[] = [];
    let alerts: Doc<"alerts">[] = [];
    let score: Doc<"jobScores"> | null = null;
    let locations: Doc<"locations">[] = [];
    let report: Doc<"reports"> | null = null;
    let aiDetections: Doc<"aiDetections">[] = [];
    if (job) {
      if (job.sopId) {
        sop = await ctx.db.get(job.sopId);
        steps = (
          await ctx.db
            .query("sopSteps")
            .withIndex("by_sopId", (q) => q.eq("sopId", job.sopId!))
            .collect()
        ).sort((a, b) => a.stepNumber - b.stepNumber);
      }
      session =
        (await ctx.db
          .query("sessions")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .first()) ?? null;
      ppeChecks = await ctx.db
        .query("ppeChecks")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .order("desc")
        .take(50);
      alerts = await ctx.db
        .query("alerts")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .order("desc")
        .take(100);
      score =
        (await ctx.db
          .query("jobScores")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .first()) ?? null;
      locations = await ctx.db
        .query("locations")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .order("desc")
        .take(500);
      report =
        (await ctx.db
          .query("reports")
          .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
          .order("desc")
          .first()) ?? null;
      aiDetections = await ctx.db
        .query("aiDetections")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .order("desc")
        .take(300);
    }

    return { worker, job, sop, steps, session, ppeChecks, alerts, score, locations, report, aiDetections };
  },
});
