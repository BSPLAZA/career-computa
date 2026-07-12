// Mock-mode Onboard: the same voice-first OnboardVoiceView, backed by local
// fixtures instead of Convex. Renders whenever the build has no .convex-url
// (LIVE=false), with a visible fixtures banner. Voice capture still works via
// the browser; server transcription/extraction are replaced by a local
// keyword extractor so the confirm-chips flow is fully exercisable offline.
import { OnboardVoiceView, type OnboardBackend } from './Onboard';
import { EMPTY_FIELDS, type ExtractedFields, LIVE_BOARDS } from './voice';

// ---------- in-memory fixture store (per tab, intentionally not persisted) ----------
type FixtureUser = { userId: string; email: string; signupToken: string; telegramChatId?: string | null };

const fixtures: {
  myUserId: string | null;
  users: Map<string, FixtureUser>;
  profiles: Map<string, any>;
  taskCounter: number;
} = { myUserId: null, users: new Map(), profiles: new Map(), taskCounter: 0 };

// ---------- local extraction: honest keyword heuristics, no LLM ----------
function mockExtract(transcript: string): ExtractedFields {
  const t = transcript.toLowerCase();
  const fields: ExtractedFields = { ...EMPTY_FIELDS, targetTitles: [], locations: [], hardFilters: [], softPrefs: [], companies: [] };

  const titleHits = t.match(/\b((?:senior|staff|principal|lead|group|associate)\s+)?(product manager|product designer|program manager|engineering manager|software engineer|data scientist|designer|pm)\b/g);
  for (const hit of titleHits ?? []) {
    const clean = hit.trim().replace(/\bpm\b/, 'product manager');
    const cased = clean.replace(/\b\w/g, c => c.toUpperCase());
    if (!fields.targetTitles.includes(cased)) fields.targetTitles.push(cased);
  }

  for (const city of ['san francisco', 'sf', 'new york', 'nyc', 'seattle', 'austin', 'los angeles', 'boston', 'denver', 'chicago']) {
    if (new RegExp(`\\b${city}\\b`).test(t)) {
      const label = city === 'sf' ? 'San Francisco' : city === 'nyc' ? 'New York' : city.replace(/\b\w/g, c => c.toUpperCase());
      if (!fields.locations.includes(label)) fields.locations.push(label);
    }
  }

  if (/\bremote\b/.test(t) && /\bhybrid\b/.test(t)) fields.remote = 'flexible';
  else if (/\bremote\b/.test(t)) fields.remote = 'remote';
  else if (/\bhybrid\b/.test(t)) fields.remote = 'hybrid';
  else if (/\bonsite\b|\bin[ -]office\b/.test(t)) fields.remote = 'onsite';

  const quota = t.match(/(\d{1,2})\s+(?:applications?|apps)\s+(?:a|per)\s+week/);
  if (quota) fields.weeklyQuota = Math.min(Number(quota[1]), 100);

  const noMatches = t.match(/\bno\s+([a-z -]{3,40}?)(?:[,.;]|$| and | or )/g);
  for (const m of noMatches ?? []) {
    const rule = m.replace(/[,.;]$/, '').replace(/ (and|or) $/, '').trim();
    if (!/\b(visa|sponsor|salary|comp|pay)\b/.test(rule) && !fields.hardFilters.includes(rule)) fields.hardFilters.push(rule);
  }

  for (const b of LIVE_BOARDS) {
    if (t.includes(b.name.toLowerCase())) fields.companies.push(b.name);
  }
  return fields;
}

// ---------- fixture backend ----------
const mockBackend: OnboardBackend = {
  fixtures: true,
  // Plain reads (no hooks needed): the view re-renders on its own state changes
  // right after every backend call, so these always show fresh fixture data.
  useUser: userId => (userId ? fixtures.users.get(userId) ?? null : null),
  useProfile: userId => (userId ? fixtures.profiles.get(userId) ?? null : null),
  async signup(email) {
    const existing = [...fixtures.users.values()].find(u => u.email === email.toLowerCase());
    const user: FixtureUser = existing ?? {
      userId: `fixture-user-${fixtures.users.size + 1}`,
      email: email.toLowerCase(),
      signupToken: 'fixture-token',
      telegramChatId: null,
    };
    fixtures.users.set(user.userId, user);
    return { userId: user.userId, telegramDeepLink: 'https://t.me/CareerAgencyBriefs_bot?start=fixture-token (placeholder, mock mode)' };
  },
  async deleteMyData(userId, signupToken) {
    const user = fixtures.users.get(userId);
    if (!user || user.signupToken !== signupToken) return { ok: false, error: 'forbidden' };
    fixtures.users.delete(userId);
    fixtures.profiles.delete(userId);
    return { ok: true };
  },
  async upsertProfile({ userId, profile }) {
    fixtures.profiles.set(userId, profile);
    return { profileId: `fixture-profile-${userId}` };
  },
  async createTask() {
    fixtures.taskCounter += 1;
    return { taskId: `fixture-task-${fixtures.taskCounter}` };
  },
  async extract(transcript) {
    // Simulate the round trip briefly so the "Reading your words..." state shows.
    await new Promise(r => setTimeout(r, 350));
    return { ok: true, fields: mockExtract(transcript) };
  },
  getMyUserId: () => fixtures.myUserId,
  setMyUserId: id => { fixtures.myUserId = id; },
  clearMyUserId: () => { fixtures.myUserId = null; },
};

export default function MockOnboardVoice() {
  return <OnboardVoiceView backend={mockBackend} />;
}
