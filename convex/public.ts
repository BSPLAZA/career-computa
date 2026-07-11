import { query } from "./_generated/server";
import { v } from "convex/values";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local.length > 0 ? local[0] : "*";
  return `${head}***@${domain}`;
}

// Start of today in Pacific time. PDT offset hardcoded; the event runs in July (UTC-7).
function startOfTodayPacific(now: number): number {
  const PDT_OFFSET_MS = 7 * 60 * 60 * 1000;
  const shifted = now - PDT_OFFSET_MS;
  const dayStartShifted = shifted - (shifted % (24 * 60 * 60 * 1000));
  return dayStartShifted + PDT_OFFSET_MS;
}

// Public work ledger: masked email, task id, timestamps, agents involved, success, cost, latency.
export const ledger = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 30, 100);
    const tasks = await ctx.db.query("tasks").order("desc").take(limit);
    const rows = [];
    for (const task of tasks) {
      const user = await ctx.db.get(task.userId);
      const runs = await ctx.db
        .query("runs")
        .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
        .collect();
      const agents = new Set<string>();
      let costUsd = 0;
      let latencyMs: number | null = null;
      let success: boolean | null = null;
      for (const run of runs) {
        costUsd += run.costUsd;
        if (run.finishedAt !== undefined) {
          latencyMs = (latencyMs ?? 0) + (run.finishedAt - run.startedAt);
        }
        if (run.success !== undefined) success = success === false ? false : run.success;
        const steps = await ctx.db
          .query("runSteps")
          .withIndex("by_run_seq", (q) => q.eq("runId", run._id))
          .collect();
        for (const s of steps) agents.add(s.agentRole);
      }
      rows.push({
        taskId: task._id,
        runId: runs.length > 0 ? runs[runs.length - 1]._id : null,
        runIds: runs.map((r) => r._id),
        maskedEmail: user ? maskEmail(user.email) : "***",
        isTeam: user?.isTeam ?? false,
        kind: task.kind,
        status: task.status,
        createdAt: task.createdAt,
        completedAt: task.completedAt ?? null,
        agentsInvolved: [...agents].sort(),
        success,
        costUsd: Math.round(costUsd * 10000) / 10000,
        latencyMs,
      });
    }
    return rows;
  },
});

// Judge-facing counters. "judge" figures exclude isTeam users per event rules; totals include everyone.
export const counters = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const dayStart = startOfTodayPacific(now);

    const users = await ctx.db.query("users").collect();
    const teamUserIds = new Set(users.filter((u) => u.isTeam).map((u) => u._id));

    const tasks = await ctx.db.query("tasks").collect();
    const completed = tasks.filter((t) => t.status === "delivered");
    const completedToday = completed.filter((t) => (t.completedAt ?? 0) >= dayStart);

    const jobsAll = await ctx.db.query("jobs").collect();

    const briefs = await ctx.db
      .query("artifacts")
      .withIndex("by_kind", (q) => q.eq("kind", "delivery_brief"))
      .collect();
    const briefsDelivered = briefs.filter((b) => b.deliveredAt !== undefined);

    const signups = users;
    const signupsWithFirstUse = users.filter((u) => u.firstUseAt !== undefined);

    return {
      tasksCompletedToday: {
        judge: completedToday.filter((t) => !teamUserIds.has(t.userId)).length,
        total: completedToday.length,
      },
      tasksCompletedTotal: {
        judge: completed.filter((t) => !teamUserIds.has(t.userId)).length,
        total: completed.length,
      },
      signups: {
        judge: signups.filter((u) => !u.isTeam).length,
        total: signups.length,
      },
      signupsWithFirstUse: {
        judge: signupsWithFirstUse.filter((u) => !u.isTeam).length,
        total: signupsWithFirstUse.length,
      },
      jobsDiscovered: {
        judge: jobsAll.filter((j) => !teamUserIds.has(j.userId)).length,
        total: jobsAll.length,
      },
      briefsDelivered: {
        judge: briefsDelivered.filter((b) => !teamUserIds.has(b.userId)).length,
        total: briefsDelivered.length,
      },
      asOf: now,
      dayStartPacific: dayStart,
    };
  },
});

// Full delivery brief by artifact id: backs the unique /brief/<artifactId> link.
// Only delivery_brief artifacts are exposed on this public path.
export const getBrief = query({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.artifactId);
    if (!a || a.kind !== "delivery_brief") return null;
    return {
      artifactId: a._id,
      kind: a.kind,
      content: a.content,
      gateResults: a.gateResults ?? [],
      sourceUrls: a.sourceUrls ?? [],
      deliveredVia: a.deliveredVia ?? null,
      deliveredAt: a.deliveredAt ?? null,
      createdAt: a._creationTime,
    };
  },
});

// Artifacts awaiting the human tap: drafted but not yet delivered.
// Tenant-scoped: a userId is required to see anything. Without one the queue is
// empty; drafts belong to their owner, never to a passer-by.
export const digestQueue = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId!))
      .order("desc")
      .take(200);
    const pending = artifacts.filter((a) => a.deliveredAt === undefined);
    const rows = [];
    for (const a of pending) {
      const task = await ctx.db.get(a.taskId);
      rows.push({
        artifactId: a._id,
        userId: a.userId,
        taskId: a.taskId,
        runId: a.runId,
        kind: a.kind,
        variantId: a.variantId ?? null,
        gateResults: a.gateResults ?? [],
        sourceUrls: a.sourceUrls ?? [],
        preview: a.content.slice(0, 280),
        taskKind: task?.kind ?? null,
        createdAt: a._creationTime,
      });
    }
    return rows;
  },
});
