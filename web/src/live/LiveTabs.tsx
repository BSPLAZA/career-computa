// Live-mode tabs backed by Convex queries and mutations. Rendered only when
// the repo-root .convex-url existed at build time. Gaps against the spec are
// marked LIVE GAP in comments and reported to the brain:
//   1. ledger rows carry no runId, so VERIFY cannot open a trace directly
//   2. no list-users query, so the Pipeline selector takes a pasted userId
//   3. no list-runs / artifacts-for-run query, so Runs needs a pasted runId
//   4. digestQueue returns a 280 char preview, not full content
import { useState, type ReactNode } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api, getMyUserId, setMyUserId, clearMyUserId } from '../convex';
import type { Id } from '../../../convex/_generated/dataModel';
import { useStore } from '../store';
import { fmtTime, fmtDateTime, fmtUsd, fmtMs, truncate } from '../util';

const BOT_LINK_HELP = 'Open the link, hit Start, briefs arrive in that chat.';

// ---------- Onboard ----------
export function LiveOnboard() {
  const { state, dispatch } = useStore();
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ userId: string; telegramDeepLink: string } | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [cur, setCur] = useState('');
  const [tgt, setTgt] = useState('');
  const [c1, setC1] = useState('');
  const [c2, setC2] = useState('');
  const [c3, setC3] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  const signup = useMutation(api.users.signup);
  const createTask = useMutation(api.tasks.createTask);
  const deleteMyData = useMutation(api.users.deleteMyData);

  const myId = result?.userId ?? getMyUserId();
  const me = useQuery(api.users.getUser, myId ? { userId: myId as Id<'users'> } : 'skip');

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    const r = await signup({ email: email.trim() });
    setMyUserId(r.userId);
    setResult({ userId: r.userId, telegramDeepLink: r.telegramDeepLink });
    setDeleted(false);
  }

  async function onQuickPath(e: React.FormEvent) {
    e.preventDefault();
    if (!myId) return;
    const input = `Quick path: ${cur} to ${tgt}; targets ${[c1, c2, c3].filter(Boolean).join(', ')}`;
    const r = await createTask({ userId: myId as Id<'users'>, kind: 'intake', input });
    setTaskId(r.taskId);
  }

  async function onDelete() {
    if (!myId) return;
    await deleteMyData({ userId: myId as Id<'users'> });
    clearMyUserId();
    setResult(null);
    setDeleted(true);
  }

  const link = result?.telegramDeepLink ?? (me ? `https://t.me/CareerAgencyBriefs_bot?start=${me.signupToken}` : null);

  return (
    <div>
      <h2>Onboard</h2>
      <p className="sub">Sign up, connect Telegram for briefs, hand over your career context. The agency does the rest.</p>
      <div className="onboard-grid">
        <section className="panel">
          <h3>1. Sign up</h3>
          {!myId || deleted ? (
            <form onSubmit={onSignup}>
              <div className="field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <button className="primary" type="submit">Create my agency</button>
            </form>
          ) : (
            <>
              <p style={{ marginBottom: 10 }}>
                Signed up{me ? <> as <b className="mono">{state.demoMode ? me.email.slice(0, 1) + '***@' + me.email.split('@')[1] : me.email}</b></> : null}
              </p>
              {link && (
                <div className="field">
                  <label>Connect Telegram ({BOT_LINK_HELP})</label>
                  <div className="deeplink"><a href={link} target="_blank" rel="noreferrer">{link}</a></div>
                </div>
              )}
              {me?.telegramChatId
                ? <span className="badge b-ok">Telegram connected</span>
                : <span className="badge b-warn">Not connected yet</span>}
            </>
          )}
        </section>

        <section className="panel">
          <h3>2. Upload your context</h3>
          <div
            className={`dropzone ${dragOver ? 'hover' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); setFiles(p => [...p, ...Array.from(e.dataTransfer.files).map(f => f.name)]); }}
          >
            <p><b>Drop files here</b></p>
            <p style={{ marginTop: 6, fontSize: 12 }}>
              LinkedIn data export (.zip) or drop the unzipped folder. Resume PDF. Performance docs, brag sheets, anything that proves what you did.
            </p>
            {files.length > 0 && (
              <ul className="file-list">
                {files.map((f, i) => <li key={i}>{f} <span className="badge b-info">listed; parser pickup pending</span></li>)}
              </ul>
            )}
          </div>
        </section>

        <section className="panel">
          <h3>3. Quick path (no files needed)</h3>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Thirty seconds to a runnable task.</p>
          <form onSubmit={onQuickPath}>
            <div className="field"><label>Current role</label><input value={cur} onChange={e => setCur(e.target.value)} required /></div>
            <div className="field"><label>Target role</label><input value={tgt} onChange={e => setTgt(e.target.value)} required /></div>
            <div className="field">
              <label>Three target companies</label>
              <input value={c1} onChange={e => setC1(e.target.value)} placeholder="Company 1" />
              <input value={c2} onChange={e => setC2(e.target.value)} placeholder="Company 2" style={{ marginTop: 6 }} />
              <input value={c3} onChange={e => setC3(e.target.value)} placeholder="Company 3" style={{ marginTop: 6 }} />
            </div>
            <button className="primary" type="submit" disabled={!myId || deleted}>
              {myId && !deleted ? 'Start my first scan' : 'Sign up first'}
            </button>
            {taskId && (
              <span className="badge b-ok" style={{ marginLeft: 10 }}>
                Task {taskId.slice(0, 8)}... queued.{' '}
                <a href="#ledger" onClick={e => { e.preventDefault(); dispatch({ type: 'setTab', tab: 'ledger' }); }} style={{ color: 'inherit', textDecoration: 'underline' }}>Watch the Ledger</a>
              </span>
            )}
          </form>
        </section>
      </div>

      <div className="privacy panel section-gap">
        <b>Privacy:</b> your documents stay in your tenant, feed only your own agents, and are never used to train anything.
        Drafts are written for you; nothing is ever sent anywhere without your explicit tap.
        {myId && !deleted && <button className="danger small" style={{ marginLeft: 10 }} onClick={onDelete}>Delete my data</button>}
        {deleted && <span className="badge b-err" style={{ marginLeft: 10 }}>All rows purged</span>}
      </div>
    </div>
  );
}

// ---------- Queue ----------
const TAPPABLE = new Set(['connection_note', 'dm_draft', 'delivery_brief']);

export function LiveQueue() {
  const { state } = useStore();
  const rows = useQuery(api.public.digestQueue, {});
  const recordFeedback = useMutation(api.feedback.recordFeedback);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [skipping, setSkipping] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [decided, setDecided] = useState<Set<string>>(new Set());

  const pending = (rows ?? []).filter(r => TAPPABLE.has(r.kind) && !decided.has(r.artifactId));

  async function verdict(r: NonNullable<typeof rows>[number], v: 'approve' | 'edit' | 'skip', reason?: string, editDiff?: string) {
    await recordFeedback({
      userId: r.userId as Id<'users'>,
      artifactId: r.artifactId as Id<'artifacts'>,
      verdict: v,
      reason,
      editDiff,
    });
    setDecided(prev => new Set(prev).add(r.artifactId));
    setEditing(null); setSkipping(null); setSkipReason('');
  }

  return (
    <div>
      <h2>Queue</h2>
      <p className="sub">Drafts awaiting your tap. Approving unlocks send; nothing leaves without it. Edits and skips become preference rules.</p>
      {rows === undefined && <div className="panel empty">Loading queue...</div>}
      {rows !== undefined && pending.length === 0 && <div className="panel empty">Queue is clear. New drafts land here as agents finish.</div>}
      {pending.map(r => {
        const isNote = r.kind === 'connection_note' || r.kind === 'dm_draft';
        return (
          <div className="queue-card" key={r.artifactId}>
            <div className="queue-head">
              <span className="badge b-purple">{r.kind.replace(/_/g, ' ')}</span>
              <span className="mono muted">{r.artifactId.slice(0, 10)}...</span>
              {isNote && <span className="charcount">{r.preview.length >= 280 ? '280+ (preview cap)' : `${r.preview.length}/300`} chars</span>}
              <span className="muted mono" style={{ marginLeft: 'auto' }}>run {r.runId.slice(0, 10)}...</span>
            </div>
            {state.demoMode && isNote ? (
              <div className="draft-body muted">[message body hidden in demo mode]</div>
            ) : editing === r.artifactId ? (
              <textarea className="draft-body" style={{ width: '100%', minHeight: 110 }} value={editText} onChange={e => setEditText(e.target.value)} />
            ) : (
              <div className="draft-body">{r.preview}</div>
            )}
            {r.gateResults.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {r.gateResults.map(g => (
                  <span key={g.gate} className={`gate-chip ${g.pass ? 'gate-pass' : 'gate-fail'}`} title={g.note ?? ''}>
                    {g.pass ? 'PASS' : 'FAIL'} {g.gate}
                  </span>
                ))}
              </div>
            )}
            {r.sourceUrls.length > 0 && (
              <div className="src-urls">
                <span className="muted">Sources:</span>
                {r.sourceUrls.map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>)}
              </div>
            )}
            <div className="card-actions">
              {editing === r.artifactId ? (
                <>
                  <button className="primary small" onClick={() => verdict(r, 'edit', undefined, `manual edit, ${editText.length} chars`)}>Save edit and approve</button>
                  <button className="small" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : skipping === r.artifactId ? (
                <>
                  <input placeholder="Why skip? This trains the drafter." value={skipReason} onChange={e => setSkipReason(e.target.value)} style={{ minWidth: 260 }} />
                  <button className="danger small" onClick={() => verdict(r, 'skip', skipReason || 'no reason given')}>Confirm skip</button>
                  <button className="small" onClick={() => setSkipping(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button className="primary" onClick={() => verdict(r, 'approve')}>Approve</button>
                  <button onClick={() => { setEditing(r.artifactId); setEditText(r.preview); }}>Edit</button>
                  <button onClick={() => setSkipping(r.artifactId)}>Skip</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Ledger ----------
export function LiveLedger() {
  const { dispatch } = useStore();
  const counters = useQuery(api.public.counters, {});
  const rows = useQuery(api.public.ledger, { limit: 50 });
  const exceptions = (rows ?? []).filter(r => r.status === 'failed' || r.status === 'escalated');

  return (
    <div>
      <h2>Ledger</h2>
      <p className="sub">Public work log. One row per task, every claim verifiable. Judge counters exclude team accounts.</p>
      <div className="counters">
        <div className="counter hero">
          <div className="num">{counters ? counters.tasksCompletedToday.judge : '...'}</div>
          <div className="lbl">tasks completed today (outsiders only{counters ? `, ${counters.tasksCompletedToday.total} incl team` : ''})</div>
        </div>
        <div className="counter">
          <div className="num">{counters ? counters.signupsWithFirstUse.judge : '...'}</div>
          <div className="lbl">signups with first use</div>
        </div>
        <div className="counter">
          <div className="num">{counters ? counters.jobsDiscovered.total : '...'}</div>
          <div className="lbl">jobs discovered</div>
        </div>
        <div className="counter">
          <div className="num">{counters ? counters.briefsDelivered.total : '...'}</div>
          <div className="lbl">briefs delivered</div>
        </div>
      </div>

      {exceptions.length > 0 && (
        <div className="exceptions">
          <h3>Exceptions ({exceptions.length}) : failures stay on the board</h3>
          {exceptions.map(r => (
            <div className="exception-row" key={r.taskId}>
              <span className="mono">{r.taskId.slice(0, 10)}...</span>{' '}
              <span className={`badge ${r.status === 'failed' ? 'b-err' : 'b-warn'}`}>{r.status}</span>{' '}
              <span className="muted">{r.kind} for {r.maskedEmail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="panel tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Task</th><th>Who</th><th>Kind</th><th>Received</th><th>Completed</th>
              <th>Agents</th><th>Status</th><th className="num-r">Cost</th><th className="num-r">Latency</th><th>Verify</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map(r => (
              <tr key={r.taskId}>
                <td className="mono">{r.taskId.slice(0, 10)}...</td>
                <td className="mono">{r.maskedEmail}{r.isTeam ? <span className="badge b-muted" style={{ marginLeft: 5 }}>team</span> : null}</td>
                <td><span className="badge b-info">{r.kind}</span></td>
                <td className="mono">{fmtTime(r.createdAt)}</td>
                <td className="mono">{r.completedAt ? fmtTime(r.completedAt) : '...'}</td>
                <td className="mono" style={{ fontSize: 11 }}>{r.agentsInvolved.join(', ') || '...'}</td>
                <td>
                  <span className={`badge ${
                    r.status === 'delivered' ? 'b-ok' : r.status === 'failed' ? 'b-err'
                      : r.status === 'escalated' ? 'b-warn' : r.status === 'running' ? 'b-info' : 'b-muted'
                  }`}>{r.status}</span>
                </td>
                <td className="num-r">{fmtUsd(r.costUsd)}</td>
                <td className="num-r">{r.latencyMs !== null ? fmtMs(r.latencyMs) : '...'}</td>
                <td>
                  {/* LIVE GAP: ledger rows carry no runId; Runs tab takes a pasted run id until the convex lane adds one */}
                  <a href="#trace" onClick={e => { e.preventDefault(); dispatch({ type: 'setTab', tab: 'runs', runsFocus: { taskId: r.taskId } }); }}>VERIFY</a>
                </td>
              </tr>
            ))}
            {rows !== undefined && rows.length === 0 && (
              <tr><td colSpan={10} className="empty">No tasks yet. First signup lights this up.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Pipeline ----------
const STATES = ['discovered', 'assessed', 'auto_rejected', 'queued', 'delivered', 'applied', 'screening', 'interviewing', 'closed', 'ghosted'] as const;

export function LivePipeline() {
  const [userIdInput, setUserIdInput] = useState(getMyUserId() ?? '');
  const [activeUserId, setActiveUserId] = useState<string | null>(getMyUserId());
  const board = useQuery(api.jobs.pipelineBoard, activeUserId ? { userId: activeUserId as Id<'users'> } : 'skip');

  const all = board ? Object.values(board).flat() as any[] : [];
  const count = (s: string) => (board && (board as any)[s] ? (board as any)[s].length : 0);

  return (
    <div>
      <h2>Pipeline</h2>
      <p className="sub">Every job the agency has touched for a user, by state. Auto-rejects keep their reason.</p>
      <div className="filters">
        {/* LIVE GAP: no list-users query, so the selector takes a user id (yours is prefilled after signup) */}
        <label className="muted">User id</label>
        <input value={userIdInput} onChange={e => setUserIdInput(e.target.value)} placeholder="paste a userId" style={{ minWidth: 280 }} className="mono" />
        <button className="small" onClick={() => setActiveUserId(userIdInput.trim() || null)}>Load</button>
      </div>
      <div className="counters">
        <div className="counter"><div className="num">{all.length}</div><div className="lbl">total discovered</div></div>
        <div className="counter"><div className="num">{count('auto_rejected')}</div><div className="lbl">auto rejected (reasons logged)</div></div>
        <div className="counter hero"><div className="num">{count('delivered') + count('applied') + count('screening') + count('interviewing')}</div><div className="lbl">delivered or further</div></div>
        <div className="counter"><div className="num">{count('interviewing')}</div><div className="lbl">interviewing</div></div>
      </div>
      {!activeUserId && <div className="panel empty">Sign up on the Onboard tab or paste a user id to load a board.</div>}
      {activeUserId && board === undefined && <div className="panel empty">Loading board...</div>}
      {board && (
        <div className="board">
          {STATES.map(s => (
            <div className="board-col" key={s}>
              <h4>{s.replace(/_/g, ' ')} <span>{count(s)}</span></h4>
              <div className="cards">
                {((board as any)[s] ?? []).map((j: any) => (
                  <div className="job-card" key={j._id}>
                    <div className="jt">{j.title}</div>
                    <div className="muted">{j.companyName} {j.location ? `· ${j.location}` : ''}</div>
                    {j.compRange && <div className="muted mono">{j.compRange}</div>}
                    {j.fitScore !== undefined && <div>fit <span className={`fit ${j.fitScore >= 80 ? 'hi' : j.fitScore >= 65 ? 'mid' : 'lo'}`}>{j.fitScore}</span></div>}
                    {(j.caveats ?? []).map((c: string, i: number) => <div className="caveat" key={i}>caveat: {c}</div>)}
                    {j.hardFilterResult?.rejected && <div className="reject-reason">{j.hardFilterResult.reason}</div>}
                    <div style={{ marginTop: 6 }}><a href={j.canonicalUrl} target="_blank" rel="noreferrer">posting</a></div>
                  </div>
                ))}
                {count(s) === 0 && <div className="muted" style={{ fontSize: 11, textAlign: 'center', padding: 6 }}>empty</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Runs ----------
const ROLE_COLORS: Record<string, string> = {
  manager: '#5aa7f0', scout: '#4cc38a', researcher: '#e2b93b',
  drafter: '#a78bfa', pipeline: '#e5654f', reviewer: '#6fd6e0',
};

export function LiveRuns() {
  const { state } = useStore();
  const [runIdInput, setRunIdInput] = useState('');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const trace = useQuery(api.runs.traceTree, activeRunId ? { runId: activeRunId as Id<'runs'> } : 'skip');

  const focusTask = state.runsFocus?.taskId;

  return (
    <div>
      <h2>Runs</h2>
      <p className="sub">The trace IS the product proof. Paste a run id to open its full step tree.</p>
      {focusTask && (
        <div className="note-stub" style={{ marginBottom: 14 }}>
          Verifying task <span className="mono">{focusTask}</span>. Run ids for a task appear in the worker logs and queue cards;
          a direct task-to-trace link lands when the ledger query exposes runId.
        </div>
      )}
      <div className="filters">
        <label className="muted">Run id</label>
        <input value={runIdInput} onChange={e => setRunIdInput(e.target.value)} placeholder="paste a runId" style={{ minWidth: 300 }} className="mono" />
        <button className="small" onClick={() => setActiveRunId(runIdInput.trim() || null)}>Open trace</button>
        <label className="muted">Agent</label>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="all">all agents</option>
          {Object.keys(ROLE_COLORS).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      {!activeRunId && <div className="panel empty">No run selected.</div>}
      {activeRunId && trace === undefined && <div className="panel empty">Loading trace...</div>}
      {trace && trace.run && (
        <div className="panel">
          <div className="queue-head">
            <b className="mono">{trace.run._id.slice(0, 12)}...</b>
            <span className="muted">started {fmtDateTime(trace.run.startedAt)}</span>
            <span className="muted">{trace.run.finishedAt ? `finished ${fmtDateTime(trace.run.finishedAt)}` : 'in flight'}</span>
            <span className="mono">{(trace.run.tokensIn + trace.run.tokensOut).toLocaleString()} tok</span>
            <span className="mono">{fmtUsd(trace.run.costUsd)}</span>
            {trace.run.success === true && <span className="badge b-ok">success</span>}
            {trace.run.success === false && <span className="badge b-err">failed</span>}
            {trace.run.error && <span style={{ color: 'var(--red)' }}>{trace.run.error}</span>}
          </div>
          {renderNodes(trace.tree as any[], 0, roleFilter)}
          {trace.steps.length === 0 && <div className="empty">No steps recorded.</div>}
        </div>
      )}
    </div>
  );
}

function renderNodes(nodes: any[], depth: number, roleFilter: string): ReactNode {
  return nodes.map(s => {
    const dimmed = roleFilter !== 'all' && s.agentRole !== roleFilter;
    return (
      <div key={s._id}>
        <div
          className={`step-row ${s.status === 'revised' ? 'revised' : s.status === 'error' ? 'error' : s.status === 'escalated' ? 'escalated' : ''}`}
          style={{ paddingLeft: 10 + depth * 26, opacity: dimmed ? 0.35 : 1 }}
        >
          <span className="mono muted">#{s.seq}</span>
          <span className="role-tag" style={{ background: `${ROLE_COLORS[s.agentRole]}22`, color: ROLE_COLORS[s.agentRole] }}>{s.agentRole}</span>
          <span className="mono" style={{ color: 'var(--muted)' }}>{s.action}</span>
          <span style={{ flex: 1, minWidth: 200 }}>
            <span className="muted">{truncate(s.inputSummary, 70)}</span><br />
            <span>{truncate(s.outputSummary, 90)}</span>
          </span>
          <span className="step-meta">
            <span>{s.tokensIn + s.tokensOut} tok</span>
            <span>{fmtUsd(s.costUsd)}</span>
            <span>{fmtMs(s.ms)}</span>
            <span className={`badge ${s.status === 'ok' ? 'b-ok' : s.status === 'revised' ? 'b-purple' : s.status === 'escalated' ? 'b-warn' : 'b-err'}`}>{s.status}</span>
          </span>
        </div>
        {s.children?.length > 0 && renderNodes(s.children, depth + 1, roleFilter)}
      </div>
    );
  });
}
