// ats.js: normalized fetchers for the three public ATS boards (Greenhouse, Lever, Ashby).
// All endpoints are public, no auth. Normalizes into the Job shape from contracts/schema.ts
// (minus _id/userId/companyId, which the store assigns on insert).
// Gotcha encoded: a 200 with zero jobs means a DEAD BOARD (company changed ATS); we surface
// a warning, never a silent empty result.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '.cache');
const ASHBY_CACHE_MS = 60_000; // Ashby CDN caches 60s; never poll faster.

const UA = { 'user-agent': 'career-agency-intake/0.1 (buildathon demo)' };

async function getJson(url) {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { accept: 'application/json', ...UA } });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${text.slice(0, 200)}`);
  return { data: JSON.parse(text), ms: Date.now() - t0, bytes: text.length };
}

// Minimal HTML to text: decode common entities, strip tags, collapse whitespace.
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<(br|\/p|\/li|\/div|\/h[1-6]|\/tr)[^>]*>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '\n- ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function looksRemote(...fields) {
  return fields.some((f) => typeof f === 'string' && /remote/i.test(f));
}

// ---------- Greenhouse ----------
// Scan WITHOUT content (5x smaller); fetch per-job detail only for shortlisted jobs.
export async function fetchGreenhouseBoard(token) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;
  const { data, ms, bytes } = await getJson(url);
  const jobs = (data.jobs || []).map((j) => ({
    externalId: String(j.id),
    title: j.title,
    canonicalUrl: j.absolute_url,
    applyUrl: j.absolute_url,
    postedAt: j.first_published ? Date.parse(j.first_published) : (j.updated_at ? Date.parse(j.updated_at) : undefined),
    location: j.location?.name, // location.name is a single object on greenhouse
    isRemote: looksRemote(j.location?.name, j.title) || undefined,
    compRange: undefined,
    descriptionText: undefined, // filled by fetchGreenhouseJobDetail for shortlisted jobs only
  }));
  return { atsType: 'greenhouse', boardToken: token, jobs, ms, bytes };
}

export async function fetchGreenhouseJobDetail(token, jobId) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs/${jobId}?content=true`;
  const { data, ms, bytes } = await getJson(url);
  return { descriptionText: htmlToText(data.content), raw: { title: data.title, location: data.location?.name }, ms, bytes };
}

// ---------- Lever ----------
// Bare array; createdAt is epoch millis; categories.location; descriptionPlain.
export async function fetchLeverBoard(company) {
  const url = `https://api.lever.co/v0/postings/${company}?mode=json`;
  const { data, ms, bytes } = await getJson(url);
  const arr = Array.isArray(data) ? data : [];
  const jobs = arr.map((j) => ({
    externalId: String(j.id),
    title: j.text,
    canonicalUrl: j.hostedUrl,
    applyUrl: j.applyUrl || j.hostedUrl,
    postedAt: typeof j.createdAt === 'number' ? j.createdAt : undefined,
    location: j.categories?.location,
    isRemote: looksRemote(j.workplaceType, j.categories?.location) || undefined,
    compRange: j.salaryRange ? `${j.salaryRange.min}-${j.salaryRange.max} ${j.salaryRange.currency || ''}`.trim() : undefined,
    descriptionText: j.descriptionPlain || htmlToText(j.description),
  }));
  return { atsType: 'lever', boardToken: company, jobs, ms, bytes };
}

// ---------- Ashby ----------
// Huge payloads (openai ~12 MB); cached to disk per org, 60s CDN cache respected.
// publishedAt ISO; isRemote bool; compensation exposed with ?includeCompensation=true.
export async function fetchAshbyBoard(org) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, `ashby-${org}.json`);
  let payload = null; let ms = 0; let bytes = 0; let fromCache = false;
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (Date.now() - cached.fetchedAt < ASHBY_CACHE_MS) {
        payload = cached.data; fromCache = true; bytes = cached.bytes || 0;
      }
    } catch { /* corrupt cache, refetch */ }
  }
  if (!payload) {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`;
    const r = await getJson(url);
    payload = r.data; ms = r.ms; bytes = r.bytes;
    writeFileSync(cachePath, JSON.stringify({ fetchedAt: Date.now(), bytes, data: payload }));
  }
  const jobs = (payload.jobs || []).map((j) => ({
    externalId: String(j.id),
    title: j.title,
    canonicalUrl: j.jobUrl,
    applyUrl: j.applyUrl || j.jobUrl,
    postedAt: j.publishedAt ? Date.parse(j.publishedAt) : undefined,
    location: j.location,
    isRemote: typeof j.isRemote === 'boolean' ? j.isRemote : undefined,
    compRange: j.compensation?.compensationTierSummary || j.compensation?.summaryComponents?.map((c) => c.summary).join('; ') || undefined,
    descriptionText: j.descriptionPlain || htmlToText(j.descriptionHtml),
  }));
  return { atsType: 'ashby', boardToken: org, jobs, ms, bytes, fromCache };
}

// ---------- Unified ----------
export async function fetchBoard(board) {
  const { atsType, boardToken } = board;
  let result;
  if (atsType === 'greenhouse') result = await fetchGreenhouseBoard(boardToken);
  else if (atsType === 'lever') result = await fetchLeverBoard(boardToken);
  else if (atsType === 'ashby') result = await fetchAshbyBoard(boardToken);
  else throw new Error(`Unsupported atsType: ${atsType}`);
  if (result.jobs.length === 0) {
    result.warning = `DEAD BOARD: ${atsType}/${boardToken} returned 200 with zero jobs. Company likely changed ATS. Not an empty match set.`;
  }
  return result;
}

// Fill descriptionText for a shortlisted job when the scan did not include it.
export async function ensureDescription(board, job) {
  if (job.descriptionText) return job;
  if (board.atsType === 'greenhouse') {
    const d = await fetchGreenhouseJobDetail(board.boardToken, job.externalId);
    return { ...job, descriptionText: d.descriptionText };
  }
  return job;
}
