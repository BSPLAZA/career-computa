// E2E verification against the DEPLOYED web app and LIVE Convex backend.
// Run from repo root: node scripts/e2e.spec.mjs
// Asserts the seven judge-critical flows; prints PASS/FAIL per assertion and
// exits nonzero if any hard assertion fails. No mocks anywhere: this creates
// one real intake task on Bryan's account and waits for the live worker.
// Security note: no eval() of dynamic input anywhere; page.$$eval/evaluate are
// Playwright DOM helpers running fixed inline functions on our own page, and
// all data parsing goes through JSON.parse.
import { readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '/Users/orion/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import { ConvexHttpClient } from 'convex/browser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_URL = 'https://career-agency-web.bsplaza.workers.dev';
const CONVEX_URL = 'https://small-goldfinch-896.convex.cloud';
const BRYAN = 'kn7baxvjdz6c1bz2wkwwtkjj618ab12r';
const ANNOUNCE_DIR = path.join(ROOT, 'artifacts', 'announcements');
const DELIVER_TIMEOUT_MS = 3 * 60 * 1000;

const convex = new ConvexHttpClient(CONVEX_URL);
const results = [];
const notes = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail ? ' :: ' + detail : ''}`);
}
function note(msg) { notes.push(msg); console.log('NOTE  ' + msg); }

function listMp3s() {
  try {
    return readdirSync(ANNOUNCE_DIR).filter(f => f.endsWith('.mp3'))
      .map(f => ({ f, mtime: statSync(path.join(ANNOUNCE_DIR, f)).mtimeMs }));
  } catch { return []; }
}

async function clickTab(page, label) {
  await page.click(`button.tab-btn:has-text("${label}")`);
}

const startedAt = Date.now();
const mp3Before = listMp3s();

// ---------- kick off the real task first so the worker runs while we test ----------
let taskId = null;
try {
  const r = await convex.mutation('tasks:createTask', {
    userId: BRYAN,
    kind: 'intake',
    input: 'Quick path: Senior Product Manager to Group Product Manager; targets Data bricks',
  });
  taskId = r.taskId;
  console.log('task created:', taskId);
} catch (e) {
  record(2, 'quick path task created', false, String(e).slice(0, 200));
}

const browser = await chromium.launch({ headless: true });

// =====================================================================
// Anonymous visitor: assertions 1 (ledger + VERIFY) and 7 (tenant privacy)
// =====================================================================
try {
  const anon = await browser.newContext();
  const page = await anon.newPage();
  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });

  // ---- 1. Ledger counters ----
  await clickTab(page, 'Ledger');
  await page.waitForSelector('.counter .num', { timeout: 20000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.counter .num')].some(n => /\d/.test(n.textContent ?? '')),
    null, { timeout: 20000 },
  );
  const counters = await page.$$eval('.counter', cs => cs.map(c => ({
    num: c.querySelector('.num')?.textContent?.trim(),
    lbl: c.querySelector('.lbl')?.textContent?.trim(),
  })));
  const allNumeric = counters.length >= 4 && counters.every(c => /^\d+$/.test(c.num ?? ''));
  record(1, 'Ledger renders with numeric counters', allNumeric,
    counters.map(c => `${c.num} ${c.lbl?.slice(0, 40)}`).join(' | '));

  await page.waitForSelector('table tbody tr', { timeout: 15000 });
  const whoCells = await page.$$eval('table tbody tr td:nth-child(2)', tds => tds.map(t => t.textContent ?? ''));
  const masked = whoCells.length > 0 && whoCells.every(t => t.includes('***@') || t.includes('***'));
  record(7, 'Ledger shows only masked emails to a stranger', masked, `${whoCells.length} rows checked`);

  // ---- VERIFY is tenant-scoped: anonymous rows carry no trace capability ----
  const verifyLinks = await page.$$eval('table tbody tr a', as => as.filter(a => a.textContent?.trim() === 'VERIFY').length);
  const ownerOnly = await page.$$eval('table tbody tr td', tds => tds.filter(t => t.textContent?.trim() === 'owner only').length);
  record(7, 'Anonymous ledger shows owner-only VERIFY (traces are private)', verifyLinks === 0 && ownerOnly > 0,
    `${verifyLinks} VERIFY links, ${ownerOnly} owner-only cells`);

  // ---- 7. Queue and Ready as a stranger: no drafts visible ----
  await clickTab(page, 'Queue');
  await page.waitForSelector('text=Your drafts are private to your account', { timeout: 15000 });
  const qCards = await page.$$eval('.queue-card, .draft-body', els => els.length);
  record(7, 'Anonymous Queue shows zero draft cards', qCards === 0, `${qCards} cards/bodies`);

  await clickTab(page, 'Ready');
  await page.waitForSelector('text=Your packages are private to your account', { timeout: 15000 });
  const rCards = await page.$$eval('.queue-card, .draft-body', els => els.length);
  record(7, 'Anonymous Ready shows zero packages', rCards === 0, `${rCards} cards/bodies`);

  await anon.close();
} catch (e) {
  record(7, 'anonymous visitor flow', false, String(e).slice(0, 300));
}

// =====================================================================
// Signed-in as Bryan: assertions 3, 4, 5
// =====================================================================
try {
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(id => localStorage.setItem('ca.myUserId', id), BRYAN);
  const page = await ctx.newPage();
  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });

  // ---- 5. Onboard conversational flow with text fallback ----
  const micVisible = await page.isVisible('.vo-mic');
  const heroVisible = await page.isVisible('text=Tell Computa about your career');
  record(5, 'Onboard renders conversational flow (mic + hero)', micVisible && heroVisible);
  await page.fill('.vo-transcript',
    'I am a senior product manager in fintech looking for group product manager roles, remote or hybrid in San Francisco, no onsite only jobs, and I care about Databricks and Stripe.');
  await page.click('button:has-text("Turn this into my profile")');
  await page.waitForSelector('text=Confirm what I heard', { timeout: 45000 });
  const chipTexts = await page.$$eval('.vo-chip-text', cs => cs.map(c => c.textContent ?? ''));
  const extracted = chipTexts.some(t => /group product manager/i.test(t));
  const manualFallback = await page.isVisible('text=Auto-extraction is unavailable');
  record(5, 'Text fallback produces confirm chips', chipTexts.length > 0 || manualFallback,
    extracted ? `live extraction worked: ${chipTexts.slice(0, 4).join(' | ')}`
      : manualFallback ? 'extract API down, manual-chips fallback shown (degraded but honest)'
        : `chips: ${chipTexts.slice(0, 4).join(' | ')}`);
  if (!extracted && !manualFallback) note('extraction returned chips but no target title matched the transcript');
  // Deliberately NOT saving the profile: this is Bryan's real account.

  // ---- 3. Apply-ready card ----
  await clickTab(page, 'Ready');
  await page.waitForSelector('.queue-card', { timeout: 30000 });
  // pipeline boards load async; give applyUrl matching a moment
  await page.waitForSelector('a[href^="https"] button.primary:has-text("Open application")', { timeout: 30000 }).catch(() => {});
  const cards = await page.$$eval('.queue-card', els => els.map((el, i) => {
    const fit = el.querySelector('.fit')?.textContent?.match(/fit (\d+)/);
    const applyA = [...el.querySelectorAll('a')].find(a => a.textContent?.includes('Open application') || a.querySelector('button'));
    const applyHref = [...el.querySelectorAll('a')].map(a => a.href).find(h => h.startsWith('https') && !h.includes('bsplaza.workers.dev'));
    const openBtn = [...el.querySelectorAll('button')].find(b => b.textContent === 'Open application');
    return {
      i,
      company: el.querySelector('.queue-head b')?.textContent ?? '?',
      fit: fit ? Number(fit[1]) : null,
      applyHref: openBtn && !openBtn.disabled ? (openBtn.closest('a')?.href ?? applyHref ?? null) : null,
      charcount: el.querySelector('.charcount')?.textContent ?? null,
      charOver: !!el.querySelector('.charcount.over'),
    };
  }));
  record(3, 'Apply-ready cards render', cards.length > 0, `${cards.length} cards: ${cards.map(c => `${c.company}(fit ${c.fit})`).join(', ')}`);

  const withUrl = cards.filter(c => c.applyHref);
  record(3, 'A card has a real https applyUrl', withUrl.length > 0,
    withUrl[0] ? `${withUrl[0].company}: ${withUrl[0].applyHref}` : 'no card matched a job row with applyUrl');

  const withCount = cards.filter(c => c.charcount);
  const countOk = withCount.length > 0 && withCount.every(c => !c.charOver &&
    (/280\+/.test(c.charcount) || (Number(c.charcount.match(/^(\d+)\/300/)?.[1] ?? 999) <= 300)));
  record(3, 'Connection note char count shown and at or under 300', countOk,
    withCount.map(c => `${c.company}: ${c.charcount}`).slice(0, 4).join(' | '));

  // copy button on the first card's first copy block
  const copyBtn = page.locator('.queue-card').first().locator('button:has-text("Copy")').first();
  await copyBtn.click();
  await page.waitForSelector('button:has-text("Copied")', { timeout: 5000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  record(3, 'Copy button copies text to clipboard', (clip ?? '').length > 10, `${(clip ?? '').length} chars copied`);

  // ---- 4. Not for me writes a Feedback row ----
  // Least demo damage: dismiss the LOWEST-fit visible card with reason "wrong level".
  const scored = cards.filter(c => c.fit !== null);
  const target = scored.length > 0 ? scored.reduce((a, b) => (b.fit < a.fit ? b : a)) : cards[cards.length - 1];
  const tCard = page.locator('.queue-card').nth(target.i);
  const feedbackMark = Date.now();
  await tCard.locator('button:has-text("Not for me")').click();
  await tCard.locator('button:has-text("wrong level")').click();
  await page.waitForSelector('.toast', { timeout: 10000 });
  const toast = await page.textContent('.toast');
  note(`Not-for-me exercised on ${target.company} (fit ${target.fit}); toast: ${toast}`);
  await sleep(1500);
  const fb = await convex.query('feedback:feedbackForUser', { userId: BRYAN });
  const row = (fb ?? []).find(f => f.at >= feedbackMark - 5000 && f.verdict === 'thumbs_down' && /wrong level/.test(f.reason ?? ''));
  record(4, 'Not for me writes a Feedback row (verified via Convex)', !!row,
    row ? `feedback ${row._id}, reason "${row.reason}", jobId ${row.jobId ?? 'none'}` : 'no matching feedback row found');

  await ctx.close();
} catch (e) {
  record(3, 'signed-in ready/onboard flow', false, String(e).slice(0, 300));
}

// =====================================================================
// 2. The quick-path task reaches delivered; brief is real, no STUB
// =====================================================================
let delivered = false;
let finalStatus = 'never created';
if (taskId) {
  const deadline = startedAt + DELIVER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const t = await convex.query('tasks:getTask', { taskId });
    finalStatus = t?.status ?? 'missing';
    if (finalStatus === 'delivered') { delivered = true; break; }
    if (finalStatus === 'failed' || finalStatus === 'escalated') break;
    await sleep(5000);
  }
  record(2, `Quick path "Data bricks" task reaches delivered within 3 min`, delivered, `status: ${finalStatus}, task ${taskId}`);
}

let briefId = null;
if (delivered) {
  try {
    const raw = execFileSync('npx', ['convex', 'data', 'artifacts', '--limit', '80', '--order', 'desc', '--format', 'jsonLines'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const artifacts = raw.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const brief = artifacts.find(a => a.kind === 'delivery_brief' && a.taskId === taskId);
    if (!brief) {
      record(2, 'delivery brief exists for the task', false, 'no delivery_brief artifact found');
    } else {
      briefId = brief._id;
      const c = brief.content ?? '';
      const hasResume = c.includes('<!--resume-html-->') && c.includes('<!--/resume-html-->');
      const stub = /stub/i.test(c);
      const emDash = c.includes('—');
      record(2, 'Brief contains a rendered resume section', hasResume,
        `brief ${briefId}, ${c.length} chars, resume block ${hasResume ? 'present' : 'MISSING'}`);
      record(2, 'Brief contains no STUB text', !stub, stub ? 'found /stub/i in brief content' : 'grep clean');
      if (emDash) note('EM DASH found in the new brief content (rules violation, flag to brain)');
      // sibling artifacts for this task must also be stub-free
      const sibs = artifacts.filter(a => a.taskId === taskId);
      const sibStub = sibs.filter(a => /stub/i.test(a.content ?? ''));
      record(2, 'No STUB text in any artifact of the task', sibStub.length === 0,
        `${sibs.length} artifacts checked (${sibs.map(a => a.kind).join(', ')})`);

      // the public brief page renders it
      const ctx2 = await browser.newContext();
      const p2 = await ctx2.newPage();
      await p2.goto(`${WEB_URL}/brief/${briefId}`, { waitUntil: 'domcontentloaded' });
      await p2.waitForSelector('.draft-body', { timeout: 20000 });
      const pageText = await p2.textContent('main');
      record(2, 'Public /brief/<id> page renders the brief', (pageText ?? '').length > 500 && !/STUB/.test(pageText ?? ''),
        `${(pageText ?? '').length} chars on page`);
      if ((pageText ?? '').includes('<!--resume-html-->')) {
        note('brief page shows the raw <!--resume-html--> marker block as text; web lane rendering fix still open');
      }
      await ctx2.close();
    }
  } catch (e) {
    record(2, 'brief content verification', false, String(e).slice(0, 300));
  }
}

// =====================================================================
// 6. Announce: a new mp3 landed for the delivered task.
// ANNOUNCE is OFF by default now (the worker runs in a shared space), so this
// is a hard assertion only when E2E_EXPECT_ANNOUNCE=1; otherwise a note.
// =====================================================================
const expectAnnounce = process.env.E2E_EXPECT_ANNOUNCE === '1';
if (delivered) {
  let gained = [];
  const annDeadline = Date.now() + (expectAnnounce ? 30000 : 5000);
  while (Date.now() < annDeadline) {
    const now = listMp3s();
    gained = now.filter(m => !mp3Before.some(b => b.f === m.f));
    if (gained.length > 0) break;
    await sleep(3000);
  }
  if (expectAnnounce || gained.length > 0) {
    record(6, 'artifacts/announcements gained an mp3 for the delivered task', gained.length > 0,
      gained.length ? gained.map(g => g.f).join(', ') : `still ${mp3Before.length} mp3s, none new`);
  } else {
    note('announcements are off by default now (ANNOUNCE=0, shared space); mp3 check skipped. Set E2E_EXPECT_ANNOUNCE=1 when the worker runs with ANNOUNCE=1.');
  }
} else if (expectAnnounce) {
  record(6, 'announcement mp3 for delivered task', false, 'task never delivered, so no announcement expected');
}

await browser.close();

// ---------- exact counters for the report ----------
try {
  const c = await convex.query('public:counters', {});
  console.log('\nEXACT COUNTERS', JSON.stringify(c));
} catch (e) { console.log('counters query failed:', String(e).slice(0, 120)); }

console.log('\n===== RESULT TABLE =====');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  [${r.id}] ${r.name}`);
for (const n of notes) console.log('NOTE  ' + n);
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
process.exit(failed.length > 0 ? 1 : 0);
