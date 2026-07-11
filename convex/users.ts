import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const TELEGRAM_BOT = "CareerAgencyBriefs_bot";

function deepLink(token: string): string {
  return `https://t.me/${TELEGRAM_BOT}?start=${token}`;
}

// Idempotent signup: an existing email returns the existing token and link.
export const signup = mutation({
  args: {
    email: v.string(),
    isTeam: v.optional(v.boolean()),
    demoMode: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) {
      return {
        userId: existing._id,
        signupToken: existing.signupToken,
        telegramDeepLink: deepLink(existing.signupToken),
        existing: true,
      };
    }
    const signupToken = crypto.randomUUID().replace(/-/g, "");
    const userId = await ctx.db.insert("users", {
      email,
      signedUpAt: Date.now(),
      isTeam: args.isTeam ?? false,
      demoMode: args.demoMode ?? false,
      signupToken,
    });
    return { userId, signupToken, telegramDeepLink: deepLink(signupToken), existing: false };
  },
});

export const bindTelegram = mutation({
  args: { signupToken: v.string(), chatId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_signupToken", (q) => q.eq("signupToken", args.signupToken))
      .unique();
    if (!user) return { ok: false as const, error: "unknown_token" };
    await ctx.db.patch(user._id, { telegramChatId: args.chatId });
    return { ok: true as const, userId: user._id, email: user.email };
  },
});

// Set once, on the first agent run that produces an artifact for this user.
export const markFirstUse = mutation({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("intake"), v.literal("export_upload"), v.literal("resume_upload")),
    runId: v.optional(v.id("runs")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return { ok: false as const, error: "unknown_user" };
    if (user.firstUseAt !== undefined) return { ok: true as const, alreadySet: true };
    await ctx.db.patch(args.userId, {
      firstUseAt: Date.now(),
      firstUseKind: args.kind,
      firstRunId: args.runId,
    });
    return { ok: true as const, alreadySet: false };
  },
});

export const getBySignupToken = query({
  args: { signupToken: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_signupToken", (q) => q.eq("signupToken", args.signupToken))
      .unique();
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => ctx.db.get(args.userId),
});

// Removes every row belonging to the user, then the user itself. Returns per-table delete counts.
export const deleteMyData = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const counts: Record<string, number> = {};
    await ctx.db.patch(args.userId, { deleteRequestedAt: Date.now() });

    const byUser = ["userProfiles", "contacts", "answerBank", "starStories", "targetCompanies", "feedback"] as const;
    for (const table of byUser) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
      counts[table] = rows.length;
    }

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user_state", (q) => q.eq("userId", args.userId))
      .collect();
    for (const job of jobs) await ctx.db.delete(job._id);
    counts.jobs = jobs.length;

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const a of artifacts) await ctx.db.delete(a._id);
    counts.artifacts = artifacts.length;

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    let stepCount = 0;
    for (const run of runs) {
      const steps = await ctx.db
        .query("runSteps")
        .withIndex("by_run_seq", (q) => q.eq("runId", run._id))
        .collect();
      for (const s of steps) await ctx.db.delete(s._id);
      stepCount += steps.length;
      await ctx.db.delete(run._id);
    }
    counts.runs = runs.length;
    counts.runSteps = stepCount;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const t of tasks) await ctx.db.delete(t._id);
    counts.tasks = tasks.length;

    await ctx.db.delete(args.userId);
    counts.users = 1;
    return { ok: true, counts };
  },
});
