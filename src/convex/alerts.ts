import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthedUserId } from "./helpers";
import { alertTypeValidator, severityValidator } from "./schema";

export const listForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    await getAuthedUserId(ctx);
    return await ctx.db
      .query("alerts")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .order("desc")
      .take(100);
  },
});

export const create = mutation({
  args: {
    jobId: v.id("jobs"),
    workerId: v.id("workers"),
    type: alertTypeValidator,
    severity: severityValidator,
    message: v.string(),
    expected: v.optional(v.string()),
    detected: v.optional(v.string()),
    sopStep: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("alerts", {
      ...args,
      resolved: false,
      timestamp: Date.now(),
    });
    return id;
  },
});

/** Worker acknowledges (and/or resolves) an alert. */
export const resolve = mutation({
  args: {
    alertId: v.id("alerts"),
    acknowledged: v.optional(v.boolean()),
  },
  handler: async (ctx, { alertId, acknowledged }) => {
    const alert = await ctx.db.get(alertId);
    if (!alert) throw new Error("Alert not found");
    const patch: Record<string, unknown> = {
      resolved: true,
      resolvedAt: Date.now(),
    };
    if (acknowledged) patch.acknowledgedAt = Date.now();
    await ctx.db.patch(alertId, patch);
    return { ok: true };
  },
});
