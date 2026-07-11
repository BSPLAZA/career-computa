import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Normalized title hash for dedupe: lowercase, alphanumerics only, FNV-1a hex.
export function normTitleHash(title: string): string {
  const norm = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Dedupe order: (userId, canonicalUrl) first, then (userId, companyId, normalized title hash).
// Existing rows get fresh metadata patched in; state and assessment fields are never regressed by a re-poll.
export const upsertJob = mutation({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    title: v.string(),
    canonicalUrl: v.string(),
    applyUrl: v.string(),
    postedAt: v.optional(v.number()),
    location: v.optional(v.string()),
    isRemote: v.optional(v.boolean()),
    compRange: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const hash = normTitleHash(args.title);
    let existing = await ctx.db
      .query("jobs")
      .withIndex("by_user_canonicalUrl", (q) => q.eq("userId", args.userId).eq("canonicalUrl", args.canonicalUrl))
      .first();
    if (!existing) {
      existing = await ctx.db
        .query("jobs")
        .withIndex("by_user_company_titleHash", (q) =>
          q.eq("userId", args.userId).eq("companyId", args.companyId).eq("normTitleHash", hash),
        )
        .first();
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        canonicalUrl: args.canonicalUrl,
        applyUrl: args.applyUrl,
        postedAt: args.postedAt ?? existing.postedAt,
        location: args.location ?? existing.location,
        isRemote: args.isRemote ?? existing.isRemote,
        compRange: args.compRange ?? existing.compRange,
        normTitleHash: hash,
      });
      return { jobId: existing._id, deduped: true };
    }
    const jobId = await ctx.db.insert("jobs", {
      ...args,
      discoveredAt: Date.now(),
      caveats: [],
      state: "discovered",
      normTitleHash: hash,
    });
    return { jobId, deduped: false };
  },
});

// Assessment writer: fit score always lands with caveats and evidence (invariant 5).
export const assessJob = mutation({
  args: {
    jobId: v.id("jobs"),
    fitScore: v.number(),
    caveats: v.array(v.string()),
    fitEvidence: v.array(v.object({ jdLine: v.string(), resumeLine: v.string() })),
    hardFilterResult: v.optional(v.object({ rejected: v.boolean(), reason: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { ok: false as const, error: "unknown_job" };
    const rejected = args.hardFilterResult?.rejected === true;
    await ctx.db.patch(args.jobId, {
      fitScore: args.fitScore,
      caveats: args.caveats,
      fitEvidence: args.fitEvidence,
      hardFilterResult: args.hardFilterResult,
      state: rejected ? "auto_rejected" : "assessed",
    });
    return { ok: true as const, state: rejected ? "auto_rejected" : "assessed" };
  },
});

export const setJobState = mutation({
  args: {
    jobId: v.id("jobs"),
    state: v.union(
      v.literal("discovered"), v.literal("assessed"), v.literal("auto_rejected"), v.literal("queued"),
      v.literal("delivered"), v.literal("applied"), v.literal("screening"), v.literal("interviewing"),
      v.literal("closed"), v.literal("ghosted"),
    ),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return { ok: false as const, error: "unknown_job" };
    await ctx.db.patch(args.jobId, { state: args.state });
    return { ok: true as const };
  },
});

// Canonical URLs of postings this user has already been served (assessed or further
// along the pipeline). The intake worker excludes these so a posting never double counts.
export const assessedUrlsForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const states = ["assessed", "queued", "delivered", "applied", "screening", "interviewing"] as const;
    const urls: string[] = [];
    for (const state of states) {
      const rows = await ctx.db
        .query("jobs")
        .withIndex("by_user_state", (q) => q.eq("userId", args.userId).eq("state", state))
        .collect();
      for (const r of rows) urls.push(r.canonicalUrl);
    }
    return urls;
  },
});

export const getJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => ctx.db.get(args.jobId),
});

// Jobs for a user grouped by state, company names joined in.
export const pipelineBoard = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_user_state", (q) => q.eq("userId", args.userId))
      .collect();
    const companyNames = new Map<string, string>();
    const board: Record<string, unknown[]> = {};
    for (const job of jobs) {
      if (!companyNames.has(job.companyId)) {
        const c = await ctx.db.get(job.companyId);
        companyNames.set(job.companyId, c?.name ?? "unknown");
      }
      const row = { ...job, companyName: companyNames.get(job.companyId) };
      (board[job.state] ??= []).push(row);
    }
    return board;
  },
});
