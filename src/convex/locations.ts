import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthedUserId } from "./helpers";

/** Record a GPS point for a worker/job and update live position on the job. */
export const report = mutation({
  args: {
    jobId: v.id("jobs"),
    workerId: v.id("workers"),
    lat: v.number(),
    lng: v.number(),
    source: v.optional(v.string()),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, { jobId, workerId, lat, lng, source, timestamp }) => {
    const now = timestamp ?? Date.now();
    await ctx.db.insert("locations", {
      jobId,
      workerId,
      lat,
      lng,
      timestamp: now,
      source: source ?? "gps",
      synced: true,
    });
    const job = await ctx.db.get(jobId);
    if (job) {
      await ctx.db.patch(jobId, {
        currentLat: lat,
        currentLng: lng,
        lastGpsAt: now,
      });
    }
    const worker = await ctx.db.get(workerId);
    if (worker) {
      await ctx.db.patch(workerId, { isOnline: true, lastSeenAt: now });
    }
    return { ok: true };
  },
});

/** Batch-report cached GPS points after connectivity returns (offline sync). */
export const reportBatch = mutation({
  args: {
    points: v.array(
      v.object({
        jobId: v.id("jobs"),
        workerId: v.id("workers"),
        lat: v.number(),
        lng: v.number(),
        source: v.optional(v.string()),
        timestamp: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, { points }) => {
    for (const p of points) {
      const now = p.timestamp ?? Date.now();
      await ctx.db.insert("locations", {
        jobId: p.jobId,
        workerId: p.workerId,
        lat: p.lat,
        lng: p.lng,
        timestamp: now,
        source: p.source ?? "offline-cache",
        synced: true,
      });
    }
    if (points.length > 0) {
      const last = points[points.length - 1];
      const job = await ctx.db.get(last.jobId);
      if (job) {
        await ctx.db.patch(last.jobId, {
          currentLat: last.lat,
          currentLng: last.lng,
          lastGpsAt: last.timestamp ?? Date.now(),
        });
      }
    }
    return { synced: points.length };
  },
});

export const listForJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    await getAuthedUserId(ctx);
    return await ctx.db
      .query("locations")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .order("desc")
      .take(1000);
  },
});
