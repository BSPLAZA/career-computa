import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Dedupe key: (atsType, boardToken) when a boardToken exists, else exact name.
export const upsertCompany = mutation({
  args: {
    name: v.string(),
    atsType: v.union(v.literal("greenhouse"), v.literal("lever"), v.literal("ashby"), v.literal("manual")),
    boardToken: v.optional(v.string()),
    pollable: v.boolean(),
    tier: v.optional(v.number()),
    briefMd: v.optional(v.string()),
    briefSourceUrls: v.optional(v.array(v.string())),
    lastResearchedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let existing = null;
    if (args.boardToken !== undefined) {
      existing = await ctx.db
        .query("companies")
        .withIndex("by_boardToken", (q) => q.eq("atsType", args.atsType).eq("boardToken", args.boardToken))
        .unique();
    }
    if (!existing) {
      existing = await ctx.db
        .query("companies")
        .withIndex("by_name", (q) => q.eq("name", args.name))
        .first();
    }
    if (existing) {
      await ctx.db.patch(existing._id, { ...args });
      return { companyId: existing._id, created: false };
    }
    const companyId = await ctx.db.insert("companies", { ...args });
    return { companyId, created: true };
  },
});

export const addTarget = mutation({
  args: { userId: v.id("users"), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("targetCompanies")
      .withIndex("by_user_company", (q) => q.eq("userId", args.userId).eq("companyId", args.companyId))
      .unique();
    if (existing) return { targetId: existing._id, created: false };
    const targetId = await ctx.db.insert("targetCompanies", { userId: args.userId, companyId: args.companyId });
    return { targetId, created: true };
  },
});

export const listCompanies = query({
  args: { pollableOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("companies").collect();
    return args.pollableOnly ? all.filter((c) => c.pollable) : all;
  },
});

export const targetsForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const targets = await ctx.db
      .query("targetCompanies")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    const companies = [];
    for (const t of targets) {
      const c = await ctx.db.get(t.companyId);
      if (c) companies.push(c);
    }
    return companies;
  },
});
