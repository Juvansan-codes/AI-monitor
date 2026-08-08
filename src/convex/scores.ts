import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthedUserId } from "./helpers";

export const getForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    await getAuthedUserId(ctx);
    return (
      (await ctx.db
        .query("jobScores")
        .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
        .order("desc")
        .first()) ?? null
    );
  },
});

export const getReportForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    await getAuthedUserId(ctx);
    return (
      (await ctx.db
        .query("reports")
        .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
        .order("desc")
        .first()) ?? null
    );
  },
});

/** All completion reports joined with job + worker (supervisor reports page). */
export const listWithJobs = query({
  args: {},
  handler: async (ctx) => {
    await getAuthedUserId(ctx);
    const reports = await ctx.db.query("reports").order("desc").take(200);
    const out = [];
    for (const r of reports) {
      const job = await ctx.db.get(r.jobId);
      const worker = await ctx.db.get(r.workerId);
      const score = await ctx.db
        .query("jobScores")
        .withIndex("by_jobId", (q) => q.eq("jobId", r.jobId))
        .order("desc")
        .first();
      out.push({ report: r, job, worker, score });
    }
    return out;
  },
});
