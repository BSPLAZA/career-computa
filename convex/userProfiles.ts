// Profile reads for the pipeline lane (agents/user-context.js calls userProfiles:getByUserId).
import { query } from "./_generated/server";
import { v } from "convex/values";

export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) =>
    ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique(),
});

// Context stats for a user, used to verify onboarding landed.
export const contextStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const count = async (table: "contacts" | "answerBank" | "starStories") =>
      (
        await ctx.db
          .query(table)
          .withIndex("by_userId", (q) => q.eq("userId", args.userId))
          .collect()
      ).length;
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    return {
      hasProfile: profile !== null,
      profileName: profile?.name ?? null,
      contacts: await count("contacts"),
      answerBank: await count("answerBank"),
      starStories: await count("starStories"),
    };
  },
});
