// Printable resume page: /resume/<variantId>. Renders the tailored resume HTML
// stored in Convex (public.getResumeByVariant serves only rendered HTML resume
// artifacts) full-page in an iframe, with a print button so the browser's
// print-to-PDF produces the deliverable. No local file paths involved.
import { useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../convex';
import { fmtDateTime } from '../util';

export default function LiveResume({ variantId }: { variantId: string }) {
  const resume = useQuery(api.public.getResumeByVariant, { variantId });
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  function onPrint() {
    const w = frameRef.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '18px 16px' }}>
      {resume === undefined && <div className="panel empty">Loading resume...</div>}
      {resume === null && (
        <div className="panel empty">
          No rendered resume at this link. The variant may predate HTML rendering, or the address is off;
          open the package on your Ready tab for a fresh link.
        </div>
      )}
      {resume && (
        <>
          <div className="queue-head" style={{ marginBottom: 10 }}>
            <b>Tailored resume</b>
            <span className="mono muted" style={{ fontSize: 11 }}>{resume.variantId}</span>
            <span className="muted" style={{ fontSize: 11 }}>rendered {fmtDateTime(resume.createdAt)}</span>
            {resume.gateResults.filter(g => !g.pass).map(g => (
              <span key={g.gate} className="gate-chip gate-fail" title={g.note ?? ''}>FAIL {g.gate}</span>
            ))}
            <button className="primary small" style={{ marginLeft: 'auto' }} onClick={onPrint}>
              Print / save as PDF
            </button>
          </div>
          <iframe
            ref={frameRef}
            title={`Resume ${resume.variantId}`}
            srcDoc={resume.html}
            style={{ width: '100%', height: 'calc(100vh - 130px)', minHeight: 640, border: '1px solid var(--line, #2a2a2a)', borderRadius: 8, background: '#fff' }}
          />
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Use the button above (or print from inside the frame) and choose "Save as PDF". The layout is print-ready.
          </p>
        </>
      )}
    </div>
  );
}
