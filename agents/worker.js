// worker.js: long-running poller. Claims the next queued task every 5s and runs intake.
// Errors mark the task failed and stay visible; the worker keeps going.
import { loadEnv } from './env.js';
import { makeStore } from './store.js';
import { runIntake } from './intake.js';
import { loadUserContext } from './user-context.js';

const POLL_MS = 5000;
loadEnv();

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
