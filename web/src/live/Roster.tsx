// Live Roster: real trust streaks from convex/trust.ts (feedback rows are the
// state). Graduation flips a kind to no-review shipping; one click revokes.
// Pause and quota stay disabled: no agent-config table in the frozen contract.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api, getMyUserId } from '../convex';
import type { Id } from '../../../convex/_generated/dataModel';

const AGENTS: { role: string; blurb: string; kinds: string[] }[] = [
  { role: 'manager', blurb: 'Plans every task, delegates to specialists, composes the final brief.', kinds: ['brief_delivery'] },
  { role: 'scout', blurb: 'Scores job fit against the profile with evidence pairs and caveats.', kinds: ['fit_score'] },
  { role: 'researcher', blurb: 'Digs into companies and people; every claim ships with a source URL.', kinds: [] },
  { role: 'drafter', blurb: 'Renders resume variants and writes notes under the 300 char cap.', kinds: ['resume_variant', 'connection_note', 'dm_draft'] },
  { role: 'pipeline', blurb: 'Polls ATS boards, tracks job state, never lets a role go stale silently.', kinds: [] },
  { role: 'reviewer', blurb: 'Runs the gates: char caps, sources, tone rules, no em dashes. Sends work back.', kinds: [] },
];

const KIND_LABELS: Record<string, string> = {
  fit_score: 'fit scores',
  resume_variant: 'resume variants',
  connection_note: 'connection notes',
  dm_draft: 'DM drafts',
  brief_delivery: 'brief delivery',
};

type TrustKind = { kind: string; streak: number; graduated: boolean; remaining: number; lastAt: number | null };

function Meter({ k, threshold, onRevoke }: { k: TrustKind; threshold: number; onRevoke: (kind: string) => void }) {
  const pct = Math.min(100, Math.round((k.streak / threshold) * 100));
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ minWidth: 120 }}>{KIND_LABELS[k.kind] ?? k.kind}</span>
        <span className="mono muted">{k.streak}/{threshold} clean approvals</span>
        {k.graduated ? (
          <>
            <span className="badge b-ok">graduated: ships without review</span>
            <button className="small" onClick={() => onRevoke(k.kind)}>resume reviews</button>
          </>
        ) : (
          <span className="muted">{k.remaining} to graduate</span>
        )}
      </div>
      <div style={{ height: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, marginTop: 4 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: k.graduated ? 'var(--accent)' : 'var(--blue)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

export default function LiveRoster() {
  // Trust is per user and tenant-scoped, like everything else.
  const userId = getMyUserId();

  const trust = useQuery(api.trust.status, userId ? { userId: userId as Id<'users'> } : 'skip');
  const revoke = useMutation(api.trust.revoke);

  const [toast, setToast] = useState<{ msg: string; undoKind?: string } | null>(null);
  const prevGraduated = useRef<Set<string> | null>(null);

  // Graduation toast: fires when a kind crosses the threshold while watching.
  useEffect(() => {
    if (!trust) return;
    const now = new Set(trust.kinds.filter(k => k.graduated).map(k => k.kind));
    if (prevGraduated.current !== null) {
      for (const kind of now) {
        if (!prevGraduated.current.has(kind)) {
          setToast({
            msg: `Graduated: ${KIND_LABELS[kind] ?? kind} now ship without review. Undo anytime.`,
            undoKind: kind,
          });
        }
      }
    }
    prevGraduated.current = now;
  }, [trust]);

  async function onRevoke(kind: string) {
    if (!userId) return;
    await revoke({ userId: userId as Id<'users'>, kind: kind as any });
    setToast({ msg: `Reviews resumed for ${KIND_LABELS[kind] ?? kind}. Streak restarts from zero.` });
    setTimeout(() => setToast(null), 4000);
  }

  const byKind = new Map<string, TrustKind>((trust?.kinds ?? []).map(k => [k.kind, k]));

  return (
    <div>
      <h2>Roster</h2>
      <p className="sub">
        The Career Computa staff. Trust is earned per action kind: {trust ? trust.threshold : '...'} clean approvals in a row and that kind ships
        without review. Any edit, skip, or thumbs down resets it. Live spend per agent is on the Runs tab.
      </p>

      {!userId && <div className="panel empty">Trust is tracked per account. Sign up on the Onboard tab; meters light up after your first approval.</div>}

      {trust && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <h3>Trust graduation (live streaks from real feedback rows)</h3>
          {trust.kinds.map(k => <Meter key={k.kind} k={k} threshold={trust.threshold} onRevoke={onRevoke} />)}
        </div>
      )}

      <div className="roster-grid">
        {AGENTS.map(a => (
          <div className="agent-card" key={a.role}>
            <div className="agent-head">
              <span className="agent-name">{a.role}</span>
              <button className="danger small" disabled title="Pause is not wired to the live worker yet">Pause</button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{a.blurb}</p>
            {a.kinds.length > 0 ? (
              a.kinds.map(kind => {
                const k = byKind.get(kind);
                return k ? (
                  <div className="stat-line" key={kind}>
                    <span>{KIND_LABELS[kind]}</span>
                    <b>{k.graduated ? 'graduated' : `${k.streak}/${trust?.threshold ?? '...'}`}</b>
                  </div>
                ) : null;
              })
            ) : (
              <div className="stat-line"><span>trust path</span><b>always gated</b></div>
            )}
          </div>
        ))}
      </div>

      <div className="note-stub">
        Pause and quota are disabled: the frozen contract has no agent-config table, so the worker cannot read them yet.
        The trust meters above are live; everything else agent-level (steps, spend, errors) is on the Runs tab from the real trace.
      </div>

      {toast && (
        <div className="toast">
          {toast.msg}
          {toast.undoKind && (
            <button className="small" style={{ marginLeft: 10 }} onClick={() => { onRevoke(toast.undoKind!); }}>
              resume reviews
            </button>
          )}
          <button className="small" style={{ marginLeft: 8 }} onClick={() => setToast(null)}>dismiss</button>
        </div>
      )}
    </div>
  );
}
