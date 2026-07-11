// End-to-end verification of the deployed Convex backend. Run: npx tsx scripts/seed-verify.ts
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { readFileSync } from "node:fs";

const url = readFileSync(new URL("../.convex-url", import.meta.url), "utf8").trim();
const c = new ConvexHttpClient(url);

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok: " + msg);
}

async function main() {
  // signup + idempotency
  const s1 = await c.mutation(api.users.signup, { email: "smoke-test@example.com", isTeam: true });
  assert(s1.telegramDeepLink.startsWith("https://t.me/CareerAgencyBriefs_bot?start="), "signup returns deep link");
  const s2 = await c.mutation(api.users.signup, { email: "smoke-test@example.com" });
  assert(s2.existing && s2.userId === s1.userId, "signup idempotent on email");

  // bindTelegram
  const bind = await c.mutation(api.users.bindTelegram, { signupToken: s1.signupToken, chatId: "12345" });
  assert(bind.ok, "bindTelegram by token");
  const badBind = await c.mutation(api.users.bindTelegram, { signupToken: "nope", chatId: "1" });
  assert(!badBind.ok, "bindTelegram rejects unknown token");

  // company + target + job dedupe
  const co = await c.mutation(api.companies.upsertCompany, { name: "Anthropic", atsType: "greenhouse", boardToken: "anthropic", pollable: true });
  assert(!co.created, "upsertCompany dedupes seeded Anthropic");
  await c.mutation(api.companies.addTarget, { userId: s1.userId, companyId: co.companyId });
  const t2 = await c.mutation(api.companies.addTarget, { userId: s1.userId, companyId: co.companyId });
  assert(!t2.created, "addTarget dedupes");

  const j1 = await c.mutation(api.jobs.upsertJob, { userId: s1.userId, companyId: co.companyId, title: "Product Manager, Agents", canonicalUrl: "https://boards.greenhouse.io/anthropic/jobs/999", applyUrl: "https://boards.greenhouse.io/anthropic/jobs/999" });
  const j2 = await c.mutation(api.jobs.upsertJob, { userId: s1.userId, companyId: co.companyId, title: "Product Manager, Agents", canonicalUrl: "https://boards.greenhouse.io/anthropic/jobs/999", applyUrl: "https://boards.greenhouse.io/anthropic/jobs/999" });
  assert(j2.deduped && j2.jobId === j1.jobId, "upsertJob dedupes on canonicalUrl");
  const j3 = await c.mutation(api.jobs.upsertJob, { userId: s1.userId, companyId: co.companyId, title: "Product Manager -- Agents!", canonicalUrl: "https://jobs.example.com/other-url", applyUrl: "https://jobs.example.com/other-url" });
  assert(j3.deduped && j3.jobId === j1.jobId, "upsertJob dedupes on company + normalized title");

  await c.mutation(api.jobs.assessJob, { jobId: j1.jobId, fitScore: 82, caveats: ["comp range not posted"], fitEvidence: [{ jdLine: "agents experience", resumeLine: "shipped agent product" }] });

  // task lifecycle
  const task = await c.mutation(api.tasks.createTask, { userId: s1.userId, kind: "intake", input: String(j1.jobId), jobId: j1.jobId });
  const claimed = await c.mutation(api.tasks.claimNextQueuedTask, {});
  assert(claimed && claimed._id === task.taskId && claimed.status === "running", "claimNextQueuedTask claims FIFO and marks running");

  // run + steps + artifact
  const run = await c.mutation(api.runs.appendRun, { taskId: task.taskId, userId: s1.userId });
  const st1 = await c.mutation(api.runs.appendRunStep, { runId: run.runId, agentRole: "manager", action: "plan", inputSummary: "job intake", outputSummary: "delegated to scout", tokensIn: 100, tokensOut: 50, costUsd: 0.001, ms: 800, status: "ok" });
  const st2 = await c.mutation(api.runs.appendRunStep, { runId: run.runId, parentSeq: st1.seq, agentRole: "scout", action: "fit_score", inputSummary: "jd", outputSummary: "82", tokensIn: 200, tokensOut: 80, costUsd: 0.002, ms: 1200, status: "ok" });
  assert(st2.seq === st1.seq + 1, "appendRunStep auto-assigns seq");

  const emDash = String.fromCharCode(0x2014);
  const art = await c.mutation(api.runs.appendArtifact, { runId: run.runId, taskId: task.taskId, userId: s1.userId, kind: "delivery_brief", content: `Brief for role${emDash}strong fit`, sourceUrls: ["https://boards.greenhouse.io/anthropic/jobs/999"] });

  // digest queue shows undelivered artifact
  const dq = await c.query(api.public.digestQueue, { userId: s1.userId });
  assert(dq.some((r: any) => r.artifactId === art.artifactId), "digestQueue lists pending artifact");
  assert(!dq[0].preview.includes(emDash), "em dash linted out of artifact content");

  await c.mutation(api.users.markFirstUse, { userId: s1.userId, kind: "intake", runId: run.runId });
  await c.mutation(api.runs.markArtifactDelivered, { artifactId: art.artifactId, via: "telegram" });
  await c.mutation(api.runs.finishRun, { runId: run.runId, success: true });
  await c.mutation(api.tasks.completeTask, { taskId: task.taskId });

  // trace tree
  const trace = await c.query(api.runs.traceTree, { runId: run.runId });
  assert(trace.steps.length === 2 && trace.tree.length === 1 && trace.tree[0].children.length === 1, "traceTree nests child step under parent");
  assert(trace.run.costUsd > 0.0029 && trace.run.tokensIn === 300, "run totals rolled up from steps");

  // feedback + escalation path
  await c.mutation(api.feedback.recordFeedback, { userId: s1.userId, artifactId: art.artifactId, verdict: "approve" });
  const task2 = await c.mutation(api.tasks.createTask, { userId: s1.userId, kind: "followup", input: "ambiguous ask" });
  await c.mutation(api.tasks.claimNextQueuedTask, {});
  await c.mutation(api.tasks.escalateTask, { taskId: task2.taskId, reason: "needs human judgment", context: "ambiguous ask" });

  // public queries
  const ledger = await c.query(api.public.ledger, {});
  const row = ledger.find((r: any) => r.taskId === task.taskId);
  assert(row && row.maskedEmail === "s***@example.com" && row.success === true && row.agentsInvolved.includes("scout"), "ledger row masked with agents and success");
  const counters = await c.query(api.public.counters, {});
  assert(counters.tasksCompletedToday.total >= 1 && counters.tasksCompletedToday.judge === counters.tasksCompletedToday.total - counters.tasksCompletedToday.total, "counters split judge vs total (team user excluded from judge)");
  assert(counters.signupsWithFirstUse.total >= 1, "firstUse counted");
  assert(counters.jobsDiscovered.total >= 1 && counters.briefsDelivered.total >= 1, "jobs and briefs counted");

  const board = await c.query(api.jobs.pipelineBoard, { userId: s1.userId });
  assert(board.assessed && board.assessed.length === 1 && (board.assessed[0] as any).companyName === "Anthropic", "pipelineBoard groups by state with company name");

  // delete-my-data wipes everything
  const del = await c.mutation(api.users.deleteMyData, { userId: s1.userId });
  assert(del.ok && del.counts.tasks === 2 && del.counts.jobs === 1 && del.counts.runSteps === 2, "deleteMyData removed all rows");
  const gone = await c.query(api.users.getBySignupToken, { signupToken: s1.signupToken });
  assert(gone === null, "user gone after delete");

  console.log("\nALL SMOKE TESTS PASSED against " + url);
}

main().catch((e) => { console.error(e); process.exit(1); });
