// Voice-first onboarding conversation. Screen 1 captures the user's own words
// (mic or typing), extraction turns them into confirm chips, steps 2 and 3 are cards for
// signup + Telegram and the document drop. Sensitive fields (comp, work authorization) are
// TYPE-ONLY by product decision: never voice-filled, always a typed confirm field.
//
// The data layer is injected as an OnboardBackend, so the exact same experience
// renders in live mode (Convex, the default export) and in mock mode (fixtures,
// see MockOnboard.tsx). The view never talks to Convex directly.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api, getMyUserId, setMyUserId, clearMyUserId } from '../convex';
import type { Id } from '../../../convex/_generated/dataModel';
import { useStore } from '../store';
import {
  EMPTY_FIELDS, type ExtractedFields, startRecorder, type Recorder,
  transcribeBlob, startDictation, extractTranscript, LIVE_BOARDS, matchBoard,
} from './voice';

const BOT_LINK_HELP = 'Open the link, hit Start, briefs arrive in that chat.';
const MAX_RECORD_SECONDS = 120;

// ---------- backend seam ----------
export type OnboardUser = { email: string; signupToken: string; telegramChatId?: string | null } | null | undefined;

export type OnboardBackend = {
  // true renders the fixtures banner (mock mode)
  fixtures: boolean;
  // hooks: the view calls each exactly once per render, so hook order stays stable
  useUser(userId: string | null): OnboardUser;
  useProfile(userId: string | null): any;
  signup(email: string): Promise<{ userId: string; telegramDeepLink: string }>;
  deleteMyData(userId: string): Promise<unknown>;
  upsertProfile(args: { userId: string; profile: any }): Promise<unknown>;
  createTask(args: { userId: string; input: string }): Promise<{ taskId: string }>;
  extract(transcript: string): Promise<{ ok: true; fields: ExtractedFields } | { ok: false; error: string }>;
  getMyUserId(): string | null;
  setMyUserId(id: string): void;
  clearMyUserId(): void;
};

type MicState = 'idle' | 'recording' | 'dictating' | 'transcribing' | 'unavailable';

// ---------- small pieces ----------
function ChipGroup(props: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  addPlaceholder: string;
  followUp: string;
  badge?: (item: string) => { text: string; cls: string } | null;
}) {
  const [adding, setAdding] = useState('');
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  function commitAdd() {
    const v = adding.trim();
    if (!v) return;
    props.onChange([...props.items, v]);
    setAdding('');
  }
  function commitEdit() {
    if (editIdx === null) return;
    const next = [...props.items];
    const v = editVal.trim();
    if (v) next[editIdx] = v; else next.splice(editIdx, 1);
    props.onChange(next);
    setEditIdx(null);
  }

  return (
    <div className="vo-group">
      <div className="vo-group-label">{props.label}</div>
      {props.items.length === 0 && <div className="vo-followup">{props.followUp}</div>}
      <div className="vo-chips">
        {props.items.map((item, i) => {
          const badge = props.badge?.(item) ?? null;
          return editIdx === i ? (
            <span className="vo-chip vo-chip-editing" key={i}>
              <input
                autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditIdx(null); }}
                onBlur={commitEdit}
              />
            </span>
          ) : (
            <span className="vo-chip" key={i}>
              <button className="vo-chip-text" title="Tap to edit" onClick={() => { setEditIdx(i); setEditVal(item); }}>{item}</button>
              {badge && <span className={`badge ${badge.cls}`} style={{ marginLeft: 6 }}>{badge.text}</span>}
              <button className="vo-chip-x" title="Remove" onClick={() => props.onChange(props.items.filter((_, j) => j !== i))}>x</button>
            </span>
          );
        })}
        <span className="vo-chip vo-chip-add">
          <input
            value={adding} placeholder={props.addPlaceholder}
            onChange={e => setAdding(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitAdd(); } }}
            onBlur={commitAdd}
          />
        </span>
      </div>
    </div>
  );
}

type FileCard = { name: string; sizeKb: number; status: string };

// ---------- live backend (default export) ----------
export default function OnboardVoice() {
  const signupMut = useMutation(api.users.signup);
  const deleteMut = useMutation(api.users.deleteMyData);
  const createTaskMut = useMutation(api.tasks.createTask);
  const upsertProfileMut = useMutation(api.intake.upsertProfile);
  const backend: OnboardBackend = {
    fixtures: false,
    useUser: userId => useQuery(api.users.getUser, userId ? { userId: userId as Id<'users'> } : 'skip'),
    useProfile: userId => useQuery(api.userProfiles.getByUserId, userId ? { userId: userId as Id<'users'> } : 'skip'),
    signup: async email => {
      const r = await signupMut({ email });
      return { userId: r.userId, telegramDeepLink: r.telegramDeepLink };
    },
    deleteMyData: userId => deleteMut({ userId: userId as Id<'users'> }),
    upsertProfile: ({ userId, profile }) => upsertProfileMut({ userId: userId as Id<'users'>, profile }),
    createTask: async ({ userId, input }) => {
      const r = await createTaskMut({ userId: userId as Id<'users'>, kind: 'intake', input });
      return { taskId: r.taskId };
    },
    extract: extractTranscript,
    getMyUserId, setMyUserId, clearMyUserId,
  };
  return <OnboardVoiceView backend={backend} />;
}

// ---------- main view (backend-agnostic) ----------
export function OnboardVoiceView({ backend }: { backend: OnboardBackend }) {
  const { state, dispatch } = useStore();

  const [email, setEmail] = useState('');
  const [signupResult, setSignupResult] = useState<{ userId: string; telegramDeepLink: string } | null>(null);
  const [deleted, setDeleted] = useState(false);
  const myId = deleted ? null : (signupResult?.userId ?? backend.getMyUserId());
  const me = backend.useUser(myId);
  const existingProfile = backend.useProfile(myId);

  // voice + transcript
  const [micState, setMicState] = useState<MicState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const dictationStopRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  // extraction + chips
  const [extracting, setExtracting] = useState(false);
  const [fields, setFields] = useState<ExtractedFields | null>(null);
  const [extractNote, setExtractNote] = useState<string | null>(null);

  // typed-only sensitive confirms
  const [compFloor, setCompFloor] = useState('');
  const [visa, setVisa] = useState<'unset' | 'yes' | 'no'>('unset');

  // save + scan
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ scans: { name: string; taskId: string }[]; routed: string[] } | null>(null);

  // uploads
  const [files, setFiles] = useState<FileCard[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => () => {
    recorderRef.current?.stop();
    dictationStopRef.current?.();
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  function startTimer() {
    setSeconds(0);
    timerRef.current = window.setInterval(() => {
      setSeconds(s => {
        if (s + 1 >= MAX_RECORD_SECONDS) stopCapture();
        return s + 1;
      });
    }, 1000);
  }
  function clearTimer() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  }

  function appendTranscript(text: string) {
    setTranscript(prev => (prev.trim() ? prev.trim() + ' ' : '') + text.trim());
  }

  async function onMicClick() {
    if (micState === 'recording') { stopCapture(); return; }
    if (micState === 'dictating') { stopCapture(); return; }
    if (micState === 'transcribing') return;
    // Preferred path: MediaRecorder -> Worker -> ElevenLabs scribe_v1.
    try {
      const rec = await startRecorder(
        async blob => {
          clearTimer();
          setMicState('transcribing');
          const r = await transcribeBlob(blob);
          if (r.ok) {
            appendTranscript(r.text);
            setVoiceNote(null);
            setMicState('idle');
          } else {
            setMicState('idle');
            fallbackToDictation('Transcription service is unavailable right now.');
          }
        },
        () => { clearTimer(); setMicState('idle'); fallbackToDictation('Recording failed.'); },
      );
      recorderRef.current = rec;
      setMicState('recording');
      setVoiceNote(null);
      startTimer();
    } catch {
      fallbackToDictation('Microphone access was denied or is unsupported here.');
    }
  }

  function fallbackToDictation(reason: string) {
    const stop = startDictation(appendTranscript, () => {
      dictationStopRef.current = null;
      setMicState(s => (s === 'dictating' ? 'idle' : s));
      clearTimer();
    });
    if (stop) {
      dictationStopRef.current = stop;
      setMicState('dictating');
      setVoiceNote(`${reason} Switched to your browser's built-in dictation.`);
      startTimer();
    } else {
      setMicState('unavailable');
      setVoiceNote(`${reason} No dictation available in this browser, so just type below. Typing works exactly as well.`);
    }
  }

  function stopCapture() {
    clearTimer();
    if (recorderRef.current) { recorderRef.current.stop(); recorderRef.current = null; return; }
    if (dictationStopRef.current) { dictationStopRef.current(); dictationStopRef.current = null; setMicState('idle'); }
  }

  async function onExtract() {
    if (!transcript.trim() || extracting) return;
    setExtracting(true);
    setExtractNote(null);
    const r = await backend.extract(transcript);
    setExtracting(false);
    if (r.ok) {
      setFields(r.fields);
    } else {
      // Text path never dead-ends: open empty chips for manual fill.
      setFields({ ...EMPTY_FIELDS });
      setExtractNote('Auto-extraction is unavailable right now. Fill the chips below by hand; everything still works.');
    }
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    const r = await backend.signup(email.trim());
    backend.setMyUserId(r.userId);
    setSignupResult({ userId: r.userId, telegramDeepLink: r.telegramDeepLink });
    setDeleted(false);
  }

  async function onDelete() {
    if (!myId) return;
    await backend.deleteMyData(myId);
    backend.clearMyUserId();
    setSignupResult(null);
    setDeleted(true);
    setSaveResult(null);
  }

  const f = fields;
  const canSave = !!myId && !!f && f.targetTitles.length > 0 && !saving;

  async function onSave() {
    if (!myId || !f || saving) return;
    setSaving(true);
    try {
      const ex = existingProfile ?? null;
      const compNum = compFloor.trim() ? Number(compFloor.replace(/[^0-9.]/g, '')) : undefined;
      await backend.upsertProfile({
        userId: myId,
        profile: {
          name: ex?.name ?? '',
          ...(ex?.headline ? { headline: ex.headline } : {}),
          locations: f.locations.length ? f.locations : (ex?.locations ?? []),
          goals: {
            targetTitles: f.targetTitles,
            ...(compNum && isFinite(compNum) && compNum > 0 ? { compFloor: compNum } : (ex?.goals.compFloor ? { compFloor: ex.goals.compFloor } : {})),
            remote: (f.remote ?? ex?.goals.remote ?? 'flexible') as 'remote' | 'hybrid' | 'onsite' | 'flexible',
            ...(visa !== 'unset' ? { visaNeeded: visa === 'yes' } : (ex?.goals.visaNeeded !== undefined ? { visaNeeded: ex.goals.visaNeeded } : {})),
            ...(f.weeklyQuota ? { weeklyQuota: f.weeklyQuota } : (ex?.goals.weeklyQuota ? { weeklyQuota: ex.goals.weeklyQuota } : {})),
          },
          hardFilters: f.hardFilters,
          softPrefs: f.softPrefs,
          stylePrefs: ex?.stylePrefs ?? { style: 'modern-sans', density: 'lean', summaryLines: 2 },
          preferenceRules: ex?.preferenceRules ?? [],
        },
      });

      // Scan tasks: the intake worker only understands board:<key>, so free-text
      // companies that do not match a live board are routed to a human instead.
      const matched: { key: string; name: string }[] = [];
      const routed: string[] = [];
      for (const c of f.companies) {
        const b = matchBoard(c);
        if (b && !matched.some(m => m.key === b.key)) matched.push(b);
        else if (!b) routed.push(c);
      }
      const scans: { name: string; taskId: string }[] = [];
      for (const b of matched.slice(0, 3)) {
        const r = await backend.createTask({ userId: myId, input: `board:${b.key}` });
        scans.push({ name: b.name, taskId: r.taskId });
      }
      if (scans.length === 0 && routed.length > 0) {
        // Honest escalation path: a human routes companies we cannot poll yet.
        const r = await backend.createTask({ userId: myId, input: routed[0] });
        scans.push({ name: `${routed[0]} (human routing)`, taskId: r.taskId });
      }
      setSaveResult({ scans, routed });
    } finally {
      setSaving(false);
    }
  }

  function addFiles(list: FileList) {
    const cards = Array.from(list).map(fl => ({ name: fl.name, sizeKb: Math.max(1, Math.round(fl.size / 1024)), status: 'received, parser pickup pending' }));
    setFiles(prev => [...prev, ...cards]);
  }

  const micLabel =
    micState === 'recording' ? `Listening... ${seconds}s (tap to stop)` :
    micState === 'dictating' ? `Dictating... ${seconds}s (tap to stop)` :
    micState === 'transcribing' ? 'Transcribing...' :
    micState === 'unavailable' ? 'Mic unavailable, type below' :
    'Tap and talk';

  return (
    <div className="vo">
      <style>{VO_CSS}</style>
      <h2>Onboard</h2>
      <p className="sub">Your AI job-search agency. Say what you want in your own words; agents scan real job boards, score fit, research companies, and draft your outreach. Nothing is sent without your tap.</p>
      {backend.fixtures && (
        <div className="vo-note" style={{ marginBottom: 12 }}>
          FIXTURES: mock mode. This is the real voice-first onboarding flow running on local fixtures:
          signup, extraction, and saved profiles stay in this tab, no backend is reached, and the Telegram link is a placeholder.
        </div>
      )}

      {/* Screen 1: the conversation */}
      <section className="panel vo-hero">
        <h3>1. Tell Computa about your career</h3>
        <p className="muted vo-hint">
          Say it like you would to a friend: what you do now, what you want next, where, any dealbreakers,
          and companies you care about. Or just type it.
        </p>
        <div className="vo-mic-row">
          <button
            className={`vo-mic ${micState === 'recording' || micState === 'dictating' ? 'vo-mic-live' : ''}`}
            onClick={onMicClick}
            disabled={micState === 'transcribing' || micState === 'unavailable'}
            title={micLabel}
            aria-label={micLabel}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
            </svg>
          </button>
          <div>
            <div className="vo-mic-label">{micLabel}</div>
            <div className="muted" style={{ fontSize: 12 }}>Voice or typing, same result. Nothing is saved until you confirm.</div>
          </div>
        </div>
        {voiceNote && <div className="vo-note">{voiceNote}</div>}
        <textarea
          className="vo-transcript"
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          placeholder="Example: I'm a product manager at a fintech, looking for senior PM roles, remote or hybrid in SF, no onsite-only jobs, and I really want Stripe, Figma or Linear."
        />
        <div className="card-actions" style={{ marginTop: 10 }}>
          <button className="primary" onClick={onExtract} disabled={!transcript.trim() || extracting}>
            {extracting ? 'Reading your words...' : f ? 'Re-extract from text' : 'Turn this into my profile'}
          </button>
          {transcript.trim() && !f && <span className="muted" style={{ fontSize: 12 }}>Next: you get chips to confirm, nothing auto-commits.</span>}
        </div>
        {extractNote && <div className="vo-note">{extractNote}</div>}

        {f && (
          <div className="vo-confirm">
            <h4>Confirm what I heard <span className="muted" style={{ fontWeight: 400 }}>(tap a chip to edit, x to drop)</span></h4>
            <ChipGroup
              label="Target titles" items={f.targetTitles}
              onChange={v => setFields({ ...f, targetTitles: v })}
              addPlaceholder="add a title" followUp="What titles are you aiming for next? Add at least one."
            />
            <ChipGroup
              label="Locations" items={f.locations}
              onChange={v => setFields({ ...f, locations: v })}
              addPlaceholder="add a location" followUp="Any cities or regions? Leave empty for anywhere."
            />
            <div className="vo-group">
              <div className="vo-group-label">Work setup</div>
              <div className="vo-chips">
                {(['remote', 'hybrid', 'onsite', 'flexible'] as const).map(opt => (
                  <button key={opt} className={`vo-chip vo-chip-pick ${f.remote === opt ? 'vo-chip-on' : ''}`} onClick={() => setFields({ ...f, remote: opt })}>{opt}</button>
                ))}
              </div>
              {!f.remote && <div className="vo-followup">Remote, hybrid, onsite, or flexible?</div>}
            </div>
            <div className="vo-group">
              <div className="vo-group-label">Applications per week</div>
              <div className="vo-chips">
                <span className="vo-chip vo-chip-add">
                  <input
                    inputMode="numeric" style={{ minWidth: 60 }}
                    value={f.weeklyQuota ?? ''}
                    placeholder="no target"
                    onChange={e => {
                      const n = Number(e.target.value.replace(/[^0-9]/g, ''));
                      setFields({ ...f, weeklyQuota: n > 0 ? Math.min(n, 100) : null });
                    }}
                  />
                </span>
                <span className="muted" style={{ fontSize: 12 }}>how many applications the agency should aim for weekly</span>
              </div>
            </div>
            <ChipGroup
              label="Dealbreakers (auto-reject rules)" items={f.hardFilters}
              onChange={v => setFields({ ...f, hardFilters: v })}
              addPlaceholder="add a dealbreaker" followUp="Anything that should be auto-rejected with a logged reason?"
            />
            <ChipGroup
              label="Nice-to-haves" items={f.softPrefs}
              onChange={v => setFields({ ...f, softPrefs: v })}
              addPlaceholder="add a preference" followUp="Preferences that should boost a job's score?"
            />
            <ChipGroup
              label="Target companies" items={f.companies}
              onChange={v => setFields({ ...f, companies: v })}
              addPlaceholder="add a company" followUp="Which companies should agents scan first?"
              badge={c => matchBoard(c) ? { text: 'live board', cls: 'b-ok' } : { text: 'human routing', cls: 'b-warn' }}
            />
            <div className="vo-suggest">
              <span className="muted">Live boards agents can scan right now:</span>
              {LIVE_BOARDS.filter(b => !f.companies.some(c => matchBoard(c)?.key === b.key)).slice(0, 8).map(b => (
                <button key={b.key} className="vo-chip vo-chip-pick" onClick={() => setFields({ ...f, companies: [...f.companies, b.name] })}>+ {b.name}</button>
              ))}
            </div>

            <div className="vo-typed">
              <div className="vo-group-label">Private details <span className="badge b-info">typed only, never captured from voice</span></div>
              <div className="vo-typed-row">
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Minimum base comp in USD (optional)</label>
                  <input inputMode="numeric" value={compFloor} onChange={e => setCompFloor(e.target.value)} placeholder="e.g. 185000" />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>Need visa sponsorship?</label>
                  <select value={visa} onChange={e => setVisa(e.target.value as 'unset' | 'yes' | 'no')}>
                    <option value="unset">Prefer not to say</option>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="card-actions" style={{ marginTop: 14 }}>
              <button className="primary" onClick={onSave} disabled={!canSave}>
                {saving ? 'Saving...' : 'Confirm profile and start scanning'}
              </button>
              {!myId && <span className="badge b-warn">Add your email in step 2 first</span>}
              {myId && f.targetTitles.length === 0 && <span className="badge b-warn">Add at least one target title</span>}
            </div>
            {saveResult && (
              <div className="vo-done">
                <span className="badge b-ok">Profile saved</span>{' '}
                {saveResult.scans.length > 0 ? (
                  <>
                    {saveResult.scans.length} scan task{saveResult.scans.length > 1 ? 's' : ''} queued: {saveResult.scans.map(s => s.name).join(', ')}.{' '}
                    <a href="#ledger" onClick={e => { e.preventDefault(); dispatch({ type: 'setTab', tab: 'ledger' }); }}>Watch the Ledger</a>
                  </>
                ) : 'No scans queued yet; add a company above and confirm again.'}
                {saveResult.routed.length > 0 && saveResult.scans.some(s => !s.name.includes('human routing')) && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    Not on a live board yet, a human will route: {saveResult.routed.join(', ')}.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="onboard-grid" style={{ marginTop: 16 }}>
        {/* Step 2: signup card */}
        <section className="panel">
          <h3>2. Where results reach you</h3>
          {!myId ? (
            <form onSubmit={onSignup}>
              <div className="field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <button className="primary" type="submit">Start with Career Computa</button>
            </form>
          ) : (
            <>
              <p style={{ marginBottom: 10 }}>
                Signed up{me ? <> as <b className="mono">{state.demoMode ? me.email.slice(0, 1) + '***@' + me.email.split('@')[1] : me.email}</b></> : null}
              </p>
              {(signupResult?.telegramDeepLink || me) && (
                <div className="field">
                  <label>Connect Telegram ({BOT_LINK_HELP})</label>
                  <div className="deeplink">
                    <a href={signupResult?.telegramDeepLink ?? `https://t.me/CareerAgencyBriefs_bot?start=${me!.signupToken}`} target="_blank" rel="noreferrer">
                      {signupResult?.telegramDeepLink ?? `https://t.me/CareerAgencyBriefs_bot?start=${me!.signupToken}`}
                    </a>
                  </div>
                </div>
              )}
              {me?.telegramChatId
                ? <span className="badge b-ok">Telegram connected</span>
                : <span className="badge b-warn">Not connected yet</span>}
            </>
          )}
        </section>

        {/* Step 3: upload card */}
        <section className="panel">
          <h3>3. Drop what you have</h3>
          <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Drop what you have, we fill the rest, you confirm.</p>
          <div
            className={`dropzone ${dragOver ? 'hover' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          >
            <p><b>Drop files here</b></p>
            <p style={{ marginTop: 6, fontSize: 12 }}>
              Resume PDF, LinkedIn data export (.zip), performance docs, brag sheets. Anything that proves what you did.
            </p>
            <label className="vo-browse">
              or browse
              <input type="file" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
          {files.length > 0 && (
            <div className="vo-files">
              {files.map((fl, i) => (
                <div className="vo-file" key={i}>
                  <div className="vo-file-name mono">{fl.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{fl.sizeKb} KB</div>
                  <span className="badge b-info">{fl.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="privacy panel section-gap">
        <b>Privacy:</b> your documents stay in your tenant, feed only your own agents, and are never used to train anything.
        Drafts are written for you; nothing is ever sent anywhere without your explicit tap.
        Audio goes to transcription only and is never stored; comp and visa answers are typed, never recorded.
        {myId && <button className="danger small" style={{ marginLeft: 10 }} onClick={onDelete}>Delete my data</button>}
        {deleted && <span className="badge b-err" style={{ marginLeft: 10 }}>All rows purged</span>}
      </div>
    </div>
  );
}

const VO_CSS = `
.vo-hero { border-color: var(--accent-edge, #c6e0d4); background: linear-gradient(180deg, #ffffff, #fbfdfc); }
.vo-hint { font-size: 13px; margin-bottom: 14px; max-width: 62ch; }
.vo-mic-row { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
.vo-mic {
  width: 74px; height: 74px; border-radius: 50%; border: 2px solid var(--accent, #0e7a5c);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: var(--accent-dim, #e6f2ec); color: var(--accent-strong, #0b6248); flex: 0 0 auto;
  transition: background 0.15s, box-shadow 0.15s;
}
.vo-mic:hover { box-shadow: var(--shadow-md); border-color: var(--accent-strong, #0b6248); }
.vo-mic:disabled { opacity: 0.45; cursor: default; box-shadow: none; }
.vo-mic-live { animation: vo-pulse 1.2s ease-in-out infinite; color: #c23a2b; border-color: #c23a2b; background: #fbeae7; }
@keyframes vo-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(194,58,43,0.35); } 50% { box-shadow: 0 0 0 14px rgba(194,58,43,0); } }
.vo-mic-label { font-weight: 600; font-size: 15px; }
.vo-note { font-size: 12px; padding: 7px 11px; border-radius: 8px; background: var(--warn-bg, #faf2da); color: var(--warn-fg, #77510a); margin: 8px 0; }
.vo-transcript { width: 100%; min-height: 110px; margin-top: 8px; font: inherit; line-height: 1.6; padding: 12px 14px; border-radius: 12px; box-sizing: border-box; resize: vertical; }
.vo-confirm { margin-top: 18px; border-top: 1px dashed var(--border, #e3e7e2); padding-top: 14px; }
.vo-confirm h4 { margin-bottom: 4px; }
.vo-group { margin: 12px 0; }
.vo-group-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted, #5c6862); margin-bottom: 6px; }
.vo-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.vo-chip {
  display: inline-flex; align-items: center; gap: 2px; border: 1px solid var(--border, #e3e7e2);
  border-radius: 999px; padding: 4px 12px; font-size: 13px; background: var(--panel, #fff);
  color: inherit; box-shadow: var(--shadow-sm);
}
.vo-chip-text { background: none; border: none; color: inherit; font: inherit; cursor: pointer; padding: 0; box-shadow: none; }
.vo-chip-text:hover { box-shadow: none; border: none; color: var(--accent-strong, #0b6248); }
.vo-chip-x { background: none; border: none; color: var(--muted, #5c6862); cursor: pointer; font-size: 12px; padding: 0 0 0 7px; box-shadow: none; }
.vo-chip-x:hover { color: var(--red, #c23a2b); box-shadow: none; border: none; }
.vo-chip-editing input, .vo-chip-add input { background: transparent; border: none; color: inherit; font: inherit; outline: none; min-width: 110px; padding: 0; border-radius: 0; box-shadow: none; }
.vo-chip-add { box-shadow: none; border-style: dashed; background: transparent; }
.vo-chip-pick { cursor: pointer; }
.vo-chip-pick:hover { border-color: var(--accent, #0e7a5c); color: var(--accent-strong, #0b6248); }
.vo-chip-on { border-color: var(--accent, #0e7a5c); background: var(--accent-dim, #e6f2ec); color: var(--accent-strong, #0b6248); font-weight: 600; }
.vo-followup { font-size: 12.5px; font-style: italic; color: var(--muted, #5c6862); margin: 3px 0 7px; }
.vo-suggest { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; font-size: 12px; }
.vo-typed { margin-top: 16px; padding: 13px 14px; border: 1px solid var(--border, #e3e7e2); border-radius: 12px; background: var(--panel2, #f2f4f1); }
.vo-typed-row { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
.vo-typed-row .field { flex: 1; min-width: 200px; }
.vo-done { margin-top: 12px; font-size: 13px; }
.vo-browse { display: inline-block; margin-top: 10px; font-size: 12px; color: var(--accent-strong, #0b6248); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.vo-files { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; margin-top: 10px; }
.vo-file { border: 1px solid var(--border, #e3e7e2); border-radius: 10px; padding: 8px 10px; background: var(--panel, #fff); box-shadow: var(--shadow-sm); }
.vo-file-name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
