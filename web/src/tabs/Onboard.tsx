import { useState } from 'react';
import { useStore } from '../store';
import { maskEmail } from '../util';

const BOT = 'CareerAgencyBriefs_bot';

export default function Onboard() {
  const { state, dispatch } = useStore();
  const [email, setEmail] = useState('');
  const [signedUp, setSignedUp] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [cur, setCur] = useState('');
  const [tgt, setTgt] = useState('');
  const [c1, setC1] = useState('');
  const [c2, setC2] = useState('');
  const [c3, setC3] = useState('');
  const [taskCreated, setTaskCreated] = useState(false);

  function signup(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) return;
    dispatch({ type: 'signup', email: email.trim() });
    setSignedUp(true);
  }

  // Resolve the signed-up user by email each render. With Convex wired, the
  // signup mutation returns the row (including signupToken) directly instead.
  const active = signedUp ? state.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase()) : undefined;
  const link = active ? `https://t.me/${BOT}?start=${active.signupToken}` : null;

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const names = Array.from(e.dataTransfer.files).map(f => f.name);
    setFiles(prev => [...prev, ...names]);
  }

  function quickPath(e: React.FormEvent) {
    e.preventDefault();
    if (!active || !cur || !tgt) return;
    dispatch({ type: 'quickPath', userId: active._id, currentRole: cur, targetRole: tgt, companies: [c1, c2, c3] });
    setTaskCreated(true);
  }

  return (
    <div>
      <h2>Onboard</h2>
      <p className="sub">Sign up, connect Telegram for briefs, hand over your career context. The agency does the rest.</p>

      <div className="onboard-grid">
        <section className="panel">
          <h3>1. Sign up</h3>
          {!active ? (
            <form onSubmit={signup}>
              <div className="field">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <button className="primary" type="submit">Create my agency</button>
            </form>
          ) : (
            <>
              <p style={{ marginBottom: 10 }}>
                Signed up as <b className="mono">{state.demoMode ? maskEmail(active.email) : active.email}</b>
              </p>
              <div className="field">
                <label>Connect Telegram (briefs get delivered here)</label>
                <div className="deeplink">
                  <a href={link!} target="_blank" rel="noreferrer">{link}</a>
                </div>
              </div>
              {active.telegramChatId
                ? <span className="badge b-ok">Telegram connected</span>
                : <span className="badge b-warn">Not connected yet. Open the link, hit Start.</span>}
            </>
          )}
        </section>

        <section className="panel">
          <h3>2. Upload your context</h3>
          <div
            className={`dropzone ${dragOver ? 'hover' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <p><b>Drop files here</b></p>
            <p style={{ marginTop: 6, fontSize: 12 }}>
              LinkedIn data export (.zip) or drop the unzipped folder. Resume PDF. Performance docs, brag sheets, anything that proves what you did.
            </p>
            {files.length > 0 && (
              <ul className="file-list">
                {files.map((f, i) => <li key={i}>{f} <span className="badge b-info">queued for parsing</span></li>)}
              </ul>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Parsing runs on the backend once wired; files are listed here and picked up by the intake task.
          </p>
        </section>

        <section className="panel">
          <h3>3. Quick path (no files needed)</h3>
          <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Thirty seconds to a runnable task. Files make it better, not possible.</p>
          <form onSubmit={quickPath}>
            <div className="field">
              <label>Current role</label>
              <input value={cur} onChange={e => setCur(e.target.value)} placeholder="Product Manager" required />
            </div>
            <div className="field">
              <label>Target role</label>
              <input value={tgt} onChange={e => setTgt(e.target.value)} placeholder="Senior Product Manager" required />
            </div>
            <div className="field">
              <label>Three target companies</label>
              <input value={c1} onChange={e => setC1(e.target.value)} placeholder="Company 1" />
              <input value={c2} onChange={e => setC2(e.target.value)} placeholder="Company 2" style={{ marginTop: 6 }} />
              <input value={c3} onChange={e => setC3(e.target.value)} placeholder="Company 3" style={{ marginTop: 6 }} />
            </div>
            <button className="primary" type="submit" disabled={!active}>
              {active ? 'Start my first scan' : 'Sign up first'}
            </button>
            {taskCreated && <span className="badge b-ok" style={{ marginLeft: 10 }}>Task queued. Watch the Ledger.</span>}
          </form>
        </section>
      </div>

      <div className="privacy panel section-gap">
        <b>Privacy:</b> your documents stay in your tenant, feed only your own agents, and are never used to train anything.
        Drafts are written for you; nothing is ever sent anywhere without your explicit tap.
        {' '}
        {active && !active.deleteRequestedAt && (
          <button className="danger small" style={{ marginLeft: 10 }} onClick={() => dispatch({ type: 'deleteMyData', userId: active._id })}>
            Delete my data
          </button>
        )}
        {active?.deleteRequestedAt && <span className="badge b-err" style={{ marginLeft: 10 }}>Deletion requested; purge runs within 24h</span>}
      </div>
    </div>
  );
}
