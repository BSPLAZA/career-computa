import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Creates a run for a task. Cost and token totals start at zero and roll up from steps.
export const appendRun = mutation({
  args: { taskId: v.id("tasks"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const runId = await ctx.db.insert("runs", {
      taskId: args.taskId,
      userId: args.userId,
      startedAt: Date.now(),
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
    });
    return { runId };
  },
});

export const finishRun = mutation({
  args: {
    runId: v.id("runs"),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { ok: false as const, error: "unknown_run" };
    await ctx.db.patch(args.runId, {
      finishedAt: Date.now(),
      success: args.success,
      error: args.error,
    });
    return { ok: true as const };
  },
});

// Every pipeline step writes one of these; seq auto-assigns when omitted.
// Step cost and tokens roll up onto the parent run.
export const appendRunStep = mutation({
  args: {
    runId: v.id("runs"),
    seq: v.optional(v.number()),
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
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("unknown_run");
    let seq = args.seq;
    if (seq === undefined) {
      const last = await ctx.db
        .query("runSteps")
        .withIndex("by_run_seq", (q) => q.eq("runId", args.runId))
        .order("desc")
        .first();
      seq = last ? last.seq + 1 : 1;
    }
    const stepId = await ctx.db.insert("runSteps", {
      runId: args.runId,
      seq,
      parentSeq: args.parentSeq,
      agentRole: args.agentRole,
      action: args.action,
      inputSummary: args.inputSummary,
      outputSummary: args.outputSummary,
      tokensIn: args.tokensIn,
      tokensOut: args.tokensOut,
      costUsd: args.costUsd,
      ms: args.ms,
      status: args.status,
    });
    await ctx.db.patch(args.runId, {
      costUsd: run.costUsd + args.costUsd,
      tokensIn: run.tokensIn + args.tokensIn,
      tokensOut: run.tokensOut + args.tokensOut,
    });
    return { stepId, seq };
  },
});

// Artifact writer. Lints em dashes out of content per invariant 3.
export const appendArtifact = mutation({
  args: {
    runId: v.id("runs"),
    taskId: v.id("tasks"),
    userId: v.id("users"),
    kind: v.union(v.literal("fit_report"), v.literal("research_brief"), v.literal("resume_pdf"), v.literal("connection_note"), v.literal("dm_draft"), v.literal("delivery_brief")),
    content: v.string(),
    variantId: v.optional(v.string()),
    gateResults: v.optional(v.array(v.object({ gate: v.string(), pass: v.boolean(), note: v.optional(v.string()) }))),
    sourceUrls: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const content = args.content.replace(/\s*\u2014\s*/g, ", ");
    if (args.kind === "connection_note" && content.length > 300) {
      throw new Error("connection_note exceeds 300 chars (invariant 1)");
    }
    const artifactId = await ctx.db.insert("artifacts", {
      runId: args.runId,
      taskId: args.taskId,
      userId: args.userId,
      kind: args.kind,
      content,
      variantId: args.variantId,
      gateResults: args.gateResults,
      sourceUrls: args.sourceUrls,
    });
    return { artifactId };
  },
});

// Marks an artifact as sent. Callers enforce the tap boundary before invoking this.
export const markArtifactDelivered = mutation({
  args: {
    artifactId: v.id("artifacts"),
    via: v.union(v.literal("telegram"), v.literal("link")),
  },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) return { ok: false as const, error: "unknown_artifact" };
    await ctx.db.patch(args.artifactId, { deliveredVia: args.via, deliveredAt: Date.now() });
    return { ok: true as const };
  },
});

// RunSteps grouped into a tree by parentSeq. Flat list included for tables.
export const traceTree = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("runSteps")
      .withIndex("by_run_seq", (q) => q.eq("runId", args.runId))
      .order("asc")
      .collect();
    type Node = (typeof steps)[number] & { children: Node[] };
    const nodes: Node[] = steps.map((s) => ({ ...s, children: [] }));
    const bySeq = new Map<number, Node>(nodes.map((n) => [n.seq, n]));
    const roots: Node[] = [];
    for (const n of nodes) {
      const parent = n.parentSeq !== undefined ? bySeq.get(n.parentSeq) : undefined;
      if (parent && parent !== n) parent.children.push(n);
      else roots.push(n);
    }
    const run = await ctx.db.get(args.runId);
    return { run, steps, tree: roots };
  },
});
