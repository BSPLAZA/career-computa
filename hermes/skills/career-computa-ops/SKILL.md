---
name: career-computa-ops
description: Operate the Career Agency as its owner through tenant-scoped Convex queries and the agency status and enqueue scripts.
---

# Career Computa Ops

Use this skill for owner questions such as:

- What is the agency status?
- Show me the queue.
- Why was a posting rejected?
- Run a scan for a company or ATS board.

## Hard boundaries

1. Establish the owner's `userId` from the current trusted conversation context. Pass it explicitly to every tenant-scoped command. If it is unavailable, run the status script without `--user` only for the configured owner tenant. Never guess another user's id.
2. Never query, inspect, summarize, or mutate another tenant's data.
3. Never send, post, apply, message, or deliver anything. Draft and queue creation are allowed. A human tap gates every send.
4. Keep failures, caveats, rejection reasons, and missing evidence visible.
5. Never print secrets or read credential files.

Run commands from the Career Agency repository root.

## Status and queue

```sh
node scripts/agency-status.mjs --user "$USER_ID"
```

This is the default owner digest. For queue details, use only tenant-scoped queries:

```sh
npx convex run tasks:tasksForUser "{\"userId\":\"$USER_ID\"}"
npx convex run public:digestQueue "{\"userId\":\"$USER_ID\"}"
npx convex run jobs:pipelineBoard "{\"userId\":\"$USER_ID\"}"
npx convex run trust:status "{\"userId\":\"$USER_ID\"}"
```

Summarize counts first, then show exceptions and uncertainty.

## Explain a rejection

1. Locate the posting inside `jobs:pipelineBoard` for the explicit owner tenant.
2. Read the exact row with `npx convex run jobs:getJob '{"jobId":"..."}'`.
3. Report `hardFilterResult.reason`, score, caveats, and `fitEvidence` exactly as stored.
4. Include `canonicalUrl` or `applyUrl` as the source URL.
5. If the evidence is absent, say it is absent. Do not infer a reason.

## Run a scan

```sh
node scripts/agency-enqueue.mjs --board "<company, board key, or free text>" --user "$USER_ID"
```

Report the returned task id and queued status. This creates a deterministic pipeline task. It does not send anything.

## Verify a task

```sh
npx convex run tasks:getTask '{"taskId":"..."}'
npx convex run public:ledger '{"limit":100}'
npx convex run runs:traceTree '{"runId":"..."}'
```

A task is delivered only when `tasks:getTask` returns `status: "delivered"`. Get that task's run id from the tenant-safe public ledger before requesting its trace. Preserve any failed or escalated state and its context in the answer.
