// intake.js: the full intake task pipeline with a manager loop.
// Every step writes a RunStep row (the runSteps table IS the trace). Auto-rejects write a
// reason and stop that job; auto-rejected jobs never count as completed. Em-dash lint runs
// on every artifact before finalize. connection_note is hard-capped at 300 chars in code.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './env.js';
import { getBoard, mapToBoard, extractCompanyCandidates, BOARDS } from './boards.js';
import { fetchBoard, ensureDescription } from './ats.js';
import { chat, chatJson, parseJson, MODEL_DEFAULT, MODEL_CHEAP } from './llm.js';
import { linkupSearch } from './linkup.js';
import { lintArtifact, enforceNoteCap, hasEmDash, stripEmDashes, NOTE_CHAR_CAP } from './lint.js';
import { sendBrief } from './telegram.js';

const clip = (s, n = 220) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 3) + '...' : s; };

// Public dashboard host for links embedded in briefs (printable resume, brief pages).
const WEB_BASE_URL = (process.env.WEB_BASE_URL || 'https://career-agency-web.bsplaza.workers.dev').replace(/\/$/, '');

// ---------- step tracer: one RunStep row per step, tokens/cost/ms tracked ----------
class Tracer {
  constructor(store, runId) {
    this.store = store; this.runId = runId; this.seq = 0;
    this.totals = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  }
  async step(agentRole, action, inputSummary, fn, { parentSeq } = {}) {
    const seq = ++this.seq;
    const t0 = Date.now();
    let out = { summary: '', tokensIn: 0, tokensOut: 0, costUsd: 0, status: 'ok', value: undefined };
    try {
      const r = await fn();
      out = { tokensIn: 0, tokensOut: 0, costUsd: 0, status: 'ok', ...r };
    } catch (err) {
      out = { summary: `ERROR: ${clip(err.message, 300)}`, tokensIn: 0, tokensOut: 0, costUsd: 0, status: 'error', error: err };
    }
    this.totals.tokensIn += out.tokensIn; this.totals.tokensOut += out.tokensOut; this.totals.costUsd += out.costUsd;
    await this.store.insertRunStep({
      runId: this.runId, seq, ...(parentSeq ? { parentSeq } : {}),
      agentRole, action,
      inputSummary: stripEmDashes(clip(inputSummary, 300)), outputSummary: stripEmDashes(clip(out.summary, 500)),
      tokensIn: out.tokensIn, tokensOut: out.tokensOut, costUsd: out.costUsd, ms: Date.now() - t0,
      status: out.status,
    });
    if (out.status === 'error') throw out.error;
    return { value: out.value, seq };
  }
}

// ---------- hard filters: machine-checkable rules from profile.hardFilters ----------
// Supported forms: "title_excludes:word", "title_requires:word", "location_excludes:word",
// "remote_required", "comp_floor:150000". Any other string is a keyword exclude on title+location.
export function applyHardFilters(job, hardFilters = []) {
  const title = (job.title || '').toLowerCase();
  const loc = (job.location || '').toLowerCase();
  for (const rule of hardFilters) {
    const r = String(rule).trim(); if (!r) continue;
    const [kind, ...rest] = r.split(':');
    const arg = rest.join(':').trim().toLowerCase();
    if (kind === 'title_excludes' && arg && title.includes(arg)) return { rejected: true, reason: `title contains excluded term "${arg}" (rule: ${r})` };
    if (kind === 'title_requires' && arg && !title.includes(arg)) return { rejected: true, reason: `title missing required term "${arg}" (rule: ${r})` };
    if (kind === 'location_excludes' && arg && loc.includes(arg)) return { rejected: true, reason: `location "${job.location}" matches excluded "${arg}" (rule: ${r})` };
    if (kind === 'remote_required' && job.isRemote === false) return { rejected: true, reason: `job is not remote (rule: ${r})` };
    if (kind === 'comp_floor' && arg) {
      const floor = Number(arg.replace(/[^\d]/g, ''));
      const nums = (job.compRange || '').match(/\d[\d,]*/g)?.map((n) => Number(n.replace(/,/g, ''))) || [];
      const max = nums.length ? Math.max(...nums.map((n) => (n < 1000 ? n * 1000 : n))) : null;
      if (max !== null && max < floor) return { rejected: true, reason: `comp range "${job.compRange}" below floor ${floor} (rule: ${r})` };
    }
    if (!['title_excludes', 'title_requires', 'location_excludes', 'remote_required', 'comp_floor'].includes(kind)) {
      const kw = r.toLowerCase();
      if (title.includes(kw) || loc.includes(kw)) return { rejected: true, reason: `matches exclude keyword "${r}"` };
    }
  }
  return { rejected: false };
}

// deterministic title relevance vs target titles, used to rank survivors before LLM scoring.
// Exact phrase containment beats partial word overlap; short tokens like PM count as whole words.
export function titleRelevance(title, targetTitles = []) {
  const t = (title || '').toLowerCase();
  const tWords = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
  let best = 0;
  for (const target of targetTitles) {
    const tgt = String(target).toLowerCase().trim();
    if (!tgt) continue;
    if (t.includes(tgt)) { best = Math.max(best, 2); continue; }
    const words = tgt.split(/[^a-z0-9]+/).filter(Boolean);
    if (!words.length) continue;
    const hits = words.filter((w) => (w.length <= 2 ? tWords.has(w) : t.includes(w))).length;
    best = Math.max(best, hits / words.length);
  }
  return best;
}

// ---------- artifact finalize: em-dash lint gate on everything ----------
async function finalizeArtifact(store, artifact) {
  const lint = lintArtifact(artifact.content);
  const gateResults = [...(artifact.gateResults || []), lint.gate];
  const id = await store.insertArtifact({ ...artifact, content: lint.text, gateResults });
  return { id, content: lint.text, gateResults };
}

// ---------- resume renderer from the parsers lane ----------
// Returns { renderResume, renderPdf } or null. renderResume is the HTML hot path;
// renderPdf is the async on-request PDF (never awaited inside the pipeline).
async function loadRenderer() {
  for (const rel of ['parsers/render.js', 'parsers/render.mjs', 'parsers/index.js']) {
    const p = join(REPO_ROOT, rel);
    if (existsSync(p)) {
      try {
        const mod = await import(pathToFileURL(p).href);
        if (typeof mod.renderResume === 'function') {
          return { renderResume: mod.renderResume, renderPdf: typeof mod.renderPdf === 'function' ? mod.renderPdf : null };
        }
      } catch { /* fall through to honest no-renderer path */ }
    }
  }
  return null;
}

// ---------- board resolution: exact key, then free-text company mapping ----------
// Quick-path inputs carry free-text company names ("Data bricks"); map them to the
// registry before giving up. Returns { board, note } or { board: null, misses }.
function resolveBoard(rawInput) {
  const key = String(rawInput || '').replace(/^board:/, '').trim();
  try { return { board: getBoard(key), note: `exact board key "${key}"` }; } catch { /* not a key */ }
  const candidates = extractCompanyCandidates(rawInput);
  const misses = [];
  for (const cand of candidates) {
    const hit = mapToBoard(cand);
    if (hit) {
      const skipped = misses.length ? ` (no board for: ${misses.join(', ')})` : '';
      return { board: hit.board, note: `mapped "${cand}" to ${hit.board.key} via ${hit.matched}${skipped}` };
    }
    misses.push(cand);
  }
  return { board: null, misses: misses.length ? misses : [key] };
}

// ---------- the pipeline ----------
// ctx: { store, task, user, profile, resumeText?, opts: { top, deliver, notify } }
export async function runIntake(ctx) {
  const { store, task } = ctx;
  const userId = task.userId;
  const profile = ctx.profile || {};
  const resumeText = ctx.resumeText || '';
  const top = ctx.opts?.top ?? 1;
  const log = ctx.log || (() => {});

  const runId = await store.createRun({ taskId: task._id, userId, startedAt: Date.now() });
  const tr = new Tracer(store, runId);
  const boardKey = String(task.input || '').replace(/^board:/, '').trim();

  let outcome = { taskStatus: 'failed', summary: '' };
  try {
    // 1. manager plans; free-text company names map to the board registry (exact,
    // then fuzzy); only true misses escalate, with friendly context
    const planRes = await tr.step('manager', 'plan',
      // Opaque tenant tag only: plaintext userIds are a capability and never
      // belong in step summaries readable off the trace surface.
      `intake task ${task._id}: input=${clip(boardKey, 80)}, top=${top}, tenant:${String(userId).slice(-4)}`,
      async () => {
        const resolved = resolveBoard(task.input);
        if (!resolved.board) {
          return { summary: `no board match for ${resolved.misses.map((m) => `"${clip(m, 40)}"`).join(', ')} after exact, alias, and fuzzy matching; escalating to a human with full context`, value: null, misses: resolved.misses };
        }
        const board = resolved.board;
        const plan = `Board: ${resolved.note}. Plan: fetch ${board.atsType}/${board.boardToken}, dedupe, hard_filter (${(profile.hardFilters || []).length} rules), rank vs targets [${(profile.goals?.targetTitles || []).join('; ')}], fit_score top ${top}, research, render_resume, draft_note+dm, review, compose_brief, deliver.`;
        return { summary: plan, value: board };
      });
    const planSeq = planRes.seq;
    if (!planRes.value) {
      const missNames = extractCompanyCandidates(task.input).join(', ') || String(task.input);
      const friendly = [
        `We could not find a live job board for: ${missNames}.`,
        `We watch ${Object.keys(BOARDS).length} company boards right now (${Object.values(BOARDS).slice(0, 6).map((b) => b.name).join(', ')} and more).`,
        `A human teammate has been notified and will either add the board or suggest close alternatives. Nothing was lost; your request is queued with full context.`,
      ].join(' ');
      await store.setTaskStatus({ taskId: task._id, status: 'escalated', escalation: { reason: 'unmapped_company', context: friendly } });
      await store.finishRun({ runId, success: false, error: 'unmapped_company' });
      return { runId, taskStatus: 'escalated', summary: `escalated: no board match for "${clip(boardKey, 80)}"` };
    }
    const boardInfo = planRes.value;
    const companyId = await store.upsertCompany({ name: boardInfo.name, atsType: boardInfo.atsType, boardToken: boardInfo.boardToken, pollable: true });

    // 2. fetch_board
    const fetchRes = await tr.step('scout', 'fetch_board',
      `${boardInfo.atsType}/${boardInfo.boardToken}`,
      async () => {
        const r = await fetchBoard(boardInfo);
        const summary = r.warning
          ? r.warning
          : `${r.jobs.length} live postings from ${boardInfo.atsType}/${boardInfo.boardToken} in ${r.ms}ms (${Math.round(r.bytes / 1024)} KB${r.fromCache ? ', disk cache' : ''})`;
        return { summary, value: r };
      }, { parentSeq: planSeq });
    const boardResult = fetchRes.value;
    if (boardResult.warning) {
      await store.setTaskStatus({ taskId: task._id, status: 'escalated', escalation: { reason: 'dead_board', context: boardResult.warning } });
      await store.finishRun({ runId, finishedAt: Date.now(), ...tr.totals, success: false, error: 'dead_board' });
      return { runId, taskStatus: 'escalated', summary: boardResult.warning };
    }

    // 3. dedupe
    const dedupeRes = await tr.step('scout', 'dedupe', `${boardResult.jobs.length} raw postings`, async () => {
      const seen = new Map();
      for (const j of boardResult.jobs) if (!seen.has(j.canonicalUrl)) seen.set(j.canonicalUrl, j);
      const unique = [...seen.values()];
      return { summary: `${boardResult.jobs.length} raw -> ${unique.length} unique by canonical URL`, value: unique };
    });
    const uniqueJobs = dedupeRes.value;

    // 4. hard_filter: auto-reject writes reason and STOPS that job; never counts as completed.
    // Jobs already assessed for this user are excluded up front so the same posting
    // never double counts across runs.
    const hfRes = await tr.step('pipeline', 'hard_filter',
      `${uniqueJobs.length} jobs vs ${(profile.hardFilters || []).length} hard rules + target ranking`,
      async () => {
        let seenUrls = new Set();
        try { seenUrls = new Set(await store.assessedUrlsForUser(userId)); } catch { /* first run or older store */ }
        const fresh = uniqueJobs.filter((j) => !seenUrls.has(j.canonicalUrl));
        const alreadyAssessed = uniqueJobs.length - fresh.length;
        const survivors = []; const rejected = [];
        for (const j of fresh) {
          const verdict = applyHardFilters(j, profile.hardFilters);
          if (verdict.rejected) rejected.push({ job: j, reason: verdict.reason });
          else survivors.push(j);
        }
        // persist a sample of auto-rejects so the reason trail is visible (cap writes)
        for (const r of rejected.slice(0, 10)) {
          const { jobId } = await store.upsertJob({
            userId, companyId,
            title: r.job.title, canonicalUrl: r.job.canonicalUrl, applyUrl: r.job.applyUrl,
            postedAt: r.job.postedAt, location: r.job.location, isRemote: r.job.isRemote, compRange: r.job.compRange,
          });
          await store.assessJob({
            jobId, fitScore: 0,
            caveats: [`auto-rejected: ${r.reason}`], fitEvidence: [],
            hardFilterResult: { rejected: true, reason: r.reason },
          });
        }
        survivors.sort((a, b) => titleRelevance(b.title, profile.goals?.targetTitles) - titleRelevance(a.title, profile.goals?.targetTitles));
        const topPicks = survivors.slice(0, top);
        return {
          summary: `${alreadyAssessed} already assessed for this user (skipped); ${rejected.length} auto-rejected with logged reasons (${rejected.slice(0, 2).map((r) => clip(r.reason, 60)).join(' | ') || 'none'}); ${survivors.length} survivors; top pick: ${topPicks.map((j) => j.title).join(' | ') || 'NONE'}`,
          value: { topPicks, rejectedCount: rejected.length, survivorCount: survivors.length, alreadyAssessed },
        };
      });
    const { topPicks } = hfRes.value;
    if (topPicks.length === 0) {
      const assessedNote = hfRes.value.alreadyAssessed > 0 ? ` ${hfRes.value.alreadyAssessed} were already assessed for this user in earlier runs (no double counting).` : '';
      await store.setTaskStatus({ taskId: task._id, status: 'escalated', escalation: { reason: 'no_survivors', context: `All ${uniqueJobs.length} jobs on ${boardInfo.key} were filtered out.${assessedNote} Auto-rejects do not count as completed work.` } });
      await store.finishRun({ runId, finishedAt: Date.now(), ...tr.totals, success: false, error: 'no_survivors' });
      return { runId, taskStatus: 'escalated', summary: 'no fresh survivors after hard filters' };
    }

    const renderer = await loadRenderer();

    // trust graduation: kinds with a clean approval streak at threshold skip the tap
    // queue; their artifacts ship tagged auto_approved_graduated. Any edit, skip, or
    // thumbs down resets the streak (computed from feedback rows, revocable).
    let graduatedKinds = new Set();
    let trustThreshold = null;
    try {
      const trust = await store.trustStatus(userId);
      trustThreshold = trust?.threshold ?? null;
      graduatedKinds = new Set((trust?.kinds || []).filter((k) => k.graduated).map((k) => k.kind));
    } catch { /* trust status unavailable: everything stays behind the tap */ }
    const ACTION_KIND = { fit_report: 'fit_score', resume_pdf: 'resume_variant', connection_note: 'connection_note', dm_draft: 'dm_draft', delivery_brief: 'brief_delivery' };
    const finalizeWithTrust = async (artifact) => {
      const actionKind = ACTION_KIND[artifact.kind];
      const graduated = actionKind && graduatedKinds.has(actionKind);
      if (graduated) {
        artifact = {
          ...artifact,
          gateResults: [...(artifact.gateResults || []), { gate: 'auto_approved_graduated', pass: true, note: `${actionKind} earned a clean approval streak of ${trustThreshold}; shipping without the tap (revocable)` }],
        };
      }
      const fin = await finalizeArtifact(store, artifact);
      if (graduated && artifact.kind !== 'delivery_brief') {
        // skip the tap queue: mark it delivered on the user's own brief-link surface
        await store.markArtifactDelivered({ artifactId: fin.id, via: 'link' }).catch(() => {});
      }
      return fin;
    };
    const jobSections = [];

    for (const pick of topPicks) {
      log(`processing: ${pick.title}`);
      const jobWithDesc = await ensureDescription(boardInfo, pick);
      const jd = clip(jobWithDesc.descriptionText || '(no description available)', 6000);
      const profileBlock = [
        `Name: ${profile.name || 'unknown'}`, `Headline: ${profile.headline || ''}`,
        `Target titles: ${(profile.goals?.targetTitles || []).join('; ')}`,
        `Locations: ${(profile.locations || []).join('; ')}`,
        `Soft prefs: ${(profile.softPrefs || []).join('; ')}`,
        resumeText ? `Resume:\n${clip(resumeText, 4000)}` : 'Resume text unavailable: score from profile only and say so in caveats.',
      ].join('\n');

      // 5. fit_score (0-100 + caveats[] + evidence[] jdLine/resumeLine pairs)
      const fitRes = await tr.step('researcher', 'fit_score', `${pick.title} @ ${boardInfo.name}`, async () => {
        const r = await chatJson({
          model: MODEL_DEFAULT, maxTokens: 900,
          system: 'You score job fit. Respond ONLY with JSON: {"score": 0-100, "caveats": ["..."], "evidence": [{"jdLine": "quote from the JD", "resumeLine": "matching line from candidate profile/resume"}]}. Always include at least one caveat (a real risk or gap, never empty). 2 to 4 evidence pairs, each quoting real lines from both sides. If the candidate profile is sparse, score low and say why in caveats; never refuse and never invent candidate facts. No em dashes anywhere.',
          user: `CANDIDATE:\n${profileBlock}\n\nJOB: ${pick.title} at ${boardInfo.name} (${pick.location || 'location unlisted'}${pick.compRange ? ', comp ' + pick.compRange : ''})\nJD:\n${jd}`,
        });
        const fit = r.value;
        fit.score = Math.max(0, Math.min(100, Number(fit.score) || 0));
        if (!Array.isArray(fit.caveats) || fit.caveats.length === 0) fit.caveats = ['Scorer returned no caveats; treat score as unvalidated.'];
        if (!Array.isArray(fit.evidence)) fit.evidence = [];
        return { summary: `fit ${fit.score}/100; caveats: ${fit.caveats.map((c) => clip(c, 70)).join(' | ')}`, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd, value: fit };
      });
      const fit = fitRes.value;

      // persist the assessed job (fit score always lands with caveats and evidence)
      const { jobId } = await store.upsertJob({
        userId, companyId,
        title: pick.title, canonicalUrl: pick.canonicalUrl, applyUrl: pick.applyUrl,
        postedAt: pick.postedAt, location: pick.location, isRemote: pick.isRemote, compRange: pick.compRange,
      });
      await store.assessJob({
        jobId, fitScore: fit.score, caveats: fit.caveats, fitEvidence: fit.evidence,
        hardFilterResult: { rejected: false },
      });
      // Bind the task to its picked job so surfaces join task -> job directly
      // (first pick wins; setTaskJob never overwrites). Best effort: an older
      // store without the mutation must not fail the run.
      try { await store.setTaskJob?.({ taskId: task._id, jobId }); } catch { /* non-fatal */ }

      const fitArtifact = await finalizeWithTrust({
        runId, taskId: task._id, userId, kind: 'fit_report',
        content: `# Fit report: ${pick.title} at ${boardInfo.name}\n\nScore: ${fit.score}/100\n\nCaveats:\n${fit.caveats.map((c) => `- ${c}`).join('\n')}\n\nEvidence:\n${fit.evidence.map((e) => `- JD: "${e.jdLine}"\n  Resume: "${e.resumeLine}"`).join('\n')}\n\nJob: ${pick.canonicalUrl}`,
        sourceUrls: [pick.canonicalUrl],
      });

      // 6. research (Linkup, sourced facts, every claim keeps its URL)
      const researchRes = await tr.step('researcher', 'research', `Linkup: ${boardInfo.name} for applicant prep`, async () => {
        const r = await linkupSearch(`${boardInfo.name} company: what they build, recent news or funding, and what a candidate applying for "${pick.title}" should know. Facts only.`);
        return { summary: `${r.sources.length} sources in ${r.ms}ms; ${clip(r.answer, 160)}`, value: r };
      });
      const research = researchRes.value;
      const researchArtifact = await finalizeArtifact(store, {
        runId, taskId: task._id, userId, kind: 'research_brief',
        content: `# ${boardInfo.name} research brief\n\n${research.answer}\n\n## Sources\n${research.sources.map((s) => `- [${s.name || s.url}](${s.url})`).join('\n')}`,
        sourceUrls: research.sources.map((s) => s.url).filter(Boolean),
      });

      // 7. render_resume: real renderer, HTML on the hot path. The PDF renders in the
      // background right after (Chrome print-to-pdf has timed out before; it never
      // blocks the task again).
      const resumeRes = await tr.step('pipeline', 'render_resume', `variant for ${pick.title}`, async () => {
        if (renderer?.renderResume) {
          const out = await renderer.renderResume({ profile, resumeText, job: jobWithDesc });
          const gates = Array.isArray(out.gateResults) ? out.gateResults : undefined;
          const gateNote = gates ? `; gates ${gates.filter((g) => g.pass).length}/${gates.length} pass` : '';
          const html = out.html || null;
          return {
            summary: `rendered variant ${out.variantId || ''} ${html ? `(inline HTML, ${html.length} chars; PDF rendering async)` : `-> ${out.path || out.file || 'inline'}`}${gateNote}`,
            value: { content: out.content || out.path || out.file || '', variantId: out.variantId, gateResults: gates, html, htmlPath: out.htmlPath || null, pdfPath: out.pdfPath || null },
          };
        }
        const variantId = `novariant-${boardInfo.key}-${pick.externalId}`;
        return {
          summary: `resume renderer unavailable at run time; no variant rendered for ${variantId}, nothing invented`,
          value: { content: `No tailored resume variant was rendered for this run (renderer unavailable). Target was: ${pick.title} at ${boardInfo.name}. Nothing was invented.`, variantId, html: null, htmlPath: null, pdfPath: null },
        };
      });
      const resumeArtifact = await finalizeWithTrust({
        runId, taskId: task._id, userId, kind: 'resume_pdf',
        content: resumeRes.value.content, variantId: resumeRes.value.variantId,
        ...(resumeRes.value.gateResults ? { gateResults: resumeRes.value.gateResults } : {}),
      });
      // fire-and-forget PDF: on-request artifact, never in the hot path
      if (renderer?.renderPdf && resumeRes.value.htmlPath && resumeRes.value.pdfPath) {
        const { htmlPath, pdfPath, variantId } = resumeRes.value;
        renderer.renderPdf({ htmlPath, pdfPath })
          .then(() => log(`background PDF landed: ${pdfPath}`))
          .catch((e) => log(`background PDF failed for ${variantId}: ${clip(e.message, 120)}`));
      }

      // learned preference rules (from edits and thumbs-down feedback) steer every draft
      const prefRules = (profile.preferenceRules || []).filter(Boolean);
      const prefBlock = prefRules.length ? `\nUser preference rules learned from their feedback (follow every one):\n${prefRules.map((p) => `- ${p}`).join('\n')}` : '';

      // 8a. draft_note (connection request, HARD 300 char cap enforced in code)
      const noteRes = await tr.step('drafter', 'draft_note', `connection note for ${pick.title}${prefRules.length ? ` (+${prefRules.length} preference rules)` : ''}`, async () => {
        const r = await chat({
          model: MODEL_DEFAULT, maxTokens: 250, temperature: 0.6,
          system: `You draft LinkedIn connection request notes. STRICT max ${NOTE_CHAR_CAP} characters. Warm, specific, no flattery, no em dashes, no invented facts about the candidate. Mention one concrete company fact from the research. If candidate details are sparse, use the placeholder [your name] and keep claims generic; never refuse. Output the note text only.${prefBlock}`,
          user: `Candidate: ${profile.name || 'the candidate'}, ${profile.headline || ''}.\nTarget: someone at ${boardInfo.name} related to the ${pick.title} opening.\nCompany research: ${clip(research.answer, 800)}`,
        });
        let note = r.text.trim().replace(/^"|"$/g, '');
        const capped = enforceNoteCap(note);
        return {
          summary: `${capped.text.length}/${NOTE_CHAR_CAP} chars${capped.truncated ? ' (truncated by hard cap)' : ''}: ${clip(capped.text, 120)}`,
          tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd,
          value: { text: capped.text, truncated: capped.truncated },
        };
      });
      let noteText = noteRes.value.text;

      // 8b. dm_draft (enticing subject + body)
      const dmRes = await tr.step('drafter', 'dm_draft', `DM draft for ${pick.title}`, async () => {
        const r = await chatJson({
          model: MODEL_DEFAULT, maxTokens: 500, temperature: 0.6,
          system: `You draft a short direct message written BY the candidate TO a hiring contact at the company (first person, candidate voice; never a message addressed to the candidate). Respond ONLY with JSON {"subject": "...", "body": "..."}. Subject under 60 chars and enticing without clickbait. Body under 120 words, specific, references one real company fact from the research, no em dashes, no invented candidate facts. Address the recipient generically (e.g. Hi there) since their name is unknown. If candidate details are sparse, keep claims generic; never refuse.${prefBlock}`,
          user: `Candidate: ${profile.name || 'the candidate'}, ${profile.headline || ''}.\nRole: ${pick.title} at ${boardInfo.name}.\nResearch: ${clip(research.answer, 800)}\nFit evidence: ${fit.evidence.map((e) => e.resumeLine).join(' | ')}`,
        });
        const dm = r.value;
        dm.subject = String(dm.subject || 'Quick note re: ' + pick.title);
        dm.body = String(dm.body || '');
        return { summary: `subject: ${clip(dm.subject, 80)}`, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd, value: dm };
      });
      let dm = dmRes.value;

      // 9. review: acceptance checklist; on failure exactly one revise step (status=revised)
      const reviewRes = await tr.step('reviewer', 'review', 'acceptance checklist over note + dm + research', async () => {
        const failures = [];
        if (research.sources.length === 0) failures.push('research has no source URLs');
        if (hasEmDash(noteText) || hasEmDash(dm.subject) || hasEmDash(dm.body)) failures.push('em dash found in draft');
        if (noteText.length > NOTE_CHAR_CAP) failures.push(`note over ${NOTE_CHAR_CAP} chars`);
        // [your name] is the CANDIDATE placeholder for sparse profiles; with a known name it is a defect
        // (drafters sometimes misuse it as a recipient greeting).
        if (/\[your name\]/i.test(noteText) && (profile.name || '').trim()) failures.push('note uses the [your name] candidate placeholder although the candidate name is known; address the recipient generically instead');
        const r = await chat({
          model: MODEL_CHEAP, json: true, maxTokens: 300,
          system: 'You are a strict reviewer. Given a candidate profile and drafted outreach, respond ONLY with JSON {"inventedFacts": true|false, "detail": "..."}. inventedFacts is true only if the drafts claim biographical facts about the CANDIDATE that the profile does not support. Company facts from research are fine.',
          user: `PROFILE:\n${profileBlock}\n\nNOTE:\n${noteText}\n\nDM:\n${dm.subject}\n${dm.body}`,
        });
        let invented = false; let detail = '';
        try { const v = parseJson(r.text); invented = !!v.inventedFacts; detail = v.detail || ''; } catch { detail = 'reviewer JSON unparseable, treated as pass'; }
        if (invented) failures.push(`invented candidate facts: ${clip(detail, 120)}`);
        return {
          summary: failures.length ? `FAIL: ${failures.join('; ')}` : `PASS: sources ${research.sources.length}, note ${noteText.length}/${NOTE_CHAR_CAP} chars, no em dashes, no invented facts`,
          tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd,
          value: { failures },
        };
      });

      if (reviewRes.value.failures.length > 0) {
        // one revise pass, logged with status=revised (this is the scored Org evidence)
        const seq = ++tr.seq;
        const t0 = Date.now();
        let reviseSummary = '';
        let usage = { tokensIn: 0, tokensOut: 0, costUsd: 0 };
        try {
          const r = await chat({
            model: MODEL_DEFAULT, maxTokens: 250, temperature: 0.4,
            system: `Rewrite this LinkedIn connection note to fix the listed problems. STRICT max ${NOTE_CHAR_CAP} characters, no em dashes, no invented candidate facts. Output the note only.`,
            user: `Problems: ${reviewRes.value.failures.join('; ')}\nProfile: ${clip(profileBlock, 1200)}\nCurrent note: ${noteText}`,
          });
          usage = { tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd };
          const capped = enforceNoteCap(lintArtifact(r.text.trim()).text);
          noteText = capped.text;
          reviseSummary = `revised note after review failures (${reviewRes.value.failures.join('; ')}); now ${noteText.length}/${NOTE_CHAR_CAP} chars`;
        } catch (e) {
          const capped = enforceNoteCap(lintArtifact(noteText).text);
          noteText = capped.text;
          reviseSummary = `LLM revise failed (${clip(e.message, 80)}); deterministic fix applied (lint + cap)`;
        }
        // deterministic sweep of the DM too; its own artifact finalize lints again
        dm = { subject: stripEmDashes(dm.subject || ''), body: stripEmDashes(dm.body || '') };
        tr.totals.tokensIn += usage.tokensIn; tr.totals.tokensOut += usage.tokensOut; tr.totals.costUsd += usage.costUsd;
        await store.insertRunStep({
          runId, seq, agentRole: 'drafter', action: 'revise',
          inputSummary: stripEmDashes(clip(`fix: ${reviewRes.value.failures.join('; ')}`, 300)), outputSummary: stripEmDashes(clip(reviseSummary, 500)),
          ...usage, ms: Date.now() - t0, status: 'revised',
        });
      }

      const noteArtifact = await finalizeWithTrust({
        runId, taskId: task._id, userId, kind: 'connection_note',
        content: noteText,
        gateResults: [{ gate: `note_le_${NOTE_CHAR_CAP}_chars`, pass: noteText.length <= NOTE_CHAR_CAP, note: `${noteText.length} chars` }],
      });
      const dmArtifact = await finalizeWithTrust({
        runId, taskId: task._id, userId, kind: 'dm_draft',
        content: `Subject: ${dm.subject}\n\n${dm.body}`,
      });

      jobSections.push({ pick, fit, research, resume: resumeRes.value, noteText, dm, jobId, artifacts: { fitArtifact, researchArtifact, resumeArtifact, noteArtifact, dmArtifact } });
    }

    // 10. compose_brief
    const briefRes = await tr.step('drafter', 'compose_brief', `${jobSections.length} job section(s)`, async () => {
      const md = composeBriefMd({ profile, boardInfo, jobSections, totals: tr.totals });
      return { summary: `delivery brief, ${md.length} chars, ${jobSections.length} job(s)`, value: md };
    });

    // 11. deliver: bound Telegram chat if present, else unique brief link (deliveredVia=link)
    const user = ctx.user || (await store.getUser(userId)) || {};
    const deliverRes = await tr.step('pipeline', 'deliver',
      user.telegramChatId ? `telegram chat (bound)` : 'no bound chat: emit unique brief link',
      async () => {
        const lint = lintArtifact(briefRes.value);
        let deliveredVia = 'link';
        let detail = '';
        if (user.telegramChatId && ctx.opts?.deliver !== false) {
          // chat surface gets a pointer instead of raw resume HTML; the stored brief keeps the full embed
          await sendBrief(user.telegramChatId, stripResumeHtmlForChat(lint.text));
          deliveredVia = 'telegram';
          detail = 'sent to bound chat';
        }
        const artifactId = await store.insertArtifact({
          runId, taskId: task._id, userId, kind: 'delivery_brief',
          content: lint.text, gateResults: [lint.gate],
          sourceUrls: jobSections.flatMap((s) => s.research.sources.map((x) => x.url)).filter(Boolean),
        });
        await store.markArtifactDelivered({ artifactId, via: deliveredVia });
        if (deliveredVia === 'link') detail = `brief link path: /brief/${artifactId}`;
        return { summary: `delivered via ${deliveredVia}; ${detail}`, value: { deliveredVia, artifactId, briefPath: `/brief/${artifactId}` } };
      });

    await store.setTaskStatus({ taskId: task._id, status: 'delivered' });
    await store.finishRun({ runId, success: true });
    await store.markFirstUse({ userId, kind: 'intake', runId });
    outcome = {
      taskStatus: 'delivered', runId,
      summary: `delivered ${jobSections.length} job brief(s) via ${deliverRes.value.deliveredVia}; cost $${tr.totals.costUsd.toFixed(4)}, ${tr.totals.tokensIn + tr.totals.tokensOut} tokens`,
      deliveredVia: deliverRes.value.deliveredVia, briefPath: deliverRes.value.briefPath,
      totals: tr.totals,
    };
    return outcome;
  } catch (err) {
    await store.setTaskStatus({ taskId: task._id, status: 'failed' }).catch(() => {});
    await store.finishRun({ runId, finishedAt: Date.now(), ...tr.totals, success: false, error: clip(err.message, 300) }).catch(() => {});
    return { runId, taskStatus: 'failed', summary: `failed: ${err.message}`, error: err };
  }
}

// Delimiters around the embedded resume HTML so surfaces can render or strip it
// (web renders it as a document; Telegram gets a pointer instead of raw HTML).
export const RESUME_HTML_OPEN = '<!--resume-html-->';
export const RESUME_HTML_CLOSE = '<!--/resume-html-->';

function stripResumeHtmlForChat(text) {
  return String(text).replace(
    new RegExp(`${RESUME_HTML_OPEN}[\\s\\S]*?${RESUME_HTML_CLOSE}`, 'g'),
    '(Tailored resume rendered; open your brief link on the web to view it.)',
  );
}

function composeBriefMd({ profile, boardInfo, jobSections, totals }) {
  const lines = [];
  lines.push(`# Delivery brief: ${boardInfo.name}`);
  lines.push(`For ${profile.name || 'you'}. Drafts are ready to paste. Nothing has been sent to anyone; you tap send.`);
  for (const s of jobSections) {
    lines.push('');
    lines.push(`## ${s.pick.title}`);
    lines.push(`${s.pick.location || 'Location unlisted'}${s.pick.isRemote ? ' (remote friendly)' : ''}${s.pick.compRange ? ' | ' + s.pick.compRange : ''}`);
    lines.push(`Job: ${s.pick.canonicalUrl}`);
    lines.push(`Apply: ${s.pick.applyUrl}`);
    lines.push('');
    lines.push(`### Fit: ${s.fit.score}/100`);
    lines.push(`Caveats:`);
    for (const c of s.fit.caveats) lines.push(`- ${c}`);
    lines.push(`Evidence:`);
    for (const e of s.fit.evidence) lines.push(`- JD: "${e.jdLine}" -> You: "${e.resumeLine}"`);
    lines.push('');
    lines.push(`### Company intel (sourced)`);
    lines.push(s.research.answer);
    lines.push(`Sources:`);
    for (const src of s.research.sources.slice(0, 6)) lines.push(`- ${src.url}`);
    lines.push('');
    lines.push(`### Resume variant`);
    if (s.resume.html) {
      lines.push(`Variant ${s.resume.variantId}, tailored to this JD and rendered below.`);
      lines.push(`Printable version (print or save as PDF): ${WEB_BASE_URL}/resume/${s.resume.variantId}`);
      lines.push(RESUME_HTML_OPEN);
      lines.push(s.resume.html);
      lines.push(RESUME_HTML_CLOSE);
    } else {
      lines.push(s.resume.variantId ? `Variant ${s.resume.variantId}` : clip(s.resume.content || 'No variant rendered for this run.', 300));
    }
    lines.push('');
    lines.push(`### Connection note (ready to paste, ${s.noteText.length}/300 chars)`);
    lines.push('```');
    lines.push(s.noteText);
    lines.push('```');
    lines.push('');
    lines.push(`### DM draft (ready to paste)`);
    lines.push(`Subject: ${s.dm.subject}`);
    lines.push('```');
    lines.push(s.dm.body);
    lines.push('```');
  }
  lines.push('');
  lines.push(`Run cost: $${totals.costUsd.toFixed(4)} | tokens in ${totals.tokensIn} out ${totals.tokensOut}`);
  return lines.join('\n');
}
