# Career Computa

A career consultant agency run by AI agents. Hand it your career context and it works a real job search: it polls live public job boards (Greenhouse, Lever, Ashby) at real companies, dedupes and hard-filters with logged reasons, scores fit 0 to 100 with caveats and line-level evidence, researches the company with live search, tailors a resume through quality gates, writes LinkedIn-ready outreach, and delivers the finished package to your Telegram. Drafts are always created autonomously; the human keeps exactly one job, the send decision, because LinkedIn terms make automated sending a bannable offense. Agents earn autonomy over time: after enough clean approvals, an action kind graduates and skips review, with one-click revoke.

Built at the GrowthX Hermes Buildathon, 2026-07-11, then hardened into a real product.

## Live

- Web app: https://career-agency-web.bsplaza.workers.dev
- Delivery bot: @CareerAgencyBriefs_bot on Telegram
- Repo: https://github.com/BSPLAZA/career-computa

## Architecture in one line

Two systems with one contract: a deterministic **pipeline** (agents/) does high-volume work with LLM calls only at judgment steps, and an optional Hermes **owner brain** (hermes/) gives conversational control and the daily digest. See `docs/ARCHITECTURE.md` for the rails-and-brain split and why it is drawn where it is.

## Map

| Doc | What it covers |
|---|---|
| `SETUP.md` | Running your own instance (job seeker vs operator), the account list, the run commands |
| `docs/ARCHITECTURE.md` | Rails vs brain, the contract between them, the honest quality-tier analysis |
| `STATE.md` | Where the project was left, deployment IDs, accounts, what works, what to restart, known limits |
| `AGENTS.md` | Rules for any coding session in this repo (path ownership, clean room, no em dashes, secrets, the tap boundary) |
| `contracts/schema.ts` | The frozen data model every lane builds against |
| `../../idea-lab/product-backlog.md` | The ranked roadmap: NOW (done), NEXT (retention loop), LATER (structural bets) |
| `../../idea-lab/*.md` | Concept, experience map, spec critique, resume engine, Hermes plan, demo script |

## Code layout

- `convex/` backend: schema, queries, mutations. Deploy with `npx convex dev --once`.
- `agents/` the pipeline: ATS pollers (`ats.js`, `boards.js`), the intake orchestrator (`intake.js`), the worker loop (`worker.js`), Telegram send (`telegram.js`) and bind listener (`telegram-bind.mjs`).
- `parsers/` LinkedIn export parsing (`linkedin.js`), document extraction (`docs.js`), the resume engine and its six quality gates (`resume.js`, `render.js`).
- `web/` the Vite + React app and its Cloudflare Worker API routes (`worker/api.ts`, ElevenLabs speech-to-text and OpenRouter behind server-held secrets).
- `hermes/` the owner-brain skill and cron scaffolding.
- `scripts/` seeds, the eval harness (`fit-eval.mjs`, run via `npm test`), and ops helpers (`agency-status.mjs`, `agency-enqueue.mjs`).

## Verify it works

```
npm test                 # 12-case fit eval, expects 12/12
node scripts/agency-status.mjs   # compact owner digest from live Convex
```
