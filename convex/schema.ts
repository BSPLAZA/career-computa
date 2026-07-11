// Convex translation of contracts/schema.ts (FROZEN). Convex supplies _id; all other fields mirror the contract.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    email: v.string(),
    signedUpAt: v.number(),
    firstUseAt: v.optional(v.number()),
    firstUseKind: v.optional(v.union(v.literal("intake"), v.literal("export_upload"), v.literal("resume_upload"))),
    firstRunId: v.optional(v.id("runs")),
    isTeam: v.boolean(),
    demoMode: v.boolean(),
    telegramChatId: v.optional(v.string()),
    signupToken: v.string(),
    deleteRequestedAt: v.optional(v.number()),
  })
    .index("by_signupToken", ["signupToken"])
    .index("by_email", ["email"]),

  userProfiles: defineTable({
    userId: v.id("users"),
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
  }).index("by_userId", ["userId"]),

  contacts: defineTable({
    userId: v.id("users"),
    firstName: v.string(),
    lastName: v.string(),
    profileUrl: v.optional(v.string()),
    company: v.string(),
    position: v.string(),
    connectedOn: v.optional(v.string()),
    warmth: v.union(v.literal("first_degree"), v.literal("former_colleague"), v.literal("alumni"), v.literal("cold")),
  }).index("by_userId", ["userId"]),

  answerBank: defineTable({
    userId: v.id("users"),
    question: v.string(),
    answer: v.string(),
    source: v.union(v.literal("linkedin_export"), v.literal("onboarding"), v.literal("application")),
    sensitive: v.boolean(),
  }).index("by_userId", ["userId"]),

  starStories: defineTable({
    userId: v.id("users"),
    title: v.string(),
    text: v.string(),
    competencies: v.array(v.string()),
    sourceDoc: v.string(),
    excerpt: v.string(),
  }).index("by_userId", ["userId"]),

  companies: defineTable({
    name: v.string(),
    atsType: v.union(v.literal("greenhouse"), v.literal("lever"), v.literal("ashby"), v.literal("manual")),
    boardToken: v.optional(v.string()),
    pollable: v.boolean(),
    tier: v.optional(v.number()),
    briefMd: v.optional(v.string()),
    briefSourceUrls: v.optional(v.array(v.string())),
    lastResearchedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_boardToken", ["atsType", "boardToken"]),

  targetCompanies: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
  })
    .index("by_userId", ["userId"])
    .index("by_user_company", ["userId", "companyId"]),

  jobs: defineTable({
    userId: v.id("users"),
    companyId: v.id("companies"),
    title: v.string(),
    canonicalUrl: v.string(),
    applyUrl: v.string(),
    postedAt: v.optional(v.number()),
    discoveredAt: v.number(),
    location: v.optional(v.string()),
    isRemote: v.optional(v.boolean()),
    compRange: v.optional(v.string()),
    fitScore: v.optional(v.number()),
    caveats: v.array(v.string()),
    fitEvidence: v.optional(v.array(v.object({ jdLine: v.string(), resumeLine: v.string() }))),
    hardFilterResult: v.optional(v.object({ rejected: v.boolean(), reason: v.optional(v.string()) })),
    state: v.union(
      v.literal("discovered"), v.literal("assessed"), v.literal("auto_rejected"), v.literal("queued"),
      v.literal("delivered"), v.literal("applied"), v.literal("screening"), v.literal("interviewing"),
      v.literal("closed"), v.literal("ghosted"),
    ),
    // Internal dedupe helper: hash of lowercased alphanumeric title. Not part of the contract surface.
    normTitleHash: v.string(),
  })
    .index("by_user_state", ["userId", "state"])
    .index("by_user_canonicalUrl", ["userId", "canonicalUrl"])
    .index("by_user_company_titleHash", ["userId", "companyId", "normTitleHash"]),

  tasks: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("intake"), v.literal("pasted_message"), v.literal("followup"), v.literal("judge_assigned")),
    input: v.string(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("delivered"), v.literal("failed"), v.literal("escalated")),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    jobId: v.optional(v.id("jobs")),
    escalation: v.optional(v.object({ reason: v.string(), context: v.string() })),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_userId", ["userId"]),

  runs: defineTable({
    taskId: v.id("tasks"),
    userId: v.id("users"),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    costUsd: v.number(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    success: v.optional(v.boolean()),
    error: v.optional(v.string()),
  })
    .index("by_taskId", ["taskId"])
    .index("by_userId", ["userId"]),

  runSteps: defineTable({
    runId: v.id("runs"),
    seq: v.number(),
    parentSeq: v.optional(v.number()),
    agentRole: v.union(v.literal("manager"), v.literal("scout"), v.literal("researcher"), v.literal("drafter"), v.literal("pipeline"), v.literal("reviewer")),
    action: v.string(),
    inputSummary: v.string(),
    outputSummary: v.string(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    costUsd: v.number(),
    ms: v.number(),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("escalated"), v.literal("revised")),
  }).index("by_run_seq", ["runId", "seq"]),

  artifacts: defineTable({
    runId: v.id("runs"),
    taskId: v.id("tasks"),
    userId: v.id("users"),
    kind: v.union(v.literal("fit_report"), v.literal("research_brief"), v.literal("resume_pdf"), v.literal("connection_note"), v.literal("dm_draft"), v.literal("delivery_brief")),
    content: v.string(),
    variantId: v.optional(v.string()),
    gateResults: v.optional(v.array(v.object({ gate: v.string(), pass: v.boolean(), note: v.optional(v.string()) }))),
    sourceUrls: v.optional(v.array(v.string())),
    deliveredVia: v.optional(v.union(v.literal("telegram"), v.literal("link"))),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_taskId", ["taskId"])
    .index("by_runId", ["runId"])
    .index("by_kind", ["kind"]),

  // Internal runtime config (not part of the frozen contract surface). Currently:
  // key "trust_threshold" holds the clean-approval streak needed for graduation (demo default 5).
  config: defineTable({
    key: v.string(),
    value: v.number(),
  }).index("by_key", ["key"]),

  feedback: defineTable({
    userId: v.id("users"),
    artifactId: v.optional(v.id("artifacts")),
    jobId: v.optional(v.id("jobs")),
    verdict: v.union(v.literal("approve"), v.literal("edit"), v.literal("skip"), v.literal("thumbs_down")),
    editDiff: v.optional(v.string()),
    reason: v.optional(v.string()),
    at: v.number(),
  }).index("by_userId", ["userId"]),
});
