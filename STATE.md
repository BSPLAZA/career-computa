# State of play: where Career Computa was left

Snapshot taken 2026-07-11 evening, at a clean stopping point. Working tree committed and pushed (HEAD 2618549). This doc is the "resume from here" guide.

## What works, verified end to end

- A real user signs up on the web app, onboards by voice or text, and receives a finished application package in their Telegram within about 30 seconds for roughly $0.02.
- The pipeline polls live public ATS boards (Greenhouse, Lever, Ashby, 20 seeded companies), dedupes, hard-filters with logged reasons, fit-scores with caveats and evidence, researches via Linkup, renders a tailored resume through six quality gates, and drafts LinkedIn outreach (connection note under 300 chars plus a DM).
- Delivery to Telegram is live (@CareerAgencyBriefs_bot); the bind listener turns Connect Telegram taps into account bindings.
- Trust graduation, feedback-to-memory with undo, one-click trace verification (owner-scoped), and tenant isolation are all implemented and adversarially tested.
- Eval harness passes 12/12 (`npm test`).

## Deployment facts

- Live Convex deployment: `small-goldfinch-896` (URL in `.convex-url`). This is the one the site and worker use. Deploy changes with `npx convex dev --once`, never `npx convex deploy` (that targets a separate prod deployment `nautical-warthog-45` which is NOT the live one).
- Web: Cloudflare Worker at career-agency-web.bsplaza.workers.dev. Redeploy: `cd web && npx vite build && npx wrangler deploy`.
- Worker secrets set on Cloudflare: ELEVENLABS_API_KEY, OPENROUTER_API_KEY (confirmed via `wrangler secret list`).
- Local secrets in `.env` (gitignored, chmod 600): TELEGRAM_PRODUCT_BOT_TOKEN. Shared keys in `~/.hermes/.env`: OPENROUTER_API_KEY, LINKUP_API_KEY, ELEVENLABS_API_KEY.

## Accounts in the live data

- `bryansilvaplaza@gmail.com`: the real owner account, Telegram-bound (chat 6740203693). Use this one to try the product. No resume uploaded yet, so its cards honestly show a "no resume" nudge until one is added on Onboard.
- `team-bryan@career-agency.local` and `pipeline-smoke@example.com`: team/test accounts (isTeam or smoke), excluded from member-facing counters. Fine to leave or delete via `users:deleteMyData` with their signupToken.

## Two processes that stop when this laptop sleeps

These are plain Node processes, not hosted. On resume, restart both from the repo root:

```
npm run worker &                  # the pipeline: claims queued tasks and delivers
node agents/telegram-bind.mjs &   # binds Connect Telegram taps to accounts
```

Nothing else needs restarting; Convex and Cloudflare are serverless. Hosting the worker properly is backlog item L2 and is the single biggest reliability upgrade.

## ElevenLabs, two integrations

1. Voice onboarding (primary, live): browser audio to the `/api/transcribe` Worker route to ElevenLabs speech-to-text (scribe_v1). Key held server-side.
2. Task announcements (built, off by default): `scripts/announce.mjs` speaks a delivery line via ElevenLabs text-to-speech. Enable with `ANNOUNCE=1` on the worker. Verified working.

## Known limits at this snapshot (all on the backlog)

- The worker is an unsupervised laptop process (L2, hosted worker).
- No real auth: accounts are identified by an unguessable signup token used as a bearer capability; the cross-tenant tourniquet is in place, but real auth (L1) supersedes it before any public launch.
- The full mic round-trip (real phone, real speech) is unverified by a human; the transcribe route itself is verified (N7).
- Legacy runStep rows from early in the build still contain plaintext user ids in their text; unreachable by strangers now (redacted on read), but not scrubbed at rest. A one-off migration is optional.
- Demo and marketing copy in `demo/` still promises publicly verifiable traces; traces are now owner-only. Soften the copy or ship L1.

## To pick up work later

1. Read `../../idea-lab/product-backlog.md`. It is ranked and current.
2. The recommended next build is NEXT tier X1: the 7:30 AM Telegram digest. The Hermes owner-brain scaffolding (`hermes/`, `scripts/agency-status.mjs`) is already built, so this is mostly wiring.
3. Then X2 (pasted recruiter message ingestion) and X3 (referral asks from Connections.csv) are the rest of the retention loop.
