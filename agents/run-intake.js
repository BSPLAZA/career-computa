// run-intake.js: one-shot CLI for testing and demo.
// Usage:
//   node agents/run-intake.js --board sierra --user <id> [--profile path.json] [--top 1]
//                             [--no-deliver] [--enqueue]
// --profile points at a JSON file { user?, profile?, resumeText? } used instead of the store lookup.
// --no-deliver skips the Telegram send even if a chat is bound (brief link path still emitted).
// --enqueue only creates a queued task (for exercising worker.js) and exits.
import { readFileSync } from 'node:fs';
import { loadEnv } from './env.js';
import { makeStore } from './store.js';
import { runIntake } from './intake.js';
import { loadUserContext } from './user-context.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (['no-deliver', 'enqueue'].includes(key)) { args[key] = true; continue; }
    args[key] = argv[++i];
  }
  return args;
}

loadEnv();
const args = parseArgs(process.argv.slice(2));
if (!args.board || (!args.user && !args.email)) {
  console.log('usage: node agents/run-intake.js --board <key> (--user <id> | --email <addr>) [--profile p.json] [--top 1] [--no-deliver] [--enqueue]');
  console.log('  --email signs the user up (idempotent, isTeam=true) and uses the resulting id');
  process.exit(1);
}

const store = makeStore();
console.log(`store: ${store.kind}`);

if (!args.user && args.email) {
  args.user = await store.signup({ email: args.email, isTeam: true, demoMode: false });
  console.log(`user: ${args.user} (signup via --email, isTeam=true)`);
}

const task = { userId: args.user, kind: 'intake', input: args.board };
const taskId = await store.createTask(task);
task._id = taskId;
console.log(`task created: ${taskId} (board=${args.board})`);

if (args.enqueue) {
  console.log('enqueued only; start agents/worker.js to process it');
  process.exit(0);
}

await store.setTaskStatus({ taskId, status: 'running' });

let ctx = await loadUserContext(store, args.user);
if (args.profile) {
  const override = JSON.parse(readFileSync(args.profile, 'utf8'));
  ctx = {
    user: { ...ctx.user, ...(override.user || {}) },
    profile: { ...ctx.profile, ...(override.profile || {}) },
    resumeText: override.resumeText ?? ctx.resumeText,
  };
}

const result = await runIntake({
  store, task, ...ctx,
  opts: { top: Number(args.top || 1), deliver: !args['no-deliver'] },
  log: (m) => console.log(`  ${m}`),
});

console.log('');
console.log(`result: ${result.taskStatus}`);
console.log(result.summary);
if (result.briefPath) console.log(`brief: ${result.briefPath}`);
process.exit(result.taskStatus === 'delivered' ? 0 : 2);
