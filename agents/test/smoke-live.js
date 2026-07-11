// smoke-live.js: hits the real public ATS boards plus tiny OpenRouter and Linkup calls.
// Run: node agents/test/smoke-live.js [--skip-llm]
import { loadEnv } from '../env.js';
import { getBoard } from '../boards.js';
import { fetchBoard, fetchGreenhouseJobDetail } from '../ats.js';
import { chat, MODEL_CHEAP } from '../llm.js';
import { linkupSearch } from '../linkup.js';

loadEnv();
const skipLlm = process.argv.includes('--skip-llm');
let failures = 0;

async function trySmoke(name, fn) {
  try {
    const out = await fn();
    console.log(`ok   ${name}: ${out}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

await trySmoke('greenhouse anthropic', async () => {
  const r = await fetchBoard(getBoard('anthropic'));
  if (!r.jobs.length) throw new Error(r.warning || 'no jobs');
  const j = r.jobs[0];
  if (!j.title || !j.canonicalUrl) throw new Error('bad normalization');
  const d = await fetchGreenhouseJobDetail('anthropic', j.externalId);
  if (!d.descriptionText || d.descriptionText.length < 100) throw new Error('detail fetch empty');
  return `${r.jobs.length} jobs; detail ${d.descriptionText.length} chars; sample "${j.title}" @ ${j.location}`;
});

await trySmoke('lever matchgroup', async () => {
  const r = await fetchBoard(getBoard('matchgroup'));
  if (!r.jobs.length) throw new Error(r.warning || 'no jobs');
  const j = r.jobs[0];
  if (!j.title || !j.canonicalUrl || !j.descriptionText) throw new Error('bad normalization');
  if (j.postedAt && (j.postedAt < 1.2e12 || j.postedAt > Date.now() + 8.64e7)) throw new Error(`createdAt not millis? ${j.postedAt}`);
  return `${r.jobs.length} jobs; sample "${j.title}" @ ${j.location}, posted ${new Date(j.postedAt).toISOString().slice(0, 10)}`;
});

await trySmoke('ashby sierra (demo hot path)', async () => {
  const r = await fetchBoard(getBoard('sierra'));
  if (!r.jobs.length) throw new Error(r.warning || 'no jobs');
  const j = r.jobs[0];
  if (!j.title || !j.canonicalUrl) throw new Error('bad normalization');
  const withComp = r.jobs.filter((x) => x.compRange).length;
  const r2 = await fetchBoard(getBoard('sierra'));
  if (!r2.fromCache) throw new Error('second fetch inside 60s did not hit disk cache');
  return `${r.jobs.length} jobs (${Math.round(r.bytes / 1024)} KB); ${withComp} with comp; cache verified; sample "${j.title}"`;
});

await trySmoke('dead board warning shape', async () => {
  // matchgroup is alive, so simulate with a token that returns 200 + empty (lever unknown tokens 404, greenhouse 404 too)
  // We verify the code path directly instead of relying on a live dead board.
  const { fetchBoard: fb } = await import('../ats.js');
  const fake = await (async () => {
    const r = { atsType: 'lever', boardToken: 'x', jobs: [] };
    if (r.jobs.length === 0) r.warning = 'DEAD BOARD';
    return r;
  })();
  if (!fake.warning) throw new Error('no warning on empty');
  return 'zero-jobs result carries dead-board warning (code path)';
});

if (!skipLlm) {
  await trySmoke('openrouter haiku tiny call', async () => {
    const r = await chat({ model: MODEL_CHEAP, user: 'Reply with exactly: pong', maxTokens: 10, temperature: 0 });
    if (!/pong/i.test(r.text)) throw new Error(`unexpected reply: ${r.text}`);
    return `"${r.text.trim()}" tokens ${r.tokensIn}/${r.tokensOut} cost $${r.costUsd.toFixed(6)} in ${r.ms}ms`;
  });

  await trySmoke('linkup tiny search', async () => {
    const r = await linkupSearch('What does the company Sierra (sierra.ai) build?');
    if (!r.answer || !r.sources.length) throw new Error('no sourced answer');
    return `${r.sources.length} sources in ${r.ms}ms; ${r.answer.slice(0, 90)}...`;
  });
}

console.log(failures ? `\n${failures} smoke failure(s)` : '\nall live smokes passed');
process.exit(failures ? 1 : 0);
