#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OWNER_USER_ID = "kn7baxvjdz6c1bz2wkwwtkjj618ab12r";

function client() {
  const url = readFileSync(resolve(ROOT, ".convex-url"), "utf8").trim();
  if (!url) throw new Error(".convex-url is empty");
  return new ConvexHttpClient(url);
}

function parseArgs(argv) {
  const index = argv.indexOf("--user");
  if (index === -1) return { userId: process.env.AGENCY_USER_ID || OWNER_USER_ID };
  if (!argv[index + 1]) throw new Error("--user requires an id");
  return { userId: argv[index + 1] };
}

async function resolveOwnerUserId(api, explicitUserId) {
  const user = await api.query("users:getUser", { userId: explicitUserId });
  if (!user) throw new Error(`Unknown user: ${explicitUserId}`);
  return explicitUserId;
}

export function formatDigest(data) {
  const clip = (value, limit = 180) => value && value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
  const states = Object.entries(data.jobsByState)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([state, count]) => `${state} ${count}`)
    .join(", ") || "none";
  const jobs = data.topJobs.length
    ? data.topJobs.map((job, index) => `  ${index + 1}. ${job.fitScore ?? "?"} ${job.companyName}: ${job.title} | caveat: ${clip(job.caveat) || "none recorded"} | evidence: ${clip(job.evidence) || "none recorded"} | ${job.applyUrl}`).join("\n")
    : "  none";
  const exceptions = data.exceptions.length
    ? data.exceptions.map((item) => `  ${item.status} ${item.taskId}: ${item.reason || "no reason recorded"}`).join("\n")
    : "  none";
  const trust = data.trust.kinds
    .map((item) => `${item.kind}: ${item.streak}/${data.trust.threshold}${item.graduated ? " graduated" : `, ${item.remaining} remaining`}`)
    .join(", ");
  return [
    `CAREER AGENCY OWNER DIGEST | ${new Date(data.asOf).toISOString()}`,
    `Delivered today: ${data.deliveredToday}`,
    `Jobs by state: ${states}`,
    "Top fit, undelivered:", jobs,
    "Exceptions:", exceptions,
    `Trust: ${trust || "no streak data"}`,
  ].join("\n");
}

export async function getDigest(userId) {
  const api = client();
  const ownerUserId = await resolveOwnerUserId(api, userId);
  const [counters, board, tasks, trust] = await Promise.all([
    api.query("public:counters", {}),
    api.query("jobs:pipelineBoard", { userId: ownerUserId }),
    api.query("tasks:tasksForUser", { userId: ownerUserId }),
    api.query("trust:status", { userId: ownerUserId }),
  ]);
  const jobs = Object.values(board).flat();
  const undeliveredStates = new Set(["discovered", "assessed", "auto_rejected", "queued"]);
  const topJobs = jobs
    .filter((job) => undeliveredStates.has(job.state) && typeof job.fitScore === "number")
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 3)
    .map((job) => ({
      title: job.title,
      companyName: job.companyName,
      fitScore: job.fitScore,
      applyUrl: job.applyUrl,
      caveat: job.caveats?.[0] || job.hardFilterResult?.reason || null,
      evidence: job.fitEvidence?.[0]
        ? `${job.fitEvidence[0].jdLine} <> ${job.fitEvidence[0].resumeLine}`
        : null,
    }));
  const jobsByState = Object.fromEntries(Object.entries(board).map(([state, rows]) => [state, rows.length]));
  const exceptions = tasks
    .filter((task) => task.status === "failed" || task.status === "escalated")
    .slice(0, 10)
    .map((task) => ({ taskId: task._id, status: task.status, reason: task.escalation?.reason || null }));
  return formatDigest({
    asOf: counters.asOf,
    deliveredToday: tasks.filter((task) => task.status === "delivered" && (task.completedAt || 0) >= counters.dayStartPacific).length,
    jobsByState,
    topJobs,
    exceptions,
    trust,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  getDigest(parseArgs(process.argv.slice(2)).userId).then(console.log).catch((error) => {
    console.error(`agency-status: ${error.message}`);
    process.exitCode = 1;
  });
}
