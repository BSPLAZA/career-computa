// boards.js: verified public ATS board registry (tokens verified live earlier today).
// A board here is a Company with pollable=true. atsType matches contracts/schema.ts Company.atsType.
export const BOARDS = {
  // greenhouse
  anthropic:  { name: 'Anthropic',  atsType: 'greenhouse', boardToken: 'anthropic' },
  stripe:     { name: 'Stripe',     atsType: 'greenhouse', boardToken: 'stripe' },
  databricks: { name: 'Databricks', atsType: 'greenhouse', boardToken: 'databricks' },
  figma:      { name: 'Figma',      atsType: 'greenhouse', boardToken: 'figma' },
  instacart:  { name: 'Instacart',  atsType: 'greenhouse', boardToken: 'instacart' },
  scaleai:    { name: 'Scale AI',   atsType: 'greenhouse', boardToken: 'scaleai' },
  coinbase:   { name: 'Coinbase',   atsType: 'greenhouse', boardToken: 'coinbase' },
  brex:       { name: 'Brex',       atsType: 'greenhouse', boardToken: 'brex' },
  samsara:    { name: 'Samsara',    atsType: 'greenhouse', boardToken: 'samsara' },
  pinterest:  { name: 'Pinterest',  atsType: 'greenhouse', boardToken: 'pinterest' },
  gusto:      { name: 'Gusto',      atsType: 'greenhouse', boardToken: 'gusto' },
  robinhood:  { name: 'Robinhood',  atsType: 'greenhouse', boardToken: 'robinhood' },
  // ashby (huge payloads, 60s CDN cache; sierra is the demo hot path)
  sierra:     { name: 'Sierra',     atsType: 'ashby', boardToken: 'sierra' },
  openai:     { name: 'OpenAI',     atsType: 'ashby', boardToken: 'openai' },
  clickhouse: { name: 'ClickHouse', atsType: 'ashby', boardToken: 'clickhouse' },
  supabase:   { name: 'Supabase',   atsType: 'ashby', boardToken: 'supabase' },
  linear:     { name: 'Linear',     atsType: 'ashby', boardToken: 'linear' },
  ramp:       { name: 'Ramp',       atsType: 'ashby', boardToken: 'ramp' },
  // lever
  veeva:      { name: 'Veeva',      atsType: 'lever', boardToken: 'veeva' },
  matchgroup: { name: 'Match Group', atsType: 'lever', boardToken: 'matchgroup' },
};

export function getBoard(key) {
  const b = BOARDS[String(key).toLowerCase()];
  if (!b) throw new Error(`Unknown board "${key}". Known: ${Object.keys(BOARDS).join(', ')}`);
  return { key: String(key).toLowerCase(), ...b };
}

// ---------- free-text company mapping (the quick-path unlock) ----------
// Users type company names, not board keys. Match order: exact (after normalizing
// case/spacing/punctuation, so "Data bricks" lands on databricks), then alias,
// then containment, then edit distance <= 2. Returns null only on a true miss.
const normBase = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES = {
  scale: 'scaleai',
  match: 'matchgroup',
  tinder: 'matchgroup',
  veevasystems: 'veeva',
  chatgpt: 'openai',
  claude: 'anthropic',
};

function editDistance(a, b) {
  const m = a.length; const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

export function mapToBoard(freeText) {
  const raw = String(freeText || '').trim();
  const n = normBase(raw);
  if (!n) return null;
  // exact against key, name, token (normalization already handles case/spacing/punctuation)
  for (const [key, b] of Object.entries(BOARDS)) {
    if (n === key || n === normBase(b.name) || n === normBase(b.boardToken)) {
      return { board: { key, ...b }, matched: 'exact', input: raw };
    }
  }
  if (ALIASES[n]) {
    const key = ALIASES[n];
    return { board: { key, ...BOARDS[key] }, matched: 'alias', input: raw };
  }
  // containment both ways, 4+ chars so "ramp" works but "ai" cannot hijack
  if (n.length >= 4) {
    for (const [key, b] of Object.entries(BOARDS)) {
      const bn = normBase(b.name);
      if (bn.includes(n) || n.includes(bn)) return { board: { key, ...b }, matched: 'fuzzy_contains', input: raw };
    }
  }
  // typo tolerance: edit distance <= 2 for 5+ chars, <= 1 for 4 chars
  let best = null;
  for (const [key, b] of Object.entries(BOARDS)) {
    for (const cand of [key, normBase(b.name)]) {
      const d = editDistance(n, cand);
      const limit = n.length >= 5 ? 2 : n.length === 4 ? 1 : 0;
      if (d <= limit && (!best || d < best.d)) best = { d, key, b };
    }
  }
  if (best) return { board: { key: best.key, ...best.b }, matched: `fuzzy_distance_${best.d}`, input: raw };
  return null;
}

// Pull candidate company names out of a task input string. Handles the quick-path
// format "Quick path: X to Y; targets A, B, C" plus bare free text.
export function extractCompanyCandidates(input) {
  const s = String(input || '').trim();
  const m = s.match(/targets?\s*[:]?\s+(.+)$/i);
  const list = m ? m[1] : (/^quick path:/i.test(s) ? '' : s);
  return list
    .split(/[,;/]| and /i)
    .map((x) => x.replace(/^board:/i, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}
