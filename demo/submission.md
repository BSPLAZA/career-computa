# Submission (paste-ready; fill the two [FILL] slots at submit time)

**Project:** Career Computa (a career agency run by agents)
**Track:** AI as Agency (Track 3)
**One-liner:** A career consultant agency run by an agent crew: hand it your career data, it finds real openings on live company job boards, scores fit with evidence, researches the company, tailors your resume through quality gates, writes your LinkedIn outreach, and delivers the finished package to your Telegram; only the send decision stays human.

**Live product:** https://career-agency-web.bsplaza.workers.dev  (public ledger tab shows every task with a VERIFY link: live posting, full agent trace with per-step cost, artifacts)
**Repo:** https://github.com/BSPLAZA/career-computa (public; every commit today, on the floor)

**How we use Hermes (eligibility path: coding partner, with receipts):**
Hermes sessions authored real modules of this product on the floor today: the six agent role charters, the fit-eval harness and its recorded baseline, and the ElevenLabs task announcer. Session receipts (prompts, tool calls, outputs) are browsable on our machine via the Hermes dashboard and session logs, alongside a same-day public commit history. The agency's role charters are also mounted in our Hermes runtime for operator use; we make no claim that the product's task pipeline executes on Hermes.

**The agent org:** manager plans per request, delegates to scout, researcher, drafter, pipeline specialists with narrowed tools, reviews against a hard acceptance checklist, and sends work back for revision (revised steps visible in every trace). Multi-tenant: any attendee signs up with their own email, uploads their own LinkedIn export or resume (or the 3-field quick path), and gets a real delivered package.

**Atomic task unit (declared in writing, flagged to a mentor before judging):** one task = one real job posting or one outside submission processed end to end: live ATS fetch, dedupe, hard-filter verdict, fit score with caveats and evidence, sourced research brief, resume variant passing six quality gates, LinkedIn-ready connection note (under 300 chars) and DM draft, delivery brief to the submitter's own Telegram or unique link, full trace row on the public ledger. Auto-rejected postings are logged but never counted as completed tasks. Failures stay visible on the ledger.

**Numbers at submission (all re-verifiable live in Convex at judging):** [FILL: tasks completed N, outside signups with first use S, jobs discovered J, briefs delivered D, success rate X percent over M attempts across 3+ batch runs, median cost and latency per task]

**Power-ups in real use:** Convex (production backend, every table live), Cloudflare (hosting the product on workers.dev), Linkup (live search inside every research brief, source URLs stored), Wispr Flow (500+ words of real onboarding and demo content dictated during the event), ElevenLabs (voice announcing completed tasks, if shipped by freeze).

**Honest flags (per the flag-it-early rule):**
1. Bryan operates prior personal job-search tooling. Today's build shares zero code, prompts, or schemas with it; clean-room was enforced in every session and the receipts and commit history show everything was written today on the floor.
2. The seed tenant's LinkedIn data export is dated June 23. It is user DATA (like a resume), not code; every parser that touches it was written today.
3. Human-in-the-loop boundary is deliberate policy: LinkedIn's terms prohibit automated sending, so the crew completes everything up to the paste-ready package and delivery, and the human performs the send inside LinkedIn.
