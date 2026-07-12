import assert from "node:assert/strict";
import test from "node:test";

import { parseArgs as parseEnqueueArgs, resolveBoardInput } from "./agency-enqueue.mjs";
import { formatDigest } from "./agency-status.mjs";

test("enqueue requires a board and accepts an explicit tenant", () => {
  assert.deepEqual(parseEnqueueArgs(["--board", "Acme", "--user", "user123"]), {
    board: "Acme",
    userId: "user123",
  });
  assert.throws(() => parseEnqueueArgs([]), /--board/);
});

test("board input preserves free text and expands known board keys", () => {
  assert.equal(resolveBoardInput("Acme careers"), "Scan Acme careers for new roles.");
  assert.match(resolveBoardInput("openai"), /OpenAI/i);
});

test("digest is compact and keeps evidence and uncertainty visible", () => {
  const text = formatDigest({
    asOf: 1783813640286,
    deliveredToday: 2,
    jobsByState: { assessed: 3, auto_rejected: 1 },
    topJobs: [{ title: "Engineer", companyName: "Acme", fitScore: 91, applyUrl: "https://example.com/job", caveat: "Location unclear", evidence: "Built distributed systems" }],
    exceptions: [{ taskId: "task1", status: "failed", reason: "worker error" }],
    trust: { threshold: 5, kinds: [{ kind: "fit_score", streak: 2, remaining: 3, graduated: false }] },
  });
  assert.match(text, /Delivered today: 2/);
  assert.match(text, /91.*Location unclear.*https:\/\/example.com\/job/);
  assert.match(text, /evidence: Built distributed systems/);
  assert.match(text, /failed.*worker error/);
  assert.match(text, /fit_score: 2\/5/);
  assert.ok(text.length < 1800);
  assert.ok(!text.includes("—"));
});
