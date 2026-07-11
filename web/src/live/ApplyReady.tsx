// Apply-ready cards: one card per finished job package with everything the
// user needs to act in under a minute. Data comes from the public digest
// queue (artifacts grouped by task), the ledger (task status), and the
// pipeline board (real applyUrl and jobId for state moves).
//
// Honesty note: the public digestQueue caps artifact previews at 280 chars.
// Blocks that hit the cap are labeled so copy never silently truncates.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api, convexClient, getMyUserId } from '../convex';
import type { Id } from '../../../convex/_generated/dataModel';
import { useStore } from '../store';
import { fmtDateTime } from '../util';

type QueueRow = {
  artifactId: string; userId: string; taskId: string; runId: string;
  kind: string; variantId: string | null;
  gateResults: { gate: string; pass: boolean; note?: string }[];
  sourceUrls: string[]; preview: string; taskKind: string | null; createdAt: number;
};

type Pkg = {
  taskId: string; userId: string; createdAt: number;
  byKind: Partial<Record<string, QueueRow>>;
  role: string | null; company: string | null;
  fitScore: number | null; topCaveat: string | null;
  status: string | null;
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

function CopyBlock({ title, text, extra }: { title: string; text: string; extra?: React.ReactNode }) {
  const capped = text.length >= PREVIEW_CAP;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="queue-head" style={{ marginBottom: 4 }}>
        <b style={{ fontSize: 12 }}>{title}</b>
        {extra}
        <CopyBtn text={text} />
        {capped && <span className="badge b-warn" title="The public feed caps previews at 280 chars; the full text is in your delivered brief.">preview capped at 280 chars; full text in your brief</span>}
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

  const [boards, setBoards] = useState<Record<string, any[]>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
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
        g = { taskId: r.taskId, userId: r.userId, createdAt: r.createdAt, byKind: {}, role: null, company: null, fitScore: null, topCaveat: null, status: null };
        groups.set(r.taskId, g);
      }
      g.byKind[r.kind] = r;
      g.createdAt = Math.max(g.createdAt, r.createdAt);
    }
    const out: Pkg[] = [];
    for (const g of groups.values()) {
      const fit = g.byKind['fit_report'];
      if (fit) Object.assign(g, parseFitReport(fit.preview));
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
  }, [rows, statusByTask, myId]);

  // Pipeline boards per package owner: gives the real applyUrl and jobId.
  useEffect(() => {
    if (!convexClient) return;
    const uids = [...new Set(pkgs.map(p => p.userId))].filter(u => !(u in boards));
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
    await recordFeedback({
      userId: p.userId as Id<'users'>,
      verdict: 'thumbs_down',
      reason: `not for me: ${finalReason}`,
      jobId: job ? (job._id as Id<'jobs'>) : undefined,
      artifactId: (p.byKind['fit_report']?.artifactId ?? p.byKind['connection_note']?.artifactId) as Id<'artifacts'> | undefined,
    });
    if (job) await setJobState({ jobId: job._id, state: 'closed' });
    setDismissed(prev => new Set(prev).add(p.taskId));
    setReasonFor(null); setOtherText('');
    showToast(`Saved: ${finalReason}. Career Computa factors this into the next scan.`);
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
        const noteLen = note ? note.preview.length : 0;
        const dmLines = dm ? dm.preview.split('\n') : [];
        const dmSubject = dmLines[0]?.replace(/^Subject:\s*/i, '') ?? '';
        const dmBody = dmLines.slice(1).join('\n').trim();
        const isApplied = applied.has(p.taskId) || job?.state === 'applied';
        return (
          <div className="queue-card" key={p.taskId}>
            <div className="queue-head">
              <b style={{ fontSize: 15 }}>{p.company ?? 'Company pending'}</b>
              <span className="muted">{p.role ?? 'role pending'}</span>
              {p.fitScore !== null && (
                <span className={`fit ${p.fitScore >= 80 ? 'hi' : p.fitScore >= 65 ? 'mid' : 'lo'}`} title={p.topCaveat ?? ''}>
                  fit {p.fitScore}{p.topCaveat ? `, ${p.topCaveat}` : ''}
                </span>
              )}
              {p.status && <span className={`badge ${p.status === 'delivered' ? 'b-ok' : 'b-info'}`}>{p.status}</span>}
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{fmtDateTime(p.createdAt)}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className={`badge ${resume ? 'b-ok' : 'b-muted'}`}>{resume ? 'Resume rendered' : 'Resume pending'}</span>
              <span className={`badge ${p.status === 'delivered' || brief ? 'b-ok' : 'b-muted'}`}>
                {brief ? 'Answers and brief below' : p.status === 'delivered' ? 'Answers in your delivered brief' : 'Answers pending'}
              </span>
              <span className={`badge ${note || dm ? 'b-ok' : 'b-muted'}`}>{note || dm ? 'Outreach drafted' : 'Outreach pending'}</span>
              <span className={`badge ${research ? 'b-ok' : 'b-muted'}`}>{research ? 'Research sourced' : 'Research pending'}</span>
            </div>

            {note && (
              <CopyBlock
                title="Connection note"
                text={note.preview}
                extra={
                  <span className={`charcount ${noteLen > 300 ? 'over' : ''}`}>
                    {noteLen >= PREVIEW_CAP ? '280+ shown (cap 300)' : `${noteLen}/300`}
                  </span>
                }
              />
            )}
            {dm && dmSubject && (
              <CopyBlock title="DM subject" text={dmSubject} />
            )}
            {dm && dmBody && (
              <CopyBlock title="DM body" text={dmBody} />
            )}
            {brief && <CopyBlock title="Delivery brief (answers included)" text={brief.preview} extra={<a href={`/brief/${brief.artifactId}`} target="_blank" rel="noreferrer">open full brief</a>} />}
            {resume && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Resume variant: <span className="mono">{resume.preview.split('/').pop()}</span>{resume.variantId ? <> (variant <span className="mono">{resume.variantId}</span>)</> : null}
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
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
