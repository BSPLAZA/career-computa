// linkup.js: Linkup web research helper. Every claim keeps its source URL.
import { requireEnv } from './env.js';

const LINKUP_URL = 'https://api.linkup.so/v1/search';

// Returns { answer, sources: [{ name, url, snippet }], ms }.
export async function linkupSearch(query, { depth = 'standard' } = {}) {
  const key = requireEnv('LINKUP_API_KEY');
  const t0 = Date.now();
  const res = await fetch(LINKUP_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ q: query, depth, outputType: 'sourcedAnswer' }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Linkup ${res.status}: ${raw.slice(0, 300)}`);
  const data = JSON.parse(raw);
  return {
    answer: data.answer || '',
    sources: (data.sources || []).map((s) => ({ name: s.name, url: s.url, snippet: s.snippet })),
    ms: Date.now() - t0,
  };
}
