import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthedUserId } from "./helpers";
import { ppeMapValidator } from "./schema";

const PPE_LABELS: Record<string, string> = {
  helmet: "Helmet",
  safetyShoes: "Safety Shoes",
  gloves: "Gloves",
  uniform: "Uniform",
  safetyVest: "Safety Vest",
};

/**
 * Store the result of a PPE check. When the check fails, a PPE_MISSING alert
 * is created automatically (associating the alert with job + worker).
 */
export const recordCheck = mutation({
  args: {
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
    mode: v.string(),
    imageRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("ppeChecks", { ...args, timestamp: now });

    if (args.overallStatus === "FAILED") {
      const missing = Object.entries(args.items)
        .filter(([, item]) => !item.detected)
        .map(([key]) => PPE_LABELS[key] ?? key);
      await ctx.db.insert("alerts", {
        jobId: args.jobId,
        workerId: args.workerId,
        type: "PPE_MISSING",
        severity: "HIGH",
        message: missing.length
          ? `${missing.join(", ")} not detected. Please wear the required PPE before continuing.`
          : "Required PPE not detected. Please correct before continuing.",
        detected: missing.join(", "),
        resolved: false,
        timestamp: now,
      });
    }
    return { ok: true };
  },
});

export const listForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    await getAuthedUserId(ctx);
    return await ctx.db
      .query("ppeChecks")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .order("desc")
      .take(100);
  },
});
