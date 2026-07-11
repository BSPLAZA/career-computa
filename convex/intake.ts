// Bulk intake mutations for onboarding (LinkedIn export + resume parse results).
// Idempotent: each bulk call replaces the user's existing rows for that table,
// so re-running scripts/onboard-bryan.mjs never duplicates data.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

const profileValidator = v.object({
  name: v.string(),
  headline: v.optional(v.string()),
  locations: v.array(v.string()),
  goals: v.object({
    targetTitles: v.array(v.string()),
    compFloor: v.optional(v.number()),
    remote: v.union(v.literal("remote"), v.literal("hybrid"), v.literal("onsite"), v.literal("flexible")),
    visaNeeded: v.optional(v.boolean()),
    weeklyQuota: v.optional(v.number()),
  }),
  hardFilters: v.array(v.string()),
  softPrefs: v.array(v.string()),
  stylePrefs: v.object({
    style: v.union(v.literal("plaza-serif"), v.literal("modern-sans")),
    density: v.union(v.literal("lean"), v.literal("full")),
    summaryLines: v.union(v.literal(2), v.literal(3)),
  }),
  preferenceRules: v.array(v.string()),
});

export const upsertProfile = mutation({
  args: { userId: v.id("users"), profile: profileValidator },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (existing) {
      await ctx.db.replace(existing._id, { userId: args.userId, ...args.profile });
      return { profileId: existing._id, replaced: true };
    }
    const profileId = await ctx.db.insert("userProfiles", { userId: args.userId, ...args.profile });
    return { profileId, replaced: false };
  },
});

async function wipeByUser(ctx: any, table: "contacts" | "answerBank" | "starStories", userId: any): Promise<number> {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}

export const bulkContacts = mutation({
  args: {
    userId: v.id("users"),
    contacts: v.array(v.object({
      firstName: v.string(),
      lastName: v.string(),
      profileUrl: v.optional(v.string()),
      company: v.string(),
      position: v.string(),
      connectedOn: v.optional(v.string()),
      warmth: v.union(v.literal("first_degree"), v.literal("former_colleague"), v.literal("alumni"), v.literal("cold")),
      // Some export rows carry an email column; the contacts table does not store it.
      email: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const deleted = await wipeByUser(ctx, "contacts", args.userId);
    for (const c of args.contacts) {
      await ctx.db.insert("contacts", {
        userId: args.userId,
        firstName: c.firstName,
        lastName: c.lastName,
        profileUrl: c.profileUrl,
        company: c.company,
        position: c.position,
        connectedOn: c.connectedOn,
        warmth: c.warmth,
      });
    }
    return { inserted: args.contacts.length, deleted };
  },
});

export const bulkAnswers = mutation({
  args: {
    userId: v.id("users"),
    entries: v.array(v.object({
      question: v.string(),
      answer: v.string(),
      source: v.union(v.literal("linkedin_export"), v.literal("onboarding"), v.literal("application")),
      sensitive: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    const deleted = await wipeByUser(ctx, "answerBank", args.userId);
    for (const e of args.entries) {
      await ctx.db.insert("answerBank", { userId: args.userId, ...e });
    }
    return { inserted: args.entries.length, deleted };
  },
});

export const bulkStories = mutation({
  args: {
    userId: v.id("users"),
    stories: v.array(v.object({
      title: v.string(),
      text: v.string(),
      competencies: v.array(v.string()),
      sourceDoc: v.string(),
      excerpt: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const deleted = await wipeByUser(ctx, "starStories", args.userId);
    for (const s of args.stories) {
      await ctx.db.insert("starStories", { userId: args.userId, ...s });
    }
    return { inserted: args.stories.length, deleted };
  },
});
