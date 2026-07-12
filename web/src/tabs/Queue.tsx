import { useState } from 'react';
import { useStore, makeFeedback } from '../store';
import { maskEmail, fmtDateTime } from '../util';
import type { Artifact } from '../types';

const TAPPABLE: Artifact['kind'][] = ['connection_note', 'dm_draft', 'delivery_brief'];

function CharCount({ text, cap }: { text: string; cap: number }) {
  const n = text.length;
  return <span className={`charcount ${n > cap ? 'over' : ''}`}>{n}/{cap} chars</span>;
}

export default function Queue() {
  const { state, dispatch } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [skipping, setSkipping] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');

  const decided = new Set(state.feedback.map(f => f.artifactId));
  const pending = state.artifacts.filter(a => TAPPABLE.includes(a.kind) && !decided.has(a._id) && !a.deliveredAt);

  function verdict(a: Artifact, v: 'approve' | 'skip' | 'edit', reason?: string, editDiff?: string) {
    dispatch({ type: 'feedback', row: makeFeedback(a.userId, a._id, v, reason, editDiff) });
    setEditing(null);
    setSkipping(null);
    setSkipReason('');
  }

  return (
    <div>
      <h2>Queue</h2>
      <p className="sub">
        Drafts awaiting your tap. Approving unlocks send; nothing leaves without it. Edits and skips become preference rules the drafter learns from.
      </p>

      {pending.length === 0 && <div className="panel empty">Queue is clear. New drafts land here as agents finish.</div>}

      {pending.map(a => {
        const user = state.users.find(u => u._id === a.userId);
        const isNote = a.kind === 'connection_note' || a.kind === 'dm_draft';
        return (
          <div className="queue-card" key={a._id}>
            <div className="queue-head">
              <span className="badge b-purple">{a.kind.replace(/_/g, ' ')}</span>
              <span className="mono muted">{a._id}</span>
              <span className="muted">for {user ? maskEmail(user.email) : '?'}</span>
              {isNote && <CharCount text={a.content} cap={300} />}
              <span className="muted mono" style={{ marginLeft: 'auto' }}>run {a.runId}</span>
            </div>

            {state.demoMode && isNote ? (
              <div className="draft-body muted">[hidden by privacy mask]</div>
            ) : editing === a._id ? (
              <textarea
                className="draft-body"
                style={{ width: '100%', minHeight: 110 }}
                value={editText}
                onChange={e => setEditText(e.target.value)}
              />
            ) : (
              <div className="draft-body">{a.content}</div>
            )}

            {a.gateResults && (
              <div style={{ marginBottom: 8 }}>
                {a.gateResults.map(g => (
                  <span key={g.gate} className={`gate-chip ${g.pass ? 'gate-pass' : 'gate-fail'}`} title={g.note ?? ''}>
                    {g.pass ? 'PASS' : 'FAIL'} {g.gate}
                  </span>
                ))}
              </div>
            )}

            {a.sourceUrls && a.sourceUrls.length > 0 && (
              <div className="src-urls">
                <span className="muted">Sources:</span>
                {a.sourceUrls.map(u => <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>)}
              </div>
            )}

            <div className="card-actions">
              {editing === a._id ? (
                <>
                  <button className="primary small" onClick={() => verdict(a, 'edit', undefined, `manual edit, ${editText.length} chars`)}>
                    Save edit and approve
                  </button>
                  {editing === a._id && <CharCount text={editText} cap={300} />}
                  <button className="small" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : skipping === a._id ? (
                <>
                  <input
                    placeholder="Why skip? This trains the drafter."
                    value={skipReason}
                    onChange={e => setSkipReason(e.target.value)}
                    style={{ minWidth: 260 }}
                  />
                  <button className="danger small" onClick={() => verdict(a, 'skip', skipReason || 'no reason given')}>Confirm skip</button>
                  <button className="small" onClick={() => setSkipping(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button className="primary" onClick={() => verdict(a, 'approve')}>Approve</button>
                  <button onClick={() => { setEditing(a._id); setEditText(a.content); }}>Edit</button>
                  <button onClick={() => setSkipping(a._id)}>Skip</button>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="section-gap">
        <h3>Recent verdicts</h3>
        <div className="panel tbl-wrap">
          <table>
            <thead>
              <tr><th>When</th><th>Artifact</th><th>Verdict</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {[...state.feedback].sort((x, y) => y.at - x.at).map(f => (
                <tr key={f._id}>
                  <td className="mono">{fmtDateTime(f.at)}</td>
                  <td className="mono">{f.artifactId}</td>
                  <td>
                    <span className={`badge ${f.verdict === 'approve' ? 'b-ok' : f.verdict === 'edit' ? 'b-info' : 'b-warn'}`}>{f.verdict}</span>
                  </td>
                  <td className="muted">{f.editDiff ?? f.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
