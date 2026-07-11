// Unique brief link page: /brief/<artifactId>. This is the delivery surface for
// users without a bound Telegram chat. Content comes from api.public.getBrief,
// which only serves delivery_brief artifacts.
import { useQuery } from 'convex/react';
import { api } from '../convex';
import type { Id } from '../../../convex/_generated/dataModel';
import { fmtDateTime } from '../util';

export default function LiveBrief({ artifactId }: { artifactId: string }) {
  const brief = useQuery(api.public.getBrief, { artifactId: artifactId as Id<'artifacts'> });

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <h2>Your delivery brief</h2>
      <p className="sub">
        Drafts below are ready to paste. Nothing has been sent to anyone; you tap send.
      </p>
      {brief === undefined && <div className="panel empty">Loading brief...</div>}
      {brief === null && (
        <div className="panel empty">
          No brief found at this link. Check the address, or ask your agency for a fresh link.
        </div>
      )}
      {brief && (
        <div className="panel">
          <div className="queue-head" style={{ marginBottom: 10 }}>
            <span className="badge b-purple">delivery brief</span>
            <span className="muted">created {fmtDateTime(brief.createdAt)}</span>
            {brief.deliveredVia && <span className="badge b-ok">delivered via {brief.deliveredVia}</span>}
            {brief.gateResults.map(g => (
              <span key={g.gate} className={`gate-chip ${g.pass ? 'gate-pass' : 'gate-fail'}`} title={g.note ?? ''}>
                {g.pass ? 'PASS' : 'FAIL'} {g.gate}
              </span>
            ))}
          </div>
          <div className="draft-body" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{brief.content}</div>
          {brief.sourceUrls.length > 0 && (
            <div className="src-urls" style={{ marginTop: 12 }}>
              <span className="muted">Every company claim above is sourced:</span>
              {brief.sourceUrls.slice(0, 10).map(u => (
                <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
