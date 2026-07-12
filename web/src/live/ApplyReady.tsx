// Apply-ready cards: one card per finished job package with everything the
// user needs to act in under a minute. Data comes from the tenant-scoped
// digest queue (artifacts grouped by task, each task joined server-side to the
// job the pipeline picked via task.jobId) and the ledger (task status). The
// pipeline board is only a fallback for packages older than task.jobId.
//
// Copy buttons copy the FULL artifact text: previews are swapped for full
// content via the tenant-scoped public.getArtifact query. A block is labeled
// only while its full text is still loading.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api, convexClient, getMyUserId } from '../convex';
import type { Id } from '../../../convex/_generated/dataModel';
import { useStore } from '../store';
import { fmtDateTime } from '../util';
import { useFullContents } from './fullContent';

type JoinedJob = {
  jobId: string; title: string; companyName: string | null; applyUrl: string;
  state: string; fitScore: number | null; topCaveat: string | null;
};

type QueueRow = {
  artifactId: string; userId: string; taskId: string; runId: string;
  kind: string; variantId: string | null;
  gateResults: { gate: string; pass: boolean; note?: string }[];
  sourceUrls: string[]; preview: string; taskKind: string | null;
  job: JoinedJob | null; briefId: string | null; createdAt: number;
};

type Pkg = {
  taskId: string; userId: string; createdAt: number;
  byKind: Partial<Record<string, QueueRow>>;
  job: JoinedJob | null;
  role: string | null; company: string | null;
  fitScore: number | null; topCaveat: string | null;
  status: string | null;
  briefId: string | null;
};

const PREVIEW_CAP = 280;

const NOT_FOR_ME_REASONS = ['comp too low', 'wrong level', 'location', 'company', 'role mismatch', 'other'];

function parseFitReport(preview: string) {
  let role: string | null = null;
  let company: string | null = null;
  const header = preview.match(/^# Fit report: (.+)$/m);
  if (header) {
    const line = header[1].trim();
    const at = line.lastIndexOf(' at ');
    if (at > 0) {
      role = line.slice(0, at).trim();
      company = line.slice(at + 4).trim();
    } else {
      role = line;
    }
  }
  const score = preview.match(/Score:\s*(\d+)\s*\/\s*100/);
  const caveat = preview.match(/Caveats:\s*\n-\s*([^\n]+)/);
  return {
    role,
    company,
    fitScore: score ? Number(score[1]) : null,
    topCaveat: caveat ? caveat[1].trim() : null,
  };
}

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Friendly label for a resume variant, derived from the variantId only (never
// from the artifact content, which is raw HTML). Renderer ids look like
// "senior-product-manager-<ts36>-<hex12>"; strip the machine suffix, keep the role.
function variantLabel(variantId: string | null | undefined): string {
  if (!variantId) return 'Tailored resume';
  const parts = variantId.replace(/^novariant-/, '').split('-').filter(Boolean);
  // Trailing machine suffixes: hex (new) or base36 timestamps (mrgz...). Real role
  // words are dictionary words; strip a trailing token when it is all lowercase
  // alphanumerics of length >= 5, contains a digit OR is not a plausible word
  // (no vowel, or looks like a base36 timestamp starting with m/l/k). Keep >= 1.
  const isMachine = (s) => /^[a-z0-9]{5,14}$/.test(s) && (/\d/.test(s) || !/[aeiou]/.test(s) || /^[klm][a-z0-9]{6,9}$/.test(s));
  while (parts.length > 1 && isMachine(parts[parts.length - 1])) {
    parts.pop();
  }
  const words = parts.join(' ').trim();
  if (!words) return 'Tailored resume';
  return 'Tailored for ' + words.charAt(0).toUpperCase() + words.slice(1);
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // clipboard blocked; select-and-copy still works on the block
        }
      }}
    >
      {copied ? 'Copied' : (label ?? 'Copy')}
    </button>
  );
}

function CopyBlock({ title, text, capped, extra }: { title: string; text: string; capped?: boolean; extra?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="queue-head" style={{ marginBottom: 4 }}>
        <b style={{ fontSize: 12 }}>{title}</b>
        {extra}
        <CopyBtn text={text} />
        {capped && <span className="badge b-warn" title="Full text is still loading; the copy button copies exactly what is shown.">preview shown; full text loading</span>}
      </div>
      <div className="draft-body" style={{ margin: 0 }}>{text}</div>
    </div>
  );
}

export default function LiveApplyReady() {
  const { dispatch } = useStore();
  // digestQueue is tenant-scoped: packages belong to their owner.
  const myId = getMyUserId();
  const rows = useQuery(api.public.digestQueue, myId ? { userId: myId as Id<'users'> } : 'skip') as QueueRow[] | undefined;
  const ledger = useQuery(api.public.ledger, { limit: 100 });
  const setJobState = useMutation(api.jobs.setJobState);
  const recordFeedback = useMutation(api.feedback.recordFeedback);
  const undoFeedback = useMutation(api.feedback.undoFeedback);

  // Full artifact text for every block we render, so copy never truncates.
  const artifactIds = useMemo(() => (rows ?? []).map(r => r.artifactId), [rows]);
  const full = useFullContents(artifactIds);
  const text = (r: QueueRow | undefined): string => (r ? (full[r.artifactId] ?? r.preview) : '');
  const isCapped = (r: QueueRow | undefined): boolean =>
    !!r && full[r.artifactId] === undefined && r.preview.length >= PREVIEW_CAP;

  const [boards, setBoards] = useState<Record<string, any[]>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [toast, setToast] = useState<{ msg: string; undo?: () => Promise<void> } | null>(null);
  const toastTimer = useRef<number | null>(null);

  function showToast(msg: string, undo?: () => Promise<void>) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    // Undoable toasts linger longer so the button is actually reachable.
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 8000 : 3500);
  }

  const statusByTask = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of ledger ?? []) m.set(r.taskId, r.status);
    return m;
  }, [ledger]);

  const pkgs: Pkg[] = useMemo(() => {
    const groups = new Map<string, Pkg>();
    for (const r of rows ?? []) {
      let g = groups.get(r.taskId);
      if (!g) {
        g = { taskId: r.taskId, userId: r.userId, createdAt: r.createdAt, byKind: {}, job: null, briefId: null, role: null, company: null, fitScore: null, topCaveat: null, status: null };
        groups.set(r.taskId, g);
      }
      g.byKind[r.kind] = r;
      if (r.job && !g.job) g.job = r.job;
      if (r.briefId && !g.briefId) g.briefId = r.briefId;
      g.createdAt = Math.max(g.createdAt, r.createdAt);
    }
    const out: Pkg[] = [];
    for (const g of groups.values()) {
      if (g.job) {
        // Source of truth: the job row the pipeline bound to this task.
        g.role = g.job.title;
        g.company = g.job.companyName;
        g.fitScore = g.job.fitScore;
        g.topCaveat = g.job.topCaveat;
      } else {
        // Legacy packages without task.jobId: parse the fit report header.
        const fit = g.byKind['fit_report'];
        if (fit) Object.assign(g, parseFitReport(text(fit)));
      }
      g.status = statusByTask.get(g.taskId) ?? null;
      // A package is apply-ready when it has outreach drafted; fit-only groups are still cooking.
      if (g.byKind['connection_note'] || g.byKind['dm_draft']) out.push(g);
    }
    // The signed-in user's packages first, then the rest, newest first.
    out.sort((a, b) => {
      const mine = Number(b.userId === myId) - Number(a.userId === myId);
      return mine !== 0 ? mine : b.createdAt - a.createdAt;
    });
    return out.slice(0, 24);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, statusByTask, myId, full]);

  // Fallback only: pipeline boards for package owners whose task predates task.jobId.
  useEffect(() => {
    if (!convexClient) return;
    const uids = [...new Set(pkgs.filter(p => !p.job).map(p => p.userId))].filter(u => !(u in boards));
    if (uids.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const uid of uids) {
        try {
          const b = await convexClient.query(api.jobs.pipelineBoard, { userId: uid as Id<'users'> });
          if (cancelled) return;
          setBoards(prev => ({ ...prev, [uid]: Object.values(b as Record<string, any[]>).flat() }));
        } catch {
          if (!cancelled) setBoards(prev => ({ ...prev, [uid]: [] }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pkgs, boards]);

  function matchJob(p: Pkg): any | null {
    // Preferred path: the job the pipeline bound to this task. No guessing.
    if (p.job) return { _id: p.job.jobId, applyUrl: p.job.applyUrl, state: p.job.state, title: p.job.title, companyName: p.job.companyName };
    const jobs = boards[p.userId];
    if (!jobs || !p.company) return null;
    const co = jobs.filter(j => j.companyName && norm(j.companyName) === norm(p.company!));
    if (co.length === 0) return null;
    if (p.role) {
      const exact = co.find(j => norm(j.title) === norm(p.role!));
      if (exact) return exact;
    }
    const live = co.filter(j => j.state !== 'auto_rejected');
    if (live.length === 1) return live[0];
    return null;
  }

  async function onApplied(p: Pkg, job: any) {
    await setJobState({ jobId: job._id, state: 'applied' });
    setApplied(prev => new Set(prev).add(p.taskId));
    showToast(`Marked applied: ${p.role ?? job.title} at ${p.company ?? job.companyName}. Tracked on your Pipeline.`);
  }

  async function onNotForMe(p: Pkg, job: any | null, reason: string) {
    const finalReason = reason === 'other' ? (otherText.trim() || 'other') : reason;
    const prevJobState: string | null = job?.state ?? null;
    const fb = await recordFeedback({
      userId: p.userId as Id<'users'>,
      verdict: 'thumbs_down',
      reason: `not for me: ${finalReason}`,
      jobId: job ? (job._id as Id<'jobs'>) : undefined,
      artifactId: (p.byKind['fit_report']?.artifactId ?? p.byKind['connection_note']?.artifactId) as Id<'artifacts'> | undefined,
    });
    if (job) await setJobState({ jobId: job._id, state: 'closed' });
    setDismissed(prev => new Set(prev).add(p.taskId));
    setReasonFor(null); setOtherText('');
    // Undo deletes the feedback row (and its learned rule), restores the card,
    // and puts the job back in its previous pipeline state.
    showToast('Memory saved: we will use this', async () => {
      await undoFeedback({ feedbackId: fb.feedbackId, userId: p.userId as Id<'users'> });
      if (job && prevJobState && prevJobState !== 'closed') {
        await setJobState({ jobId: job._id, state: prevJobState as any });
      }
      setDismissed(prev => { const next = new Set(prev); next.delete(p.taskId); return next; });
      setToast(null);
    });
  }

  const visible = pkgs.filter(p => !dismissed.has(p.taskId));

  return (
    <div>
      <h2>Ready to apply</h2>
      <p className="sub">One card per finished package: copy, paste, apply. The Open application button goes to the company's real apply page.</p>
      {!myId && <div className="panel empty">Your packages are private to your account. Sign up on the Onboard tab and they appear here.</div>}
      {myId && rows === undefined && <div className="panel empty">Loading packages...</div>}
      {myId && rows !== undefined && visible.length === 0 && (
        <div className="panel empty">No apply-ready packages yet. Start a scan on the Onboard tab; finished packages land here.</div>
      )}
      {visible.map(p => {
        const job = matchJob(p);
        const applyUrl: string | null = job?.applyUrl ?? null;
        const note = p.byKind['connection_note'];
        const dm = p.byKind['dm_draft'];
        const resume = p.byKind['resume_pdf'];
        const research = p.byKind['research_brief'];
        const brief = p.byKind['delivery_brief'];
        const noteText = text(note);
        const noteLen = noteText.length;
        const dmText = text(dm);
        const dmLines = dmText ? dmText.split('\n') : [];
        const dmSubject = dmLines[0]?.replace(/^Subject:\s*/i, '') ?? '';
        const dmBody = dmLines.slice(1).join('\n').trim();
        const resumeText = text(resume);
        const resumeIsHtml = resumeText.trimStart().startsWith('<');
        const isApplied = applied.has(p.taskId) || job?.state === 'applied';
        return (
          <div className="queue-card" key={p.taskId}>
            <div className="queue-head">
              <b style={{ fontSize: 15 }}>{p.company ?? 'Company pending'}</b>
              <span className="muted">{p.role ?? 'role pending'}</span>
              {p.fitScore !== null && (
                <span className={`fit ${p.fitScore >= 80 ? 'hi' : p.fitScore >= 65 ? 'mid' : 'lo'}`} title={p.topCaveat ?? ''}>
                  fit {p.fitScore}
                </span>
              )}
              {p.fitScore !== null && p.topCaveat && (
                <span className="fit-caveat" title={p.topCaveat}>{p.topCaveat}</span>
              )}
              {p.status && <span className={`badge ${p.status === 'delivered' ? 'b-ok' : 'b-info'}`}>{p.status}</span>}
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{fmtDateTime(p.createdAt)}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {/* "Resume rendered" is claimed only when real resume HTML exists; a
                  placeholder artifact (renderer unavailable) is not a deliverable. */}
              <span className={`badge ${resumeIsHtml ? 'b-ok' : 'b-muted'}`}>{resumeIsHtml ? 'Resume rendered' : 'No resume yet, add one on Onboard'}</span>
              <span className={`badge ${p.status === 'delivered' || brief ? 'b-ok' : 'b-muted'}`}>
                {brief ? 'Answers and brief below' : p.status === 'delivered' ? 'Brief delivered' : 'Brief pending'}
              </span>
              <span className={`badge ${note || dm ? 'b-ok' : 'b-muted'}`}>{note || dm ? 'Outreach drafted' : 'Outreach pending'}</span>
              <span className={`badge ${research ? 'b-ok' : 'b-muted'}`}>{research ? 'Research sourced' : 'Research pending'}</span>
            </div>

            {note && (
              <CopyBlock
                title="Connection note"
                text={noteText}
                capped={isCapped(note)}
                extra={
                  <span className={`charcount ${noteLen > 300 ? 'over' : ''}`}>
                    {isCapped(note) ? '280+ shown (cap 300)' : `${noteLen}/300`}
                  </span>
                }
              />
            )}
            {dm && dmSubject && (
              <CopyBlock title="DM subject" text={dmSubject} />
            )}
            {dm && dmBody && (
              <CopyBlock title="DM body" text={dmBody} capped={isCapped(dm)} />
            )}
            {brief && <CopyBlock title="Delivery brief (answers included)" text={text(brief)} capped={isCapped(brief)} extra={<a href={`/brief/${brief.artifactId}`} target="_blank" rel="noreferrer">open full brief</a>} />}
            {resume && resumeIsHtml && resume.variantId ? (
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Resume variant: <b>{variantLabel(resume.variantId)}</b>{' '}
                <a href={`/resume/${resume.variantId}`} target="_blank" rel="noreferrer">open printable resume (print or save as PDF)</a>
              </div>
            ) : (
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                No resume yet.{' '}
                <a href="#onboard" onClick={e => { e.preventDefault(); dispatch({ type: 'setTab', tab: 'onboard' }); }}>Add one on Onboard</a>{' '}
                and the next package gets a tailored variant.
              </div>
            )}
            {research && research.sourceUrls.length > 0 && (
              <div className="src-urls" style={{ marginBottom: 10 }}>
                <span className="muted">Research sources:</span>
                {research.sourceUrls.slice(0, 4).map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>)}
              </div>
            )}

            <div className="card-actions">
              {applyUrl ? (
                <a href={applyUrl} target="_blank" rel="noreferrer">
                  <button className="primary">Open application</button>
                </a>
              ) : (
                <button disabled title="No matching job row with an apply link yet">Open application</button>
              )}
              {p.briefId ? (
                <a href={'/brief/' + p.briefId} target="_blank" rel="noreferrer">
                  <button>Open full brief</button>
                </a>
              ) : null}
              {isApplied ? (
                <span className="badge b-ok">applied</span>
              ) : (
                <button disabled={!job} title={job ? '' : 'No matching job row to move yet'} onClick={() => job && onApplied(p, job)}>I applied</button>
              )}
              {reasonFor === p.taskId ? (
                <>
                  {NOT_FOR_ME_REASONS.map(r => (
                    r === 'other'
                      ? <input key={r} placeholder="other reason" value={otherText} onChange={e => setOtherText(e.target.value)} style={{ minWidth: 140 }} />
                      : <button key={r} className="small" onClick={() => onNotForMe(p, job, r)}>{r}</button>
                  ))}
                  {otherText.trim() && <button className="danger small" onClick={() => onNotForMe(p, job, 'other')}>save</button>}
                  <button className="small" onClick={() => { setReasonFor(null); setOtherText(''); }}>cancel</button>
                </>
              ) : (
                <button className="danger small" onClick={() => setReasonFor(p.taskId)}>Not for me</button>
              )}
              <a
                href="#trace"
                style={{ marginLeft: 'auto', fontSize: 12 }}
                onClick={e => {
                  e.preventDefault();
                  const runId = p.byKind['connection_note']?.runId ?? p.byKind['fit_report']?.runId;
                  dispatch({ type: 'setTab', tab: 'runs', runsFocus: { taskId: p.taskId, runId } });
                }}
              >
                see how this was made
              </a>
            </div>
          </div>
        );
      })}
      {toast && (
        <div className="toast">
          {toast.msg}
          {toast.undo && (
            <button className="small" style={{ marginLeft: 10 }} onClick={() => { void toast.undo!(); }}>Undo</button>
          )}
        </div>
      )}
    </div>
  );
}
