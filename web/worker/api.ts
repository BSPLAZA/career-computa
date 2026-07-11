// Worker API routes for the dashboard. Serves /api/* then falls through to static assets.
// Secrets (never client-side, never logged): ELEVENLABS_API_KEY, OPENROUTER_API_KEY.
//   npx wrangler secret put ELEVENLABS_API_KEY
//   npx wrangler secret put OPENROUTER_API_KEY
// Routes:
//   POST /api/transcribe  multipart form field "file" (audio blob) -> ElevenLabs STT scribe_v1 -> { ok, text }
//   POST /api/extract     { transcript } -> OpenRouter extraction -> { ok, fields }
// Policy: comp expectation and work authorization are TYPE-ONLY. The extractor is told to skip
// them and this worker strips them even if the model returns them anyway.

interface Env {
  ELEVENLABS_API_KEY: string;
  OPENROUTER_API_KEY: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// House rule: no em dashes in anything we render or store (u2014 em, u2013 en).
function noEmDash(s: string): string {
  return s.replace(/\u2014/g, ', ').replace(/\u2013/g, '-');
}

async function transcribe(request: Request, env: Env): Promise<Response> {
  if (!env.ELEVENLABS_API_KEY) return json({ ok: false, error: 'stt_not_configured' }, 503);
  let file: Blob | null = null;
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const f = form.get('file');
    if (f instanceof Blob) file = f;
  } else if (ct.startsWith('audio/')) {
    file = await request.blob();
  }
  if (!file || file.size === 0) return json({ ok: false, error: 'no_audio' }, 400);
  if (file.size > 15 * 1024 * 1024) return json({ ok: false, error: 'audio_too_large' }, 413);

  const upstream = new FormData();
  upstream.append('file', file, 'recording.webm');
  upstream.append('model_id', 'scribe_v1');

  let res: Response;
  try {
    res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY },
      body: upstream,
    });
  } catch {
    return json({ ok: false, error: 'stt_unreachable' }, 502);
  }
  if (!res.ok) {
    // Do not forward upstream bodies; they can echo request metadata.
    return json({ ok: false, error: 'stt_failed', status: res.status }, 502);
  }
  const data = (await res.json()) as { text?: string };
  const text = typeof data.text === 'string' ? noEmDash(data.text.trim()) : '';
  if (!text) return json({ ok: false, error: 'empty_transcript' }, 422);
  return json({ ok: true, text });
}

const EXTRACT_SYSTEM = [
  'You extract structured career goals from a job seeker describing their search out loud.',
  'Respond ONLY with JSON, no prose, matching exactly:',
  '{"currentRole": string|null, "targetTitles": string[], "locations": string[],',
  ' "remote": "remote"|"hybrid"|"onsite"|"flexible"|null, "weeklyQuota": number|null,',
  ' "hardFilters": string[], "softPrefs": string[], "companies": string[]}',
  'targetTitles: job titles they want next. locations: cities or regions mentioned.',
  'weeklyQuota: applications per week if they state one. companies: company names they mention wanting.',
  'hardFilters: absolute dealbreakers stated as machine-checkable rules, e.g. "no onsite-only roles".',
  'softPrefs: nice-to-haves. Keep every string short and in the speaker\'s words.',
  'NEVER extract compensation numbers or visa / work-authorization status; those are typed by the user separately. Omit them entirely, including from hardFilters.',
  'If a field is not mentioned use null or []. No em dashes anywhere.',
].join('\n');

async function extract(request: Request, env: Env): Promise<Response> {
  if (!env.OPENROUTER_API_KEY) return json({ ok: false, error: 'extract_not_configured' }, 503);
  let transcript = '';
  try {
    const body = (await request.json()) as { transcript?: string };
    transcript = String(body.transcript ?? '').trim();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }
  if (!transcript) return json({ ok: false, error: 'empty_transcript' }, 400);
  if (transcript.length > 20000) transcript = transcript.slice(0, 20000);

  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        temperature: 0,
        max_tokens: 700,
        messages: [
          { role: 'system', content: EXTRACT_SYSTEM },
          { role: 'user', content: transcript },
        ],
      }),
    });
  } catch {
    return json({ ok: false, error: 'llm_unreachable' }, 502);
  }
  if (!res.ok) return json({ ok: false, error: 'llm_failed', status: res.status }, 502);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return json({ ok: false, error: 'unparseable_extraction' }, 502);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return json({ ok: false, error: 'unparseable_extraction' }, 502);
  }

  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? noEmDash(v.trim()) : null);
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => noEmDash(x.trim())).slice(0, 12) : [];
  const remoteVals = new Set(['remote', 'hybrid', 'onsite', 'flexible']);
  const quota = typeof parsed.weeklyQuota === 'number' && parsed.weeklyQuota > 0 && parsed.weeklyQuota <= 100
    ? Math.round(parsed.weeklyQuota) : null;

  // Enforce the type-only policy server-side: comp and visa never flow from voice.
  const fields = {
    currentRole: str(parsed.currentRole),
    targetTitles: strArr(parsed.targetTitles),
    locations: strArr(parsed.locations),
    remote: typeof parsed.remote === 'string' && remoteVals.has(parsed.remote) ? parsed.remote : null,
    weeklyQuota: quota,
    hardFilters: strArr(parsed.hardFilters).filter(f => !/\b(visa|sponsor|salary|comp|\$|pay)\b/i.test(f)),
    softPrefs: strArr(parsed.softPrefs),
    companies: strArr(parsed.companies),
  };
  return json({ ok: true, fields });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
      if (url.pathname === '/api/transcribe') return transcribe(request, env);
      if (url.pathname === '/api/extract') return extract(request, env);
      return json({ ok: false, error: 'not_found' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
