#!/usr/bin/env node
// Onboard Bryan as tenant #1 through the SAME flow any user gets:
// 1. create user (email from the export, isTeam=true)
// 2. parse the LinkedIn export folder
// 3. parse the newest master resume PDF and the performance review TXTs
// 4. write to Convex when .convex-url exists, else dump JSON to parsers/out/
//
// Usage: node scripts/onboard-bryan.mjs [--no-llm] [--stories-limit N] [--render-smoke]
// Clean room: in the Resume folder we touch ONLY data files (PDF, TXT, DOCX).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const { parseLinkedInExport } = require(path.join(REPO, 'parsers/linkedin.js'));
const { extractStarStories, extractResumeInventory } = require(path.join(REPO, 'parsers/docs.js'));
const { renderResumeVariant } = require(path.join(REPO, 'parsers/resume.js'));

const EXPORT_PATH = '/Users/orion/Downloads/Complete_LinkedInDataExport_06-23-2026.zip'; // extracted folder despite the name
const RESUME_DIR = '/Users/orion/Library/CloudStorage/OneDrive-Personal/Resume';
const MASTER_RESUME = path.join(RESUME_DIR, 'BRYAN Z PLAZA - Resume.pdf');
const PERF_DIR = path.join(RESUME_DIR, 'Microsoft Performance Docs');
const OUT_DIR = path.join(REPO, 'parsers/out');

const args = process.argv.slice(2);
const NO_LLM = args.includes('--no-llm');
const RENDER_SMOKE = args.includes('--render-smoke');
const limIdx = args.indexOf('--stories-limit');
const STORIES_LIMIT = limIdx >= 0 ? parseInt(args[limIdx + 1], 10) : Infinity;

function log(msg) { console.log('[onboard] ' + msg); }

function convexUrl() {
  const p = path.join(REPO, '.convex-url');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  return null;
}

async function writeToConvex(url, payload) {
  // users:signup exists and is idempotent. Bulk intake mutations for profile,
  // contacts, answerBank, and starStories are not yet published by the convex
  // lane; we try conventional names and report what is still pending.
  const { ConvexHttpClient } = require('convex/browser');
  const client = new ConvexHttpClient(url);
  const result = { ok: false, userId: null, persisted: [], pending: [], error: null };
  try {
    const signup = await client.mutation('users:signup', {
      email: payload.user.email, isTeam: true, demoMode: true,
    });
    result.userId = signup.userId;
    result.persisted.push('users:signup (' + (signup.existing ? 'existing' : 'new') + ' user ' + signup.userId + ')');
    result.ok = true;
  } catch (err) {
    result.error = String(err.message || err).slice(0, 300);
    return result;
  }
  const attempts = [
    ['intake:upsertProfile', { userId: result.userId, profile: payload.profile }, true],
    ['intake:bulkContacts', { userId: result.userId, contacts: payload.contacts }, payload.contacts.length > 0],
    ['intake:bulkAnswers', { userId: result.userId, entries: payload.answerBank }, payload.answerBank.length > 0],
    ['intake:bulkStories', { userId: result.userId, stories: payload.starStories }, payload.starStories.length > 0],
  ];
  for (const [fn, args, hasData] of attempts) {
    // Bulk mutations are replace-semantics; never wipe server rows with an empty payload.
    if (!hasData) { result.persisted.push(fn + ' SKIPPED (no data this run, server rows kept)'); continue; }
    try {
      await client.mutation(fn, args);
      result.persisted.push(fn);
    } catch (err) {
      result.pending.push(fn + ' (' + String(err.message || err).slice(0, 120) + ')');
    }
  }
  return result;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ---- 1. LinkedIn export ----
  log('parsing LinkedIn export at ' + EXPORT_PATH);
  const li = parseLinkedInExport(EXPORT_PATH);
  for (const c of li.statusCards) log('  [' + c.status + '] ' + c.file + ' (' + c.count + ') ' + (c.note || ''));

  // Profile.csv carries no email column in this export, so the tenant record
  // uses the placeholder team email per the lane spec. His real address stays
  // on the resume contact block only, where it is document data.
  const email = 'team-bryan@career-agency.local';

  const user = {
    email,
    signedUpAt: Date.now(),
    isTeam: true,
    demoMode: true,
    signupToken: 'bryan-' + Math.random().toString(36).slice(2, 10),
  };

  const profile = {
    name: li.profile?.name || 'Unknown',
    headline: li.profile?.headline || '',
    locations: li.goalsPrefill?.locations || [],
    goals: {
      targetTitles: li.goalsPrefill?.targetTitles || [],
      remote: li.goalsPrefill?.remote || 'flexible',
    },
    hardFilters: [],
    softPrefs: [],
    stylePrefs: { style: 'plaza-serif', density: 'lean', summaryLines: 3 },
    preferenceRules: [],
  };

  // ---- 2. Master resume inventory ----
  let inventory = null;
  if (!NO_LLM && fs.existsSync(MASTER_RESUME)) {
    log('extracting content inventory from master resume (LLM)');
    inventory = await extractResumeInventory(MASTER_RESUME);
    log('  inventory: ' + (inventory.experience?.length || 0) + ' roles, ' +
      inventory.experience?.reduce((n, r) => n + (r.bullets?.length || 0), 0) + ' bullets, ' +
      (inventory.projects?.length || 0) + ' projects');
  } else if (!fs.existsSync(MASTER_RESUME)) {
    log('  WARNING master resume not found at ' + MASTER_RESUME);
  }

  // ---- 3. Performance review TXTs -> STAR stories ----
  const stories = [];
  if (!NO_LLM && fs.existsSync(PERF_DIR)) {
    // DATA ONLY and TXT ONLY per the clean-room rule. We do not read the md or
    // pdf siblings, and never anything that looks like prior project tooling.
    const txts = fs.readdirSync(PERF_DIR).filter((f) => f.toLowerCase().endsWith('.txt')).sort();
    const take = txts.slice(0, STORIES_LIMIT === Infinity ? txts.length : STORIES_LIMIT);
    log('extracting STAR stories from ' + take.length + ' of ' + txts.length + ' performance TXTs (LLM)');
    for (const f of take) {
      try {
        const s = await extractStarStories(path.join(PERF_DIR, f));
        log('  ' + f + ': ' + s.length + ' stories');
        stories.push(...s);
      } catch (err) {
        log('  ' + f + ' FAILED: ' + String(err.message || err).slice(0, 120));
      }
    }
  }

  // When LLM extraction was skipped or produced nothing, reuse the dumped results of the
  // last full run so a fast --no-llm rerun still persists complete context to Convex.
  if (stories.length === 0) {
    const dump = path.join(OUT_DIR, 'bryan-star-stories.json');
    if (fs.existsSync(dump)) {
      const prior = JSON.parse(fs.readFileSync(dump, 'utf8'));
      if (Array.isArray(prior) && prior.length) { stories.push(...prior); log('loaded ' + prior.length + ' STAR stories from prior dump'); }
    }
  }
  if (!inventory) {
    const dump = path.join(OUT_DIR, 'bryan-resume-inventory.json');
    if (fs.existsSync(dump)) { inventory = JSON.parse(fs.readFileSync(dump, 'utf8')); log('loaded resume inventory from prior dump'); }
  }

  // ---- 4. Persist ----
  const payload = {
    user,
    profile,
    contacts: li.contacts,
    answerBank: li.answerBank,
    starStories: stories,
    goalsPrefill: li.goalsPrefill,
    savedJobs: li.savedJobs,
    voiceSamples: li.voiceSamples,
    resumeInventory: inventory,
    statusCards: li.statusCards,
  };

  const url = convexUrl();
  if (url) {
    log('found .convex-url, attempting write');
    const res = await writeToConvex(url, payload);
    for (const p of res.persisted) log('  persisted via ' + p);
    for (const p of res.pending) log('  PENDING (mutation not deployed yet): ' + p);
    if (res.error) log('  signup FAILED: ' + res.error);
    payload.convexUserId = res.userId || null;
    payload.pendingMutations = res.pending;
    // Always dump JSON too: the pending mutations import from these files later.
    dumpJson(payload);
  } else {
    log('.convex-url not present; dumping JSON to parsers/out/');
    dumpJson(payload);
  }

  // ---- 5. Optional smoke render ----
  if (RENDER_SMOKE && inventory) {
    const jd = fs.readFileSync(path.join(REPO, 'parsers/fixtures/sample-jd.txt'), 'utf8');
    log('rendering smoke variant against fixture JD');
    const result = await renderResumeVariant({
      inventory,
      jdText: jd,
      outDir: path.join(OUT_DIR, 'variants'),
      variantId: 'bryan-smoke-' + new Date().toISOString().slice(0, 10),
      options: profile.stylePrefs,
    });
    for (const g of result.gateResults) log('  gate ' + g.gate + ': ' + (g.pass ? 'PASS' : 'FAIL') + ' (' + g.note + ')');
    log('  pdf: ' + result.pdfPath + ', cut list: ' + result.cutList.length + ' bullets preserved');
    fs.writeFileSync(path.join(OUT_DIR, 'smoke-gate-results.json'), JSON.stringify({ gateResults: result.gateResults, cutList: result.cutList, pdfPath: result.pdfPath }, null, 2));
  }

  log('done');
}

function dumpJson(payload) {
  const files = {
    'bryan-user.json': { user: payload.user, profile: payload.profile, convexUserId: payload.convexUserId || null, pendingMutations: payload.pendingMutations || [] },
    'bryan-contacts.json': payload.contacts,
    'bryan-answerbank.json': payload.answerBank,
    'bryan-star-stories.json': payload.starStories,
    'bryan-goals-savedjobs.json': { goalsPrefill: payload.goalsPrefill, savedJobs: payload.savedJobs },
    'bryan-voice-samples.json': payload.voiceSamples,
    'bryan-resume-inventory.json': payload.resumeInventory,
    'bryan-status-cards.json': payload.statusCards,
  };
  for (const [name, data] of Object.entries(files)) {
    const target = path.join(OUT_DIR, name);
    const empty = data == null || (Array.isArray(data) && data.length === 0);
    if (empty && fs.existsSync(target)) { log('  kept existing parsers/out/' + name + ' (this run produced no data for it)'); continue; }
    fs.writeFileSync(target, JSON.stringify(data, null, 2));
    log('  wrote parsers/out/' + name);
  }
}

main().catch((err) => { console.error('[onboard] FATAL: ' + (err.stack || err)); process.exit(1); });
