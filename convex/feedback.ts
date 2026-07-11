import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const recordFeedback = mutation({
  args: {
    userId: v.id("users"),
    verdict: v.union(v.literal("approve"), v.literal("edit"), v.literal("skip"), v.literal("thumbs_down")),
    artifactId: v.optional(v.id("artifacts")),
    jobId: v.optional(v.id("jobs")),
    editDiff: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const feedbackId = await ctx.db.insert("feedback", { ...args, at: Date.now() });
    return { feedbackId };
  },
});

export const feedbackForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) =>
    ctx.db
      .query("feedback")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100),
});
