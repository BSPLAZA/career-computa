import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const clip = (s: string, n: number) => {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 3) + "..." : t;
};

const KIND_LABEL: Record<string, string> = {
  fit_report: "a fit report",
  resume_pdf: "a resume variant",
  connection_note: "a connection note",
  dm_draft: "a DM draft",
  delivery_brief: "a delivery brief",
};

// Feedback becomes memory: thumbs-down reasons and edit diffs convert into
// preferenceRules on the profile (with provenance text), which the drafter prompt
// injects on the next run. Nothing is learned silently; every rule is visible and
// deletable on the profile.
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

    // ---- learning step: convert the signal into a preference rule ----
    let learnedRule: string | null = null;
    const wantsRule =
      (args.verdict === "thumbs_down" && args.reason) ||
      (args.verdict === "edit" && args.editDiff);
    if (wantsRule) {
      // provenance: what the feedback was on, in plain words
      let onWhat = "an artifact";
      if (args.artifactId) {
        const artifact = await ctx.db.get(args.artifactId);
        if (artifact) onWhat = KIND_LABEL[artifact.kind] ?? "an artifact";
      }
      if (args.jobId) {
        const job = await ctx.db.get(args.jobId);
        if (job) {
          const company = await ctx.db.get(job.companyId);
          onWhat = `${clip(job.title, 40)}${company ? " at " + company.name : ""}`;
        }
      }
      const when = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/Los_Angeles",
      });
      learnedRule =
        args.verdict === "thumbs_down"
          ? `Avoid: ${clip(args.reason!, 120)} (from your thumbs down on ${onWhat}, ${when})`
          : `Apply this edit pattern the user made: ${clip(args.editDiff!, 140)} (from your edit to ${onWhat}, ${when})`;

      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique();
      if (profile) {
        const rules = profile.preferenceRules ?? [];
        if (!rules.includes(learnedRule)) {
          const next = [...rules, learnedRule].slice(-25); // cap; oldest rules age out
          await ctx.db.patch(profile._id, { preferenceRules: next });
        }
      } else {
        learnedRule = null; // no profile yet: nothing to attach the rule to
      }
    }

    return { feedbackId, learnedRule };
  },
});

// Undo for a just-given verdict: deletes the feedback row (scoped to its owner)
// and retracts the preference rule that recordFeedback minted from it, matched by
// the rule's provenance-free prefix. Backs the "Memory saved" toast's Undo button.
export const undoFeedback = mutation({
  args: { feedbackId: v.id("feedback"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.feedbackId);
    if (!row || row.userId !== args.userId) return { ok: false as const, error: "not_found" as const };

    const mintedRule =
      (row.verdict === "thumbs_down" && row.reason) || (row.verdict === "edit" && row.editDiff);
    if (mintedRule) {
      const prefix =
        row.verdict === "thumbs_down"
          ? `Avoid: ${clip(row.reason!, 120)} (from your thumbs down on `
          : `Apply this edit pattern the user made: ${clip(row.editDiff!, 140)} (from your edit to `;
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique();
      if (profile) {
        const rules = profile.preferenceRules ?? [];
        const idx = rules.findIndex((r) => r.startsWith(prefix));
        if (idx >= 0) {
          await ctx.db.patch(profile._id, {
            preferenceRules: [...rules.slice(0, idx), ...rules.slice(idx + 1)],
          });
        }
      }
    }

    await ctx.db.delete(args.feedbackId);
    return { ok: true as const };
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
