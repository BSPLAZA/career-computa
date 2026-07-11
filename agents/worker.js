// worker.js: long-running poller. Claims the next queued task every 5s and runs intake.
// Errors mark the task failed and stay visible; the worker keeps going.
// With ANNOUNCE=1 (the start script default) every delivery invokes
// scripts/announce.mjs: the mp3 is always written, and it plays out loud (afplay).
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadEnv, REPO_ROOT } from './env.js';
import { makeStore } from './store.js';
import { runIntake } from './intake.js';
import { loadUserContext } from './user-context.js';

const POLL_MS = 5000;
loadEnv();

// Fire-and-forget voice announcement of a completed task. Never blocks or fails the task.
function announceDelivery(text) {
  if (process.env.ANNOUNCE !== '1') return;
  try {
    const child = spawn('node', [join(REPO_ROOT, 'scripts', 'announce.mjs'), '--text', text], {
      cwd: REPO_ROOT, stdio: 'ignore', detached: true,
    });
    child.unref();
  } catch (err) {
    console.log(`announce spawn failed (task unaffected): ${err.message}`);
  }
}

const store = makeStore();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
log(`worker up, store=${store.kind}, polling every ${POLL_MS / 1000}s`);

let running = true;
process.on('SIGINT', () => { running = false; log('shutting down after current task'); });

async function tick() {
  let task = null;
  try {
    task = await store.claimNextQueuedTask();
  } catch (err) {
    log(`claim error (store unreachable?): ${err.message}`);
    return;
  }
  if (!task) return;
  log(`claimed task ${task._id} kind=${task.kind} input=${task.input}`);
  try {
    if (task.kind !== 'intake') {
      await store.setTaskStatus({ taskId: task._id, status: 'escalated', escalation: { reason: 'unsupported_kind', context: `worker only runs kind=intake for now; got ${task.kind}` } });
      log(`task ${task._id} escalated: unsupported kind ${task.kind}`);
      return;
    }
    const { user, profile, resumeText } = await loadUserContext(store, task.userId);
    const result = await runIntake({ store, task, user, profile, resumeText, log: (m) => log(` ${m}`) });
    log(`task ${task._id} -> ${result.taskStatus}: ${result.summary}`);
    if (result.taskStatus === 'delivered') {
      announceDelivery(`Career agency update. ${result.summary.split(';')[0]}.`);
    }
  } catch (err) {
    log(`task ${task._id} crashed: ${err.message}`);
    try { await store.setTaskStatus({ taskId: task._id, status: 'failed' }); } catch { /* stay alive */ }
  }
}

while (running) {
  await tick();
  await new Promise((r) => setTimeout(r, POLL_MS));
}
log('worker stopped');
