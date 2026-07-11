// Voice capture + extraction helpers for the onboarding conversation.
// Chain: MediaRecorder -> POST /api/transcribe (ElevenLabs scribe_v1, key stays in the Worker)
//        -> browser SpeechRecognition fallback -> plain typing. Never blocks the text path.

export type ExtractedFields = {
  currentRole: string | null;
  targetTitles: string[];
  locations: string[];
  remote: 'remote' | 'hybrid' | 'onsite' | 'flexible' | null;
  weeklyQuota: number | null;
  hardFilters: string[];
  softPrefs: string[];
  companies: string[];
};

export const EMPTY_FIELDS: ExtractedFields = {
  currentRole: null, targetTitles: [], locations: [], remote: null,
  weeklyQuota: null, hardFilters: [], softPrefs: [], companies: [],
};

// ---------- recorder ----------
export type Recorder = { stop: () => void };

function pickMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

// Starts mic capture; resolves the Recorder once recording is live.
// onDone fires with the audio blob after stop(); onError on any capture failure.
export async function startRecorder(onDone: (blob: Blob) => void, onError: (why: string) => void): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('recorder_unsupported');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  rec.onerror = () => { stream.getTracks().forEach(t => t.stop()); onError('recording_failed'); };
  rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop());
    onDone(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
  };
  rec.start();
  return { stop: () => { if (rec.state !== 'inactive') rec.stop(); } };
}

export async function transcribeBlob(blob: Blob): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const form = new FormData();
    form.append('file', blob, 'recording.webm');
    const res = await fetch('/api/transcribe', { method: 'POST', body: form });
    const data = await res.json();
    if (res.ok && data.ok && data.text) return { ok: true, text: data.text };
    return { ok: false, error: data.error || `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// ---------- browser SpeechRecognition fallback ----------
export function speechRecognitionCtor(): any {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Live dictation into onText; returns a stop function, or null if unsupported.
export function startDictation(onText: (finalChunk: string) => void, onEnd: () => void): (() => void) | null {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;
  const sr = new Ctor();
  sr.continuous = true;
  sr.interimResults = false;
  sr.lang = 'en-US';
  sr.onresult = (e: any) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) onText(e.results[i][0].transcript);
    }
  };
  sr.onend = onEnd;
  sr.onerror = onEnd;
  try { sr.start(); } catch { return null; }
  return () => { try { sr.stop(); } catch { /* already stopped */ } };
}

// ---------- extraction ----------
export async function extractTranscript(transcript: string): Promise<{ ok: true; fields: ExtractedFields } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
    const data = await res.json();
    if (res.ok && data.ok && data.fields) return { ok: true, fields: { ...EMPTY_FIELDS, ...data.fields } };
    return { ok: false, error: data.error || `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// ---------- live board registry (mirror of agents/boards.js keys; scan tasks must be board:<key>) ----------
export const LIVE_BOARDS: { key: string; name: string }[] = [
  { key: 'anthropic', name: 'Anthropic' },
  { key: 'stripe', name: 'Stripe' },
  { key: 'databricks', name: 'Databricks' },
  { key: 'figma', name: 'Figma' },
  { key: 'instacart', name: 'Instacart' },
  { key: 'scaleai', name: 'Scale AI' },
  { key: 'coinbase', name: 'Coinbase' },
  { key: 'brex', name: 'Brex' },
  { key: 'samsara', name: 'Samsara' },
  { key: 'pinterest', name: 'Pinterest' },
  { key: 'gusto', name: 'Gusto' },
  { key: 'robinhood', name: 'Robinhood' },
  { key: 'sierra', name: 'Sierra' },
  { key: 'openai', name: 'OpenAI' },
  { key: 'clickhouse', name: 'ClickHouse' },
  { key: 'supabase', name: 'Supabase' },
  { key: 'linear', name: 'Linear' },
  { key: 'ramp', name: 'Ramp' },
  { key: 'veeva', name: 'Veeva' },
  { key: 'matchgroup', name: 'Match Group' },
];

// "Open A.I." -> openai, "scale ai" -> scaleai, "Match Group" -> matchgroup
export function matchBoard(companyName: string): { key: string; name: string } | null {
  const norm = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!norm) return null;
  return LIVE_BOARDS.find(b => b.key === norm || b.name.toLowerCase().replace(/[^a-z0-9]/g, '') === norm) ?? null;
}
