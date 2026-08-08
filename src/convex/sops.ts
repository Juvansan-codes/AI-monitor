import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getAuthedUserId } from "./helpers";

const sopStepInput = v.object({
  stepNumber: v.number(),
  action: v.string(),
  actionCode: v.string(),
  requiredTools: v.array(v.string()),
  safetyCritical: v.boolean(),
  description: v.optional(v.string()),
});

interface SopStepInput {
  stepNumber: number;
  action: string;
  actionCode: string;
  requiredTools: string[];
  safetyCritical: boolean;
  description?: string;
}

async function replaceSteps(
  ctx: MutationCtx,
  sopId: Doc<"sops">["_id"],
  steps: SopStepInput[],
) {
  const existing = await ctx.db
    .query("sopSteps")
    .withIndex("by_sopId", (q) => q.eq("sopId", sopId))
    .collect();
  for (const step of existing) {
    await ctx.db.delete(step._id);
  }
  const ordered = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);
  for (let i = 0; i < ordered.length; i++) {
    await ctx.db.insert("sopSteps", { ...ordered[i], sopId, stepNumber: i + 1 });
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await getAuthedUserId(ctx);
    const sops = await ctx.db.query("sops").order("desc").take(100);
    const result = [];
    for (const sop of sops) {
      const steps = (
        await ctx.db
          .query("sopSteps")
          .withIndex("by_sopId", (q) => q.eq("sopId", sop._id))
          .collect()
      ).sort((a, b) => a.stepNumber - b.stepNumber);
      result.push({ ...sop, steps });
    }
    return result;
  },
});

export const get = query({
  args: { sopId: v.id("sops") },
  handler: async (ctx, { sopId }) => {
    await getAuthedUserId(ctx);
    const sop = await ctx.db.get(sopId);
    if (!sop) return null;
    const steps = (
      await ctx.db
        .query("sopSteps")
        .withIndex("by_sopId", (q) => q.eq("sopId", sopId))
        .collect()
    ).sort((a, b) => a.stepNumber - b.stepNumber);
    return { ...sop, steps };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    requiredTools: v.array(v.string()),
    requiredPpe: v.array(v.string()),
    steps: v.array(sopStepInput),
  },
  handler: async (ctx, args) => {
    const sopId = await ctx.db.insert("sops", {
      name: args.name,
      description: args.description,
      requiredTools: args.requiredTools,
      requiredPpe: args.requiredPpe,
      isDemo: false,
    });
    const ordered = [...args.steps].sort((a, b) => a.stepNumber - b.stepNumber);
    for (let i = 0; i < ordered.length; i++) {
      await ctx.db.insert("sopSteps", { ...ordered[i], sopId, stepNumber: i + 1 });
    }
    return sopId;
  },
});

export const update = mutation({
  args: {
    sopId: v.id("sops"),
    name: v.string(),
    description: v.string(),
    requiredTools: v.array(v.string()),
    requiredPpe: v.array(v.string()),
    steps: v.array(sopStepInput),
  },
  handler: async (ctx, { sopId, steps, ...fields }) => {
    const sop = await ctx.db.get(sopId);
    if (!sop) throw new Error("SOP not found");
    await ctx.db.patch(sopId, fields);
    await replaceSteps(ctx, sopId, steps);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { sopId: v.id("sops") },
  handler: async (ctx, { sopId }) => {
    const sop = await ctx.db.get(sopId);
    if (!sop) throw new Error("SOP not found");
    const inUse = await ctx.db.query("jobs").filter((q) => q.eq(q.field("sopId"), sopId)).first();
    if (inUse) throw new Error("SOP is assigned to a job and cannot be deleted");
    const steps = await ctx.db
      .query("sopSteps")
      .withIndex("by_sopId", (q) => q.eq("sopId", sopId))
      .collect();
    for (const step of steps) {
      await ctx.db.delete(step._id);
    }
    await ctx.db.delete(sopId);
    return { ok: true };
  },
});
