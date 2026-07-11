import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createTask = mutation({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("intake"), v.literal("pasted_message"), v.literal("followup"), v.literal("judge_assigned")),
    input: v.string(),
    jobId: v.optional(v.id("jobs")),
  },
  handler: async (ctx, args) => {
    const taskId = await ctx.db.insert("tasks", {
      userId: args.userId,
      kind: args.kind,
      input: args.input,
      jobId: args.jobId,
      status: "queued",
      createdAt: Date.now(),
    });
    return { taskId };
  },
});

// Atomic claim: mutations are transactional, so two workers never grab the same task.
export const claimNextQueuedTask = mutation({
  args: {},
  handler: async (ctx) => {
    const next = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("asc")
      .first();
    if (!next) return null;
    await ctx.db.patch(next._id, { status: "running" });
    return { ...next, status: "running" as const };
  },
});

// Marks a specific task running (one-shot CLI path; the worker uses claimNextQueuedTask).
export const startTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: "unknown_task" };
    if (task.status !== "queued") return { ok: false as const, error: `not_queued (${task.status})` };
    await ctx.db.patch(args.taskId, { status: "running" });
    return { ok: true as const };
  },
});

export const completeTask = mutation({
  args: {
    taskId: v.id("tasks"),
    status: v.optional(v.union(v.literal("delivered"), v.literal("failed"))),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: "unknown_task" };
    await ctx.db.patch(args.taskId, {
      status: args.status ?? "delivered",
      completedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

// Escalations carry full context; they never vanish.
export const escalateTask = mutation({
  args: { taskId: v.id("tasks"), reason: v.string(), context: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { ok: false as const, error: "unknown_task" };
    await ctx.db.patch(args.taskId, {
      status: "escalated",
      completedAt: Date.now(),
      escalation: { reason: args.reason, context: args.context },
    });
    return { ok: true as const };
  },
});

export const getTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => ctx.db.get(args.taskId),
});

export const tasksForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) =>
    ctx.db
      .query("tasks")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100),
});
