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

export const feedbackForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) =>
    ctx.db
      .query("feedback")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(100),
});
