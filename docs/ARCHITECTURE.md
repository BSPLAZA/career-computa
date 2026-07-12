# Architecture: rails and brain

Career Computa is two systems with one contract between them.

## The rails (deterministic pipeline, agents/)

High-volume, known-shape work: fetch boards, dedupe, hard-filter, fit-score, research, render, compose, deliver. Plain Node code with LLM calls only at judgment steps, via OpenRouter. Every step writes a runStep row (tokens, cost, ms, status) to Convex.

Why rails and not an agent loop here:
- Latency and cost: 20 to 40 seconds and roughly $0.02 per task, promised and measured. An agentic loop is minutes and multiples, with variance users feel.
- Consistency: the same posting scored twice gets the same treatment; that is what makes the eval set and the trust-graduation streaks meaningful.
- Isolation: strangers submit input to the rails; the rails have no shell, no filesystem access, no tool surface beyond the pipeline itself.
- Portability: quality lives in versioned prompts, quality gates (truthfulness source pointers, 300-char caps, page-fit, em-dash lint), and the eval set: all in the repo, inherited by anyone who deploys it. Nothing depends on state accumulated inside one person's agent runtime.

## The brain (Hermes, hermes/)

Low-volume, high-judgment, owner-facing work: conversational control of the agency (status, why-rejected, run a scan), the daily digest cron, and escalations that need real reasoning or new plans. Runs on the OWNER's machine with the owner's locked Telegram gateway; never exposed to other tenants (the Hermes gateway grants the full host toolset and has no per-user tiering, so this boundary is security, not preference).

## The contract

- Brain to rails: enqueue tasks via Convex mutations (scripts/agency-enqueue.mjs); read state via queries.
- Rails to brain: tasks the rails cannot or should not decide escalate with full context (status escalated, exceptions queue). A planned middle tier routes high-stakes items (dream-company applications, low-confidence scores, thin research) to the brain for deeper work on the owner's own tenant.

## Quality tiers, honestly

Where rails already beat a loop: scoring consistency, cost, latency, per-step auditability, centralized improvement (a prompt fix or new eval case ships to every tenant at once; an agent's learned skill lives in one runtime).
Where a loop would beat today's rails: multi-hop research (a second follow-up query when the first is thin), iterative resume tailoring against the gates, novel task shapes. The first two get bounded loops IN the rails (two-hop research, one revise pass, more if evals justify it); the third is exactly what escalation to the brain is for.
