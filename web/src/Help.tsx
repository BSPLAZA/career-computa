// One-page operator guide at /help. Plain words, no jargon, honest about
// what is wired and what is not.
export default function Help() {
  return (
    <div className="help-doc">
      <h2>How to run Career Computa</h2>
      <p className="sub">One page, plain words. Everything you need to run your search here.</p>

      <section className="panel">
        <h3>What this is</h3>
        <p>
          Career Computa is a staff of AI agents that hunts jobs for you. It scans real company job boards,
          scores fit against your background, researches the company, and drafts everything you need to apply:
          a tailored resume, a connection note, and a DM. Drafts are created autonomously.
          <b> Nothing is ever sent to anyone without your tap.</b>
        </p>
      </section>

      <section className="panel">
        <h3>Review and approve drafts (Queue tab)</h3>
        <p>
          Every outbound draft waits in the Queue for your decision. Three buttons per card:
        </p>
        <ul>
          <li><b>Approve</b>: the draft is cleared to ship as written.</li>
          <li><b>Edit</b>: fix the text, then save. Your edit is recorded and trains the drafter.</li>
          <li><b>Skip</b>: reject it with a reason. The reason is recorded too.</li>
        </ul>
        <p style={{ marginTop: 6 }}>
          Every decision writes a feedback row you can point at later. Approvals with zero edits build the
          trust streak that eventually lets a draft kind ship without review.
        </p>
      </section>

      <section className="panel">
        <h3>Apply to a job (Ready tab)</h3>
        <p>
          One card per finished job package. Use the copy button on any block (answers, connection note, DM),
          paste it where it goes, then hit <b>Open application</b> to land on the company's real apply page in a
          new tab. When you submit, click <b>I applied</b> so the pipeline tracks it. If the job is wrong for you,
          click <b>Not for me</b> and pick a reason; that feedback is stored and steers the next scan.
        </p>
      </section>

      <section className="panel">
        <h3>See the receipts (Ledger and Runs tabs)</h3>
        <p>
          The Ledger is the work log: one row per task with cost, latency, and the agents involved.
          Click <b>VERIFY</b> on any row and the full step-by-step trace for that run opens on the Runs tab,
          no typing needed. The Runs tab also shows which agent spent the most money today.
          Failures and escalations stay on the board; nothing is hidden.
        </p>
      </section>

      <section className="panel">
        <h3>Pause an agent (Roster tab)</h3>
        <p>
          Honest answer: not wired yet. The trust meters on the Roster are live and built from your real
          feedback, but the pause and quota controls are disabled until the worker can read them.
          The note on that tab says the same thing.
        </p>
      </section>

      <section className="panel">
        <h3>Good to know</h3>
        <ul>
          <li>Privacy mask (top right) hides emails and other people's message bodies. You always see your own drafts.</li>
          <li>Ledger counters split member activity from the team's own accounts, so the numbers stay honest.</li>
          <li>Delete my data (Onboard tab) purges every row for your account, immediately.</li>
        </ul>
      </section>
    </div>
  );
}
