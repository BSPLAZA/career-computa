// Mock seed data, typed against the frozen contract. Used ONLY while the
// Convex backend is not yet wired (no repo-root .convex-url at build time).
// The UI shows a MOCK DATA banner whenever this store is active, so mock rows
// can never be confused with the real demo path.
import type { User, UserProfile, Company, Job, Task, Run, RunStep, Artifact, Feedback } from './types';
import type { AgentConfigStub } from './types';

const now = Date.now();
const min = 60_000;
const hr = 3_600_000;

export const users: User[] = [
  {
    _id: 'u1', email: 'bryan@plazallc.dev', signedUpAt: now - 4 * hr, firstUseAt: now - 3.8 * hr,
    firstUseKind: 'export_upload', firstRunId: 'run1', isTeam: true, demoMode: false,
    telegramChatId: '52210001', signupToken: 'tok-bryan-001',
  },
  {
    _id: 'u2', email: 'kaveh@examplemail.com', signedUpAt: now - 2.5 * hr, firstUseAt: now - 2.3 * hr,
    firstUseKind: 'intake', firstRunId: 'run3', isTeam: false, demoMode: false,
    telegramChatId: '52210002', signupToken: 'tok-outsider-002',
  },
  {
    _id: 'u3', email: 'mira@samplebox.io', signedUpAt: now - 70 * min, firstUseAt: now - 55 * min,
    firstUseKind: 'resume_upload', firstRunId: 'run5', isTeam: false, demoMode: false,
    signupToken: 'tok-outsider-003',
  },
  {
    _id: 'u4', email: 'devon@testerhub.net', signedUpAt: now - 30 * min, isTeam: false, demoMode: false,
    signupToken: 'tok-outsider-004',
  },
];

export const profiles: UserProfile[] = [
  {
    _id: 'p1', userId: 'u1', name: 'Bryan Plaza', headline: 'Product Manager, platform and AI',
    locations: ['Seattle, WA', 'Remote US'],
    goals: { targetTitles: ['Senior Product Manager', 'Principal PM'], compFloor: 185000, remote: 'flexible', weeklyQuota: 10 },
    hardFilters: ['no relocation outside US', 'comp floor 185k'],
    softPrefs: ['AI/agents surface area', 'platform teams'],
    stylePrefs: { style: 'plaza-serif', density: 'full', summaryLines: 3 },
    preferenceRules: ['Lead notes with the shared-employer hook', 'Never open with I hope this finds you well'],
  },
  {
    _id: 'p2', userId: 'u2', name: 'Kaveh Nouri', headline: 'Backend engineer, infra',
    locations: ['SF Bay Area'],
    goals: { targetTitles: ['Staff Engineer'], remote: 'hybrid', weeklyQuota: 5 },
    hardFilters: ['no crypto'], softPrefs: ['dev tools'],
    stylePrefs: { style: 'modern-sans', density: 'lean', summaryLines: 2 },
    preferenceRules: [],
  },
  {
    _id: 'p3', userId: 'u3', name: 'Mira Castellanos', headline: 'Data scientist',
    locations: ['Remote US'],
    goals: { targetTitles: ['Senior Data Scientist'], remote: 'remote' },
    hardFilters: [], softPrefs: ['healthcare'],
    stylePrefs: { style: 'modern-sans', density: 'full', summaryLines: 2 },
    preferenceRules: [],
  },
];

export const companies: Company[] = [
  { _id: 'c1', name: 'Anthropic', atsType: 'greenhouse', boardToken: 'anthropic', pollable: true, tier: 1, briefSourceUrls: ['https://www.anthropic.com/careers'] },
  { _id: 'c2', name: 'Vercel', atsType: 'ashby', boardToken: 'vercel', pollable: true, tier: 1, briefSourceUrls: ['https://vercel.com/careers'] },
  { _id: 'c3', name: 'Ramp', atsType: 'ashby', boardToken: 'ramp', pollable: true, tier: 2, briefSourceUrls: ['https://ramp.com/careers'] },
  { _id: 'c4', name: 'Figma', atsType: 'greenhouse', boardToken: 'figma', pollable: true, tier: 1, briefSourceUrls: ['https://www.figma.com/careers/'] },
  { _id: 'c5', name: 'Notion', atsType: 'greenhouse', boardToken: 'notion', pollable: true, tier: 2, briefSourceUrls: ['https://www.notion.com/careers'] },
];

export const jobs: Job[] = [
  {
    _id: 'j1', userId: 'u1', companyId: 'c1', title: 'Senior Product Manager, Agent Platform',
    canonicalUrl: 'https://boards.greenhouse.io/anthropic/jobs/500001', applyUrl: 'https://boards.greenhouse.io/anthropic/jobs/500001',
    postedAt: now - 26 * hr, discoveredAt: now - 3.6 * hr, location: 'San Francisco, CA', isRemote: false, compRange: '$230k to $290k',
    fitScore: 87, caveats: ['JD asks for 2 years shipped agent products; resume shows 14 months'],
    fitEvidence: [{ jdLine: 'Own roadmap for agent orchestration surface', resumeLine: 'Led roadmap for workflow automation platform serving 40k users' }],
    hardFilterResult: { rejected: false }, state: 'delivered',
  },
  {
    _id: 'j2', userId: 'u1', companyId: 'c2', title: 'Product Manager, AI SDK',
    canonicalUrl: 'https://jobs.ashbyhq.com/vercel/500002', applyUrl: 'https://jobs.ashbyhq.com/vercel/500002',
    postedAt: now - 50 * hr, discoveredAt: now - 3.5 * hr, location: 'Remote US', isRemote: true, compRange: '$190k to $240k',
    fitScore: 81, caveats: ['Role skews developer-tools GTM; thinner resume evidence there'],
    fitEvidence: [{ jdLine: 'Define metrics for SDK adoption', resumeLine: 'Defined activation metrics adopted org-wide' }],
    hardFilterResult: { rejected: false }, state: 'queued',
  },
  {
    _id: 'j3', userId: 'u1', companyId: 'c3', title: 'Product Lead, Spend Intelligence',
    canonicalUrl: 'https://jobs.ashbyhq.com/ramp/500003', applyUrl: 'https://jobs.ashbyhq.com/ramp/500003',
    postedAt: now - 20 * hr, discoveredAt: now - 3.4 * hr, location: 'New York, NY', isRemote: false,
    caveats: [], hardFilterResult: { rejected: true, reason: 'Onsite NYC conflicts with hard filter: no relocation outside US west + remote flexible' },
    state: 'auto_rejected',
  },
  {
    _id: 'j4', userId: 'u1', companyId: 'c4', title: 'Senior PM, Platform Extensibility',
    canonicalUrl: 'https://boards.greenhouse.io/figma/jobs/500004', applyUrl: 'https://boards.greenhouse.io/figma/jobs/500004',
    postedAt: now - 8 * hr, discoveredAt: now - 3.2 * hr, location: 'Remote US', isRemote: true, compRange: '$200k to $260k',
    fitScore: 78, caveats: ['Plugin ecosystem experience is adjacent, not direct'],
    fitEvidence: [{ jdLine: 'Grow third-party developer ecosystem', resumeLine: 'Ran partner API program, 120 integrations' }],
    hardFilterResult: { rejected: false }, state: 'assessed',
  },
  {
    _id: 'j5', userId: 'u1', companyId: 'c5', title: 'Product Manager, Enterprise Search',
    canonicalUrl: 'https://boards.greenhouse.io/notion/jobs/500005', applyUrl: 'https://boards.greenhouse.io/notion/jobs/500005',
    postedAt: now - 30 * hr, discoveredAt: now - 2 * hr, location: 'San Francisco, CA', isRemote: false,
    caveats: [], state: 'discovered',
  },
  {
    _id: 'j6', userId: 'u2', companyId: 'c2', title: 'Staff Engineer, Build Infrastructure',
    canonicalUrl: 'https://jobs.ashbyhq.com/vercel/500006', applyUrl: 'https://jobs.ashbyhq.com/vercel/500006',
    postedAt: now - 12 * hr, discoveredAt: now - 2.2 * hr, location: 'SF Bay Area', isRemote: false, compRange: '$240k to $310k',
    fitScore: 84, caveats: ['JD wants Bazel at scale; candidate lists Buck2'],
    fitEvidence: [{ jdLine: 'Own remote build execution', resumeLine: 'Built distributed build cache cutting CI 41 percent' }],
    hardFilterResult: { rejected: false }, state: 'delivered',
  },
  {
    _id: 'j7', userId: 'u1', companyId: 'c1', title: 'Product Manager, Trust and Safety Tooling',
    canonicalUrl: 'https://boards.greenhouse.io/anthropic/jobs/500007', applyUrl: 'https://boards.greenhouse.io/anthropic/jobs/500007',
    postedAt: now - 60 * hr, discoveredAt: now - 3.6 * hr, location: 'San Francisco, CA',
    fitScore: 62, caveats: ['No direct T&S background', 'Fit driven mostly by platform overlap'],
    hardFilterResult: { rejected: false }, state: 'applied',
  },
  {
    _id: 'j8', userId: 'u3', companyId: 'c5', title: 'Senior Data Scientist, Growth',
    canonicalUrl: 'https://boards.greenhouse.io/notion/jobs/500008', applyUrl: 'https://boards.greenhouse.io/notion/jobs/500008',
    postedAt: now - 15 * hr, discoveredAt: now - 50 * min, location: 'Remote US', isRemote: true,
    fitScore: 79, caveats: ['Growth experimentation depth unclear from resume'],
    hardFilterResult: { rejected: false }, state: 'queued',
  },
];

export const tasks: Task[] = [
  { _id: 't1', userId: 'u1', kind: 'intake', input: 'LinkedIn export + resume upload; build profile and start scan', status: 'delivered', createdAt: now - 3.9 * hr, completedAt: now - 3.6 * hr },
  { _id: 't2', userId: 'u1', kind: 'followup', input: 'j1', jobId: 'j1', status: 'delivered', createdAt: now - 3.5 * hr, completedAt: now - 3.1 * hr },
  { _id: 't3', userId: 'u2', kind: 'intake', input: 'Quick path: Backend engineer to Staff Engineer; targets Vercel, Cloudflare, Temporal', status: 'delivered', createdAt: now - 2.4 * hr, completedAt: now - 2.1 * hr },
  { _id: 't4', userId: 'u2', kind: 'pasted_message', input: 'Recruiter screen invite from Vercel, asks for availability this week', status: 'running', createdAt: now - 25 * min },
  { _id: 't5', userId: 'u3', kind: 'intake', input: 'Resume PDF upload; target Senior Data Scientist remote', status: 'delivered', createdAt: now - 60 * min, completedAt: now - 42 * min },
  { _id: 't6', userId: 'u1', kind: 'followup', input: 'j4', jobId: 'j4', status: 'failed', createdAt: now - 90 * min, completedAt: now - 84 * min },
  { _id: 't7', userId: 'u3', kind: 'pasted_message', input: 'Ambiguous LinkedIn DM from unknown recruiter, salary way below floor', status: 'escalated', createdAt: now - 35 * min, escalation: { reason: 'Comp 40 percent below stated floor and sender identity unverifiable', context: 'DM claims to be from Notion talent team but profile URL does not resolve; needs a human decision before any reply draft' } },
  { _id: 't8', userId: 'u4', kind: 'judge_assigned', input: 'Judge task: discover and brief one live PM role at Figma', status: 'queued', createdAt: now - 10 * min },
];

export const runs: Run[] = [
  { _id: 'run1', taskId: 't1', userId: 'u1', startedAt: now - 3.9 * hr, finishedAt: now - 3.6 * hr, costUsd: 0.2143, tokensIn: 48210, tokensOut: 9120, success: true },
  { _id: 'run2', taskId: 't2', userId: 'u1', startedAt: now - 3.5 * hr, finishedAt: now - 3.1 * hr, costUsd: 0.3391, tokensIn: 61540, tokensOut: 14830, success: true },
  { _id: 'run3', taskId: 't3', userId: 'u2', startedAt: now - 2.4 * hr, finishedAt: now - 2.1 * hr, costUsd: 0.1876, tokensIn: 39880, tokensOut: 8450, success: true },
  { _id: 'run4', taskId: 't4', userId: 'u2', startedAt: now - 25 * min, costUsd: 0.0412, tokensIn: 9210, tokensOut: 1830 },
  { _id: 'run5', taskId: 't5', userId: 'u3', startedAt: now - 60 * min, finishedAt: now - 42 * min, costUsd: 0.1592, tokensIn: 33110, tokensOut: 7240, success: true },
  { _id: 'run6', taskId: 't6', userId: 'u1', startedAt: now - 90 * min, finishedAt: now - 84 * min, costUsd: 0.0287, tokensIn: 6120, tokensOut: 940, success: false, error: 'Greenhouse board fetch 503 three times; retry budget exhausted' },
  { _id: 'run7', taskId: 't7', userId: 'u3', startedAt: now - 35 * min, finishedAt: now - 33 * min, costUsd: 0.0198, tokensIn: 4880, tokensOut: 720, success: false, error: 'Escalated to human: unverifiable sender plus comp below floor' },
];

export const runSteps: RunStep[] = [
  // run2: the flagship trace, nested with a revised row
  { _id: 's1', runId: 'run2', seq: 1, agentRole: 'manager', action: 'plan', inputSummary: 'Follow up on j1 (Anthropic Senior PM, Agent Platform)', outputSummary: 'Plan: research company, render resume variant, draft connection note, review, compose brief', tokensIn: 2100, tokensOut: 410, costUsd: 0.0091, ms: 3800, status: 'ok' },
  { _id: 's2', runId: 'run2', seq: 2, parentSeq: 1, agentRole: 'researcher', action: 'research', inputSummary: 'Anthropic agent platform team, recent launches', outputSummary: 'Brief: 6 findings, 4 source URLs, 2 named products', tokensIn: 18400, tokensOut: 3200, costUsd: 0.0870, ms: 41200, status: 'ok' },
  { _id: 's3', runId: 'run2', seq: 3, parentSeq: 1, agentRole: 'drafter', action: 'render_resume', inputSummary: 'Profile p1 + fit evidence for j1, style plaza-serif full', outputSummary: 'resume_pdf variant v-agent-platform-01, 2 pages', tokensIn: 14200, tokensOut: 5100, costUsd: 0.0940, ms: 38900, status: 'ok' },
  { _id: 's4', runId: 'run2', seq: 4, parentSeq: 1, agentRole: 'drafter', action: 'draft_note', inputSummary: 'Connection note to hiring manager, 300 char cap', outputSummary: 'Draft 322 chars, over cap', tokensIn: 6100, tokensOut: 480, costUsd: 0.0210, ms: 9100, status: 'ok' },
  { _id: 's5', runId: 'run2', seq: 5, parentSeq: 1, agentRole: 'reviewer', action: 'review', inputSummary: 'Gate check: char cap, source URLs, no em dashes, claims traceable', outputSummary: 'FAIL char_cap 322 > 300; sent back to drafter', tokensIn: 4800, tokensOut: 350, costUsd: 0.0150, ms: 6200, status: 'ok' },
  { _id: 's6', runId: 'run2', seq: 6, parentSeq: 5, agentRole: 'drafter', action: 'revise', inputSummary: 'Cut 67 chars, keep the shared-employer hook per preference rule', outputSummary: 'Draft 255 chars, passes cap', tokensIn: 5200, tokensOut: 310, costUsd: 0.0170, ms: 7400, status: 'revised' },
  { _id: 's7', runId: 'run2', seq: 7, parentSeq: 1, agentRole: 'reviewer', action: 'gate_check', inputSummary: 'Re-run all gates on revised note + resume + brief', outputSummary: 'PASS 5 of 5 gates', tokensIn: 4100, tokensOut: 290, costUsd: 0.0130, ms: 5100, status: 'ok' },
  { _id: 's8', runId: 'run2', seq: 8, parentSeq: 1, agentRole: 'manager', action: 'compose_brief', inputSummary: 'Assemble delivery brief: fit report, resume variant, note, research', outputSummary: 'delivery_brief a4 queued for tap', tokensIn: 6640, tokensOut: 4690, costUsd: 0.0830, ms: 12600, status: 'ok' },
  // run1: intake
  { _id: 's9', runId: 'run1', seq: 1, agentRole: 'manager', action: 'plan', inputSummary: 'New user u1 intake: LinkedIn export + resume', outputSummary: 'Plan: parse export, build profile, seed answer bank, first scan', tokensIn: 1800, tokensOut: 380, costUsd: 0.0080, ms: 3400, status: 'ok' },
  { _id: 's10', runId: 'run1', seq: 2, parentSeq: 1, agentRole: 'pipeline', action: 'fetch_board', inputSummary: 'Poll greenhouse:anthropic, ashby:vercel, greenhouse:figma', outputSummary: '212 postings fetched, 9 pass title filter', tokensIn: 15200, tokensOut: 2100, costUsd: 0.0510, ms: 68000, status: 'ok' },
  { _id: 's11', runId: 'run1', seq: 3, parentSeq: 1, agentRole: 'scout', action: 'fit_score', inputSummary: '9 candidate jobs vs profile p1', outputSummary: '5 scored 60+, 1 auto_rejected on hard filter, evidence attached', tokensIn: 22400, tokensOut: 4100, costUsd: 0.0980, ms: 52300, status: 'ok' },
  { _id: 's12', runId: 'run1', seq: 4, parentSeq: 1, agentRole: 'manager', action: 'deliver', inputSummary: 'First-scan digest for u1', outputSummary: 'Digest artifact a1 delivered via telegram', tokensIn: 8810, tokensOut: 2540, costUsd: 0.0573, ms: 8900, status: 'ok' },
  // run6: the visible failure
  { _id: 's13', runId: 'run6', seq: 1, agentRole: 'manager', action: 'plan', inputSummary: 'Follow up on j4 (Figma Senior PM)', outputSummary: 'Plan: refresh JD, research, draft', tokensIn: 1700, tokensOut: 320, costUsd: 0.0070, ms: 3100, status: 'ok' },
  { _id: 's14', runId: 'run6', seq: 2, parentSeq: 1, agentRole: 'pipeline', action: 'fetch_board', inputSummary: 'Refresh greenhouse:figma posting 500004', outputSummary: '503 from board API, attempt 1 of 3', tokensIn: 900, tokensOut: 110, costUsd: 0.0040, ms: 21000, status: 'error' },
  { _id: 's15', runId: 'run6', seq: 3, parentSeq: 1, agentRole: 'pipeline', action: 'fetch_board', inputSummary: 'Retry 3 of 3 after backoff', outputSummary: '503 again; giving up, surfacing failure', tokensIn: 900, tokensOut: 120, costUsd: 0.0040, ms: 34000, status: 'error' },
  { _id: 's16', runId: 'run6', seq: 4, agentRole: 'manager', action: 'deliver', inputSummary: 'Report failure honestly on ledger', outputSummary: 'Task t6 marked failed, exception visible', tokensIn: 800, tokensOut: 90, costUsd: 0.0037, ms: 1200, status: 'ok' },
  // run7: escalation
  { _id: 's17', runId: 'run7', seq: 1, agentRole: 'manager', action: 'plan', inputSummary: 'Pasted recruiter DM for u3', outputSummary: 'Classify sender, check comp vs floor', tokensIn: 1500, tokensOut: 260, costUsd: 0.0060, ms: 2800, status: 'ok' },
  { _id: 's18', runId: 'run7', seq: 2, parentSeq: 1, agentRole: 'researcher', action: 'research', inputSummary: 'Verify sender profile URL and company claim', outputSummary: 'Profile URL does not resolve; company claim unverifiable', tokensIn: 2600, tokensOut: 340, costUsd: 0.0098, ms: 18400, status: 'ok' },
  { _id: 's19', runId: 'run7', seq: 3, agentRole: 'manager', action: 'gate_check', inputSummary: 'Escalation policy: unverifiable sender + comp below floor', outputSummary: 'Escalated with full context, no reply drafted', tokensIn: 780, tokensOut: 120, costUsd: 0.0040, ms: 1900, status: 'escalated' },
  // run3, run5: outsider intakes (condensed)
  { _id: 's20', runId: 'run3', seq: 1, agentRole: 'manager', action: 'plan', inputSummary: 'Quick path intake for u2', outputSummary: 'Plan: build profile from form, scan 3 target boards', tokensIn: 1600, tokensOut: 300, costUsd: 0.0070, ms: 3000, status: 'ok' },
  { _id: 's21', runId: 'run3', seq: 2, parentSeq: 1, agentRole: 'pipeline', action: 'fetch_board', inputSummary: 'ashby:vercel + 2 more boards', outputSummary: '148 postings, 4 pass filters', tokensIn: 12800, tokensOut: 1900, costUsd: 0.0440, ms: 54000, status: 'ok' },
  { _id: 's22', runId: 'run3', seq: 3, parentSeq: 1, agentRole: 'scout', action: 'fit_score', inputSummary: '4 jobs vs quick-path profile', outputSummary: '2 scored 70+, evidence attached', tokensIn: 14100, tokensOut: 2800, costUsd: 0.0660, ms: 38000, status: 'ok' },
  { _id: 's23', runId: 'run3', seq: 4, parentSeq: 1, agentRole: 'manager', action: 'deliver', inputSummary: 'First digest for u2', outputSummary: 'Digest delivered via telegram', tokensIn: 5380, tokensOut: 1450, costUsd: 0.0706, ms: 7200, status: 'ok' },
  { _id: 's24', runId: 'run5', seq: 1, agentRole: 'manager', action: 'plan', inputSummary: 'Resume-only intake for u3', outputSummary: 'Parse resume, infer targets, scan', tokensIn: 1500, tokensOut: 280, costUsd: 0.0060, ms: 2900, status: 'ok' },
  { _id: 's25', runId: 'run5', seq: 2, parentSeq: 1, agentRole: 'scout', action: 'fit_score', inputSummary: 'Scored notion growth DS role vs parsed resume', outputSummary: '79 with 1 caveat', tokensIn: 9800, tokensOut: 1600, costUsd: 0.0480, ms: 29000, status: 'ok' },
  { _id: 's26', runId: 'run5', seq: 3, parentSeq: 1, agentRole: 'manager', action: 'deliver', inputSummary: 'First digest for u3', outputSummary: 'Digest delivered via brief link (no telegram bound)', tokensIn: 4200, tokensOut: 1100, costUsd: 0.1052, ms: 6800, status: 'ok' },
  // run4: in flight
  { _id: 's27', runId: 'run4', seq: 1, agentRole: 'manager', action: 'plan', inputSummary: 'Recruiter screen invite for u2', outputSummary: 'Draft availability reply + prep sheet', tokensIn: 1400, tokensOut: 260, costUsd: 0.0060, ms: 2700, status: 'ok' },
  { _id: 's28', runId: 'run4', seq: 2, parentSeq: 1, agentRole: 'drafter', action: 'draft_note', inputSummary: 'Reply draft with 3 slots from stated availability', outputSummary: 'In progress', tokensIn: 7810, tokensOut: 1570, costUsd: 0.0352, ms: 0, status: 'ok' },
];

export const artifacts: Artifact[] = [
  {
    _id: 'a1', runId: 'run1', taskId: 't1', userId: 'u1', kind: 'fit_report',
    content: '## First scan digest\n5 roles scored 60+. Top: Anthropic Senior PM, Agent Platform (87). 1 auto-rejected on hard filter (Ramp, onsite NYC). Evidence attached per role.',
    sourceUrls: ['https://boards.greenhouse.io/anthropic/jobs/500001', 'https://jobs.ashbyhq.com/vercel/500002'],
    deliveredVia: 'telegram', deliveredAt: now - 3.6 * hr,
  },
  {
    _id: 'a2', runId: 'run2', taskId: 't2', userId: 'u1', kind: 'connection_note',
    content: 'Hi Dana, your agent platform launch post hit home. I spent the last year shipping workflow automation for 40k users and hit the same eval-gap wall your team wrote about. Would love to trade notes on how you are approaching PM hiring for the platform team.',
    gateResults: [
      { gate: 'char_cap_300', pass: true, note: '255 chars after revision' },
      { gate: 'source_urls_present', pass: true },
      { gate: 'no_em_dashes', pass: true },
      { gate: 'claims_traceable', pass: true },
      { gate: 'tone_preference_rules', pass: true },
    ],
    sourceUrls: ['https://www.anthropic.com/news/agent-platform', 'https://www.linkedin.com/in/dana-example'],
  },
  {
    _id: 'a3', runId: 'run2', taskId: 't2', userId: 'u1', kind: 'research_brief',
    content: '## Anthropic, Agent Platform team\n1. Launched agent orchestration surface in May 2026 (source 1).\n2. Team led by Dana R., prev platform PM at Stripe (source 2).\n3. Hiring push: 3 PM openings this quarter (source 3).',
    sourceUrls: ['https://www.anthropic.com/news/agent-platform', 'https://www.linkedin.com/in/dana-example', 'https://boards.greenhouse.io/anthropic'],
  },
  {
    _id: 'a4', runId: 'run2', taskId: 't2', userId: 'u1', kind: 'delivery_brief',
    content: '## Brief: Anthropic Senior PM, Agent Platform\nFit 87 with 1 caveat. Resume variant v-agent-platform-01 attached. Connection note ready (255 chars). Research brief with 4 sources. Tap approve to unlock send.',
    sourceUrls: ['https://boards.greenhouse.io/anthropic/jobs/500001'],
    deliveredVia: 'telegram', deliveredAt: now - 3.1 * hr,
  },
  {
    _id: 'a5', runId: 'run3', taskId: 't3', userId: 'u2', kind: 'dm_draft',
    content: 'Hey Priya, saw Vercel is scaling the build infra team. I cut CI time 41 percent at my current gig with a distributed cache design I would genuinely enjoy comparing against Turborepo internals. Open to a quick chat?',
    gateResults: [
      { gate: 'char_cap_300', pass: true, note: '214 chars' },
      { gate: 'source_urls_present', pass: true },
      { gate: 'no_em_dashes', pass: true },
    ],
    sourceUrls: ['https://jobs.ashbyhq.com/vercel/500006', 'https://www.linkedin.com/in/priya-example'],
  },
  {
    _id: 'a6', runId: 'run5', taskId: 't5', userId: 'u3', kind: 'fit_report',
    content: '## Scan result\nNotion Senior Data Scientist, Growth scored 79. Caveat: growth experimentation depth unclear from resume. Evidence pair attached.',
    sourceUrls: ['https://boards.greenhouse.io/notion/jobs/500008'],
    deliveredVia: 'link', deliveredAt: now - 42 * min,
  },
  {
    _id: 'a7', runId: 'run5', taskId: 't5', userId: 'u3', kind: 'connection_note',
    content: 'Hi Tomas, your growth team post on activation experiments matched work I did on churn cohorts at my last role. I am exploring the Senior DS opening and would value 15 minutes on how the team splits experimentation vs modeling.',
    gateResults: [
      { gate: 'char_cap_300', pass: true, note: '241 chars' },
      { gate: 'no_em_dashes', pass: true },
    ],
    sourceUrls: ['https://boards.greenhouse.io/notion/jobs/500008'],
  },
];

export const feedback: Feedback[] = [
  { _id: 'f1', userId: 'u1', artifactId: 'a4', verdict: 'approve', at: now - 3 * hr },
  { _id: 'f2', userId: 'u2', artifactId: 'a5', verdict: 'edit', editDiff: 'Dropped "genuinely", tightened opener', reason: 'Reads too eager', at: now - 100 * min },
];

export const agentConfigs: AgentConfigStub[] = [
  { role: 'manager', paused: false, dailyQuota: 200, updatedAt: now - 4 * hr },
  { role: 'scout', paused: false, dailyQuota: 500, updatedAt: now - 4 * hr },
  { role: 'researcher', paused: false, dailyQuota: 120, updatedAt: now - 4 * hr },
  { role: 'drafter', paused: false, dailyQuota: 150, updatedAt: now - 4 * hr },
  { role: 'pipeline', paused: false, dailyQuota: 400, updatedAt: now - 4 * hr },
  { role: 'reviewer', paused: false, dailyQuota: 150, updatedAt: now - 4 * hr },
];
