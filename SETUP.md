# Running your own Career Computa

Two audiences, two very different footprints.

## If you are a job seeker (end user)

You need: a browser, your email, optionally Telegram, optionally your LinkedIn data export. That is the whole list. Sign up on the hosted app, speak or type your goals, drop your export or resume, connect Telegram for delivery. You never install anything, and no agent runtime ever touches your machine.

## If you are an operator (hosting your own instance)

Accounts (all have free tiers except OpenRouter credits):
1. Convex (backend): `npx convex login`, then `npx convex dev --once` in this repo to create your deployment; the URL lands in `.convex-url`.
2. Cloudflare (web hosting): `npx wrangler login`, register your workers.dev subdomain, then `cd web && npx vite build && npx wrangler deploy`.
3. OpenRouter (pipeline LLM calls): create a key, add ~$10 credits.
4. Telegram (delivery): create a bot via @BotFather, put the token in `.env`.
5. Linkup (research search) and ElevenLabs (voice onboarding): optional; features degrade gracefully without them (text-only onboarding, briefs without live research).

Steps:
```
cp .env.example .env         # fill in your keys, chmod 600 .env
npx convex dev --once        # creates/deploys backend
node scripts/seed-companies.ts   # seeds the verified board registry
cd web && npx wrangler secret put ELEVENLABS_API_KEY && npx vite build && npx wrangler deploy
cd .. && npm run worker      # the pipeline worker (keep running; see the note below)
node agents/telegram-bind.mjs &   # listens for Connect Telegram taps and binds chats (required for delivery)
npm test                     # 12-case eval must pass
```

The worker currently runs as a plain Node process wherever you start it. That is the weakest link for a real deployment (a laptop lid closes and the agency sleeps); hosting it properly is the top structural item on the backlog. Everything else is serverless.

## Optional: the owner brain (Hermes)

The pipeline runs fine without Hermes. If you want conversational control of your agency (ask for status, trigger scans, get the 7:30 AM digest in Telegram), install Hermes (hermes-agent.nousresearch.com), keep its gateway locked to YOUR Telegram user id only (it has full access to the host machine; never open it to others), and run `hermes/cron-setup.sh`. The `career-computa-ops` skill in `hermes/skills/` teaches it to drive the pipeline through Convex.

## What quality you inherit

The quality mechanisms travel with the repo, not with any person's agent runtime: versioned prompts, the six resume gates, the 300-character outreach cap, the truthfulness rule (no claim without a source pointer), the em-dash lint, the eval set (`npm test`), and per-step cost/latency traces on every run.
