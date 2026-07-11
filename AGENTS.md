# Career Agency Build: rules for every agent and session working in this repo

Fresh build for the Hermes Buildathon, started 2026-07-11 on the event floor. The brain session (idea-lab) coordinates; COORDINATION.md at the workspace root is the bus.

## Read first
1. contracts/schema.ts (FROZEN; brain session is sole editor)
2. ../../idea-lab/chosen-concept.md and build-ops-plan.md (decisions and boundaries)
3. ../../UPLOAD-FLOW-BRIEF.md (intake priorities) and ../../INFRA-HANDOFF.md (machine state, keys, gotchas)

## Hard rules
- Path ownership: convex/ (convex lane), agents/ (pipeline lane), web/ (web lane), parsers/ (parsers lane), hermes/ (hermes assets), demo/, scripts/. Never edit outside your lane's dirs. Cross-cutting needs go to the brain, not into files.
- NO git commands. The brain commits at phase boundaries.
- Clean-room: no code, prompts, schemas, or recipes from Pulse, the MasterPlan vault, or any prior Bryan project. The document intake folder (/Users/orion/Library/CloudStorage/OneDrive-Personal/Resume) is DATA ONLY: resume PDFs/DOCX and Microsoft Performance Docs; never open Resume Agent/, dashboard_server.py, its CLAUDE.md, or .claude/ there.
- No em dashes anywhere: code comments, UI copy, generated artifacts (lint before finalize), commit messages.
- Demo-path data is real only: Bryan's real profile, real target companies, live ATS boards, real submitters. Mocks only in tests, never on screen.
- Secrets: build .env (product bot token) and ~/.hermes/.env (LINKUP_API_KEY, OPENROUTER_API_KEY, ELEVENLABS_API_KEY). Source them; never print, log, or commit values.
- The tap boundary: draft creation autonomous; human tap gates SEND only. The single allowed autonomous outbound is the delivery brief to the submitter's own bound Telegram chat or unique brief link.
- LLM calls in product code go through OpenRouter (OPENROUTER_API_KEY, model anthropic/claude-sonnet-4.6 default, cheap model for classification). Codex quota is reserved for the Hermes runtime.
- Every pipeline step writes a RunStep row. If a table or function you need is missing, stub against contracts/schema.ts types and note it in your final report; do not invent schema.
