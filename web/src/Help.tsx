// One-page operator guide at /help. Plain words, no jargon, honest about
// what is wired and what is not.
export default function Help() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h2>How to run Career Computa</h2>
      <p className="sub">One page. Everything an operator needs during judging, in plain words.</p>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>What this is</h3>
        <p>
          Career Computa is a staff of AI agents that hunts jobs for you. It scans real company job boards,
          scores fit against your background, researches the company, and drafts everything you need to apply:
          a tailored resume, a connection note, and a DM. Drafts are created autonomously.
          <b> Nothing is ever sent to anyone without your tap.</b>
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>Review and approve drafts (Queue tab)</h3>
        <p>
          Every outbound draft waits in the Queue for your decision. Three buttons per card:
        </p>
        <ul style={{ paddingLeft: 20, marginTop: 6 }}>
          <li><b>Approve</b>: the draft is cleared to ship as written.</li>
          <li><b>Edit</b>: fix the text, then save. Your edit is recorded and trains the drafter.</li>
          <li><b>Skip</b>: reject it with a reason. The reason is recorded too.</li>
        </ul>
        <p style={{ marginTop: 6 }}>
          Every decision writes a Feedback row you can point at later. Approvals with zero edits build the
          trust streak that eventually lets a draft kind ship without review.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>Apply to a job (Ready tab)</h3>
        <p>
          One card per finished job package. Use the copy button on any block (answers, connection note, DM),
          paste it where it goes, then hit <b>Open application</b> to land on the company's real apply page in a
          new tab. When you submit, click <b>I applied</b> so the pipeline tracks it. If the job is wrong for you,
          click <b>Not for me</b> and pick a reason; that feedback is stored and steers the next scan.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>See the receipts (Ledger and Runs tabs)</h3>
        <p>
          The Ledger is the public work log: one row per task with cost, latency, and the agents involved.
          Click <b>VERIFY</b> on any row and the full step-by-step trace for that run opens on the Runs tab,
          no typing needed. The Runs tab also shows which agent spent the most money today.
          Failures and escalations stay on the board; nothing is hidden.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: 14 }}>
        <h3>Pause an agent (Roster tab)</h3>
        <p>
          Honest answer: not wired yet. The Roster cards are sample data and the pause and quota controls are
          disabled in live mode. The banner on that tab says the same thing. Real per-agent trust streaks are
          the next backend item.
        </p>
      </section>

      <section className="panel">
        <h3>Good to know</h3>
        <ul style={{ paddingLeft: 20 }}>
          <li>Demo mode (top right) masks emails and hides other people's message bodies. You always see your own drafts.</li>
          <li>Judge counters on the Ledger exclude team accounts; the total including team shows alongside.</li>
          <li>Delete my data (Onboard tab) purges every row for your account.</li>
        </ul>
      </section>
    </div>
  );
}
