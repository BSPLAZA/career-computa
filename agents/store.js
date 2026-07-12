// store.js: persistence boundary for the pipeline lane.
// If repo-root .convex-url exists, talks to Convex over its public HTTP API (no npm dep needed).
// Otherwise falls back to a local JSONL stub in agents/.local-store/ with the same interface,
// so the pipeline runs end to end before the convex lane lands.
//
// Convex function paths verified against convex/*.ts as of 15:10 PDT:
//   tasks:createTask, tasks:claimNextQueuedTask, tasks:completeTask, tasks:escalateTask
//   runs:appendRun, runs:finishRun, runs:appendRunStep, runs:appendArtifact, runs:markArtifactDelivered
//   jobs:upsertJob, jobs:assessJob | companies:upsertCompany | users:getUser, users:signup, users:markFirstUse
// Validators are strict: only pass declared fields. Run totals roll up from appendRunStep on the server.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './env.js';

const LOCAL_DIR = join(dirname(fileURLToPath(import.meta.url)), '.local-store');

// ---------- Convex-backed store ----------
class ConvexStore {
  constructor(deploymentUrl) {
    this.url = deploymentUrl.replace(/\/$/, '');
    this.kind = 'convex';
  }
  async call(endpoint, path, args) {
    const res = await fetch(`${this.url}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, args: args || {}, format: 'json' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === 'error') {
      throw new Error(`convex ${path}: ${data.errorMessage || res.status}`);
    }
    return data.value;
  }
  mutation(path, args) { return this.call('mutation', path, args); }
  query(path, args) { return this.call('query', path, args); }

  claimNextQueuedTask() { return this.mutation('tasks:claimNextQueuedTask', {}); }
  async createTask({ userId, kind, input, jobId }) {
    const r = await this.mutation('tasks:createTask', { userId, kind, input, ...(jobId ? { jobId } : {}) });
    return r.taskId;
  }
  async setTaskStatus({ taskId, status, escalation }) {
    if (status === 'running') {
      // One-shot CLI path: mark the task running so a parallel worker cannot double-claim it.
      return this.mutation('tasks:startTask', { taskId }).catch(() => {});
    }
    if (status === 'escalated') {
      return this.mutation('tasks:escalateTask', { taskId, reason: escalation?.reason || 'unspecified', context: escalation?.context || '' });
    }
    return this.mutation('tasks:completeTask', { taskId, status });
  }
  // Bind the task to the job the pipeline picked (first pick wins server-side).
  setTaskJob({ taskId, jobId }) { return this.mutation('tasks:setTaskJob', { taskId, jobId }); }
  async createRun({ taskId, userId }) {
    const r = await this.mutation('runs:appendRun', { taskId, userId });
    return r.runId;
  }
  finishRun({ runId, success, error }) {
    return this.mutation('runs:finishRun', { runId, success: !!success, ...(error ? { error } : {}) });
  }
  async insertRunStep(step) {
    const r = await this.mutation('runs:appendRunStep', step);
    return r.stepId;
  }
  async insertArtifact({ runId, taskId, userId, kind, content, variantId, gateResults, sourceUrls }) {
    const r = await this.mutation('runs:appendArtifact', {
      runId, taskId, userId, kind, content,
      ...(variantId ? { variantId } : {}),
      ...(gateResults ? { gateResults } : {}),
      ...(sourceUrls ? { sourceUrls } : {}),
    });
    return r.artifactId;
  }
  markArtifactDelivered({ artifactId, via }) { return this.mutation('runs:markArtifactDelivered', { artifactId, via }); }
  async upsertCompany({ name, atsType, boardToken, pollable = true }) {
    const r = await this.mutation('companies:upsertCompany', { name, atsType, boardToken, pollable });
    return r.companyId;
  }
  async upsertJob({ userId, companyId, title, canonicalUrl, applyUrl, postedAt, location, isRemote, compRange }) {
    const r = await this.mutation('jobs:upsertJob', {
      userId, companyId, title, canonicalUrl, applyUrl,
      ...(postedAt !== undefined ? { postedAt } : {}),
      ...(location !== undefined && location !== null ? { location } : {}),
      ...(isRemote !== undefined ? { isRemote } : {}),
      ...(compRange !== undefined && compRange !== null ? { compRange } : {}),
    });
    return { jobId: r.jobId, deduped: r.deduped };
  }
  assessJob(args) { return this.mutation('jobs:assessJob', args); }
  // canonical URLs of jobs already assessed (or further along) for this user
  assessedUrlsForUser(userId) { return this.query('jobs:assessedUrlsForUser', { userId }); }
  // per-action-kind approval streaks and graduation flags (trust graduation)
  trustStatus(userId) { return this.query('trust:status', { userId }); }
  markFirstUse(args) { return this.mutation('users:markFirstUse', args).catch(() => {}); }
  async signup({ email, isTeam = true, demoMode = false }) {
    const r = await this.mutation('users:signup', { email, isTeam, demoMode });
    return r.userId;
  }
  getUser(userId) { return this.query('users:getUser', { userId }); }
}

// ---------- Local JSONL stub ----------
class LocalStore {
  constructor() {
    this.kind = 'local';
    mkdirSync(LOCAL_DIR, { recursive: true });
    this.n = Date.now() % 1_000_000;
  }
  file(table) { return join(LOCAL_DIR, `${table}.jsonl`); }
  readAll(table) {
    const p = this.file(table);
    if (!existsSync(p)) return [];
    const byId = new Map(); // last write per _id wins
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      byId.set(row._id, { ...(byId.get(row._id) || {}), ...row });
    }
    return [...byId.values()];
  }
  append(table, row) { appendFileSync(this.file(table), JSON.stringify(row) + '\n'); }
  insert(table, doc) {
    const _id = `local_${table}_${++this.n}`;
    this.append(table, { _id, ...doc });
    return _id;
  }
  patch(table, _id, fields) { this.append(table, { _id, ...fields }); }

  async claimNextQueuedTask() {
    const tasks = this.readAll('tasks').filter((t) => t.status === 'queued');
    tasks.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const t = tasks[0];
    if (!t) return null;
    this.patch('tasks', t._id, { status: 'running' });
    return { ...t, status: 'running' };
  }
  async setTaskStatus({ taskId, status, escalation }) {
    const done = ['delivered', 'failed', 'escalated'].includes(status);
    this.patch('tasks', taskId, { status, ...(done ? { completedAt: Date.now() } : {}), ...(escalation ? { escalation } : {}) });
  }
  async setTaskJob({ taskId, jobId }) {
    const task = this.readAll('tasks').find((t) => t._id === taskId);
    if (!task) return { ok: false, error: 'unknown_task' };
    if (task.jobId !== undefined) return { ok: true, alreadySet: true };
    this.patch('tasks', taskId, { jobId });
    return { ok: true, alreadySet: false };
  }
  async createRun({ taskId, userId }) { return this.insert('runs', { taskId, userId, startedAt: Date.now(), costUsd: 0, tokensIn: 0, tokensOut: 0 }); }
  async finishRun({ runId, success, error }) {
    const steps = this.readAll('runSteps').filter((s) => s.runId === runId);
    const sum = (k) => steps.reduce((a, s) => a + (s[k] || 0), 0);
    this.patch('runs', runId, {
      finishedAt: Date.now(), success: !!success, ...(error ? { error } : {}),
      costUsd: sum('costUsd'), tokensIn: sum('tokensIn'), tokensOut: sum('tokensOut'),
    });
  }
  async insertRunStep(step) { return this.insert('runSteps', step); }
  async insertArtifact(a) { return this.insert('artifacts', a); }
  async markArtifactDelivered({ artifactId, via }) { this.patch('artifacts', artifactId, { deliveredVia: via, deliveredAt: Date.now() }); }
  async upsertCompany({ name, atsType, boardToken, pollable = true }) {
    const existing = this.readAll('companies').find((c) => c.atsType === atsType && c.boardToken === boardToken);
    if (existing) return existing._id;
    return this.insert('companies', { name, atsType, boardToken, pollable });
  }
  async upsertJob(job) {
    const existing = this.readAll('jobs').find((j) => j.userId === job.userId && j.canonicalUrl === job.canonicalUrl);
    if (existing) { this.patch('jobs', existing._id, job); return { jobId: existing._id, deduped: true }; }
    return { jobId: this.insert('jobs', { discoveredAt: Date.now(), caveats: [], state: 'discovered', ...job }), deduped: false };
  }
  async assessJob({ jobId, fitScore, caveats, fitEvidence, hardFilterResult }) {
    const rejected = hardFilterResult?.rejected === true;
    this.patch('jobs', jobId, { fitScore, caveats, fitEvidence, hardFilterResult, state: rejected ? 'auto_rejected' : 'assessed' });
    return { ok: true, state: rejected ? 'auto_rejected' : 'assessed' };
  }
  async assessedUrlsForUser(userId) {
    const DONE = new Set(['assessed', 'queued', 'delivered', 'applied', 'screening', 'interviewing']);
    return this.readAll('jobs').filter((j) => j.userId === userId && DONE.has(j.state)).map((j) => j.canonicalUrl);
  }
  async trustStatus() { return { threshold: 5, kinds: [] }; /* local stub: no graduation offline */ }
  async markFirstUse() { /* local no-op */ }
  async signup({ email, isTeam = true, demoMode = false }) {
    const existing = this.readAll('users').find((u) => u.email === email);
    if (existing) return existing._id;
    return this.insert('users', { email, signedUpAt: Date.now(), isTeam, demoMode, signupToken: `local-${Date.now()}` });
  }
  async getUser(userId) { return this.readAll('users').find((u) => u._id === userId) || null; }

  // enqueue a task (status queued unless overridden)
  async createTask(task) { return this.insert('tasks', { status: 'queued', createdAt: Date.now(), ...task }); }
}

export function makeStore() {
  // Test hook: point the store at any deployment (or an unreachable one) without
  // touching the repo-root .convex-url that other lanes read.
  if (process.env.CONVEX_URL_OVERRIDE) return new ConvexStore(process.env.CONVEX_URL_OVERRIDE);
  const urlFile = join(REPO_ROOT, '.convex-url');
  if (existsSync(urlFile)) {
    const url = readFileSync(urlFile, 'utf8').trim();
    if (url) return new ConvexStore(url);
  }
  return new LocalStore();
}

export { LocalStore, ConvexStore, LOCAL_DIR };
