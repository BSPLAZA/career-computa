// Trust graduation: per-action-kind streaks of clean approvals, computed from
// feedback rows (the audit trail IS the state). At the configured threshold a kind
// graduates: the worker ships those artifacts without the tap, tagged
// auto_approved_graduated. Any edit, skip, or thumbs_down resets the streak.
// Revocation inserts a reset marker feedback row, so it is instant and auditable.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const DEFAULT_THRESHOLD = 5; // demo default; production would be 20

const ACTION_KINDS = ["fit_score", "resume_variant", "connection_note", "dm_draft", "brief_delivery"] as const;
type ActionKind = (typeof ACTION_KINDS)[number];

const ARTIFACT_TO_ACTION: Record<string, ActionKind> = {
  fit_report: "fit_score",
  resume_pdf: "resume_variant",
  connection_note: "connection_note",
  dm_draft: "dm_draft",
  delivery_brief: "brief_delivery",
};

const REVOKE_PREFIX = "trust_revoked:";

async function getThreshold(ctx: any): Promise<number> {
  const row = await ctx.db
    .query("config")
    .withIndex("by_key", (q: any) => q.eq("key", "trust_threshold"))
    .unique();
  return row?.value ?? DEFAULT_THRESHOLD;
}

// Per-kind streaks for a user. streak counts consecutive trailing approvals with no
// edit diff; graduated = streak >= threshold.
export const status = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const threshold = await getThreshold(ctx);
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    rows.sort((a, b) => a.at - b.at);

    const streaks: Record<string, { streak: number; lastAt: number | null }> = {};
    for (const k of ACTION_KINDS) streaks[k] = { streak: 0, lastAt: null };

    for (const f of rows) {
      let kind: ActionKind | null = null;
      if (f.reason?.startsWith(REVOKE_PREFIX)) {
        const k = f.reason.slice(REVOKE_PREFIX.length).split(/\s/)[0] as ActionKind;
        if (ACTION_KINDS.includes(k)) kind = k;
      } else if (f.artifactId) {
        const artifact = await ctx.db.get(f.artifactId);
        if (artifact) kind = ARTIFACT_TO_ACTION[artifact.kind] ?? null;
      }
      if (!kind) continue;
      const s = streaks[kind];
      s.lastAt = f.at;
      if (f.verdict === "approve" && !f.editDiff && !f.reason?.startsWith(REVOKE_PREFIX)) {
        s.streak += 1;
      } else {
        s.streak = 0; // edit, skip, thumbs_down, or revoke marker resets
      }
    }

    return {
      threshold,
      kinds: ACTION_KINDS.map((kind) => ({
        kind,
        streak: streaks[kind].streak,
        graduated: streaks[kind].streak >= threshold,
        remaining: Math.max(0, threshold - streaks[kind].streak),
        lastAt: streaks[kind].lastAt,
      })),
    };
  },
});

// One click "resume reviews": inserts an auditable reset marker, streak drops to 0,
// graduation lifts immediately.
export const revoke = mutation({
  args: {
    userId: v.id("users"),
    kind: v.union(...ACTION_KINDS.map((k) => v.literal(k))),
  },
  handler: async (ctx, args) => {
    const feedbackId = await ctx.db.insert("feedback", {
      userId: args.userId,
      verdict: "skip",
      reason: `${REVOKE_PREFIX}${args.kind} (graduation revoked by user; reviews resume)`,
      at: Date.now(),
    });
    return { ok: true as const, feedbackId };
  },
});

export const setThreshold = mutation({
  args: { value: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("config")
      .withIndex("by_key", (q) => q.eq("key", "trust_threshold"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
      return { ok: true as const, configId: existing._id };
    }
    const configId = await ctx.db.insert("config", { key: "trust_threshold", value: args.value });
    return { ok: true as const, configId };
  },
});
