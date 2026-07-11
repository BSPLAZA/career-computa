# agents/ (pipeline engine lane)

Plain Node ESM, zero npm deps. Talks to Convex over its public HTTP API using repo-root `.convex-url`; falls back to a JSONL stub in `agents/.local-store/` when that file is absent.

## Run it

```sh
# one-shot intake (testing and demo)
node agents/run-intake.js --board sierra --email someone@example.com [--profile p.json] [--top 1] [--no-deliver]

# enqueue only, then let the worker claim it
node agents/run-intake.js --board sierra --email someone@example.com --enqueue
node agents/worker.js          # polls claimNextQueuedTask every 5s, survives errors

# checks
node agents/test/checks.js     # unit-style gates: em-dash lint, 300 cap, hard filters
node agents/test/smoke-live.js # live ATS boards + tiny OpenRouter and Linkup calls
```

`--email` signs the user up idempotently with isTeam=true (test traffic never pollutes judge counters). Real users come through the web signup and get isTeam=false.

## Pipeline steps (each writes a RunStep row)
plan -> fetch_board -> dedupe -> hard_filter (auto-rejects persist with reasons and stop) -> fit_score (sonnet, score + caveats + evidence) -> research (Linkup, every claim keeps its URL) -> render_resume (parsers/render.js if present, else explicit stub) -> draft_note (300 char hard cap) -> dm_draft -> review (checklist; on failure exactly one revise step with status=revised) -> compose_brief -> deliver (bound Telegram chat, else unique /brief/<artifactId> link).

Unmappable task input escalates with context. Dead boards (200 with zero jobs) escalate with a warning, never read as zero matches.

## Files
- boards.js: 20 verified board tokens (greenhouse, lever, ashby)
- ats.js: normalized fetchers; Ashby disk cache respects the 60s CDN window
- intake.js: the manager loop; lint and cap gates enforced in code
- store.js: Convex HTTP client + local JSONL stub behind one interface
- worker.js / run-intake.js: poller and one-shot CLI
- llm.js (OpenRouter, usage+cost per call), linkup.js, lint.js, telegram.js, env.js
