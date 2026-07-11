import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const fixturePath = new URL("./fit-eval-cases.json", import.meta.url);
const runnerPath = new URL("./fit-eval.mjs", import.meta.url);
const resultsPath = new URL("./eval-results-v1.json", import.meta.url);

test("fit-eval-v1 contains exactly 12 sourced live job cases", () => {
  const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.equal(fixtures.name, "fit-eval-v1");
  assert.equal(fixtures.jobCases.length, 12);
  assert.equal("messageCases" in fixtures, false);
  assert.deepEqual(fixtures.profile.hardFilters, [
    "location_excludes:dublin",
    "location_excludes:london",
    "location_excludes:berlin",
    "comp_floor:150000",
  ]);
  for (const item of fixtures.jobCases) {
    assert.match(item.sourceUrl, /^https:\/\//);
    assert.equal(typeof item.expected.rejected, "boolean");
    assert.ok(item.expected.reason);
  }
});

test("runner scores all jobs, prints a per-case table, and writes full results", () => {
  const result = spawnSync(process.execPath, [runnerPath.pathname], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /fit-eval-v1/);
  assert.match(result.stdout, /applyHardFilters\(job, hardFilters\)/);
  assert.match(result.stdout, /anthropic-5195866008/);
  assert.match(result.stdout, /PASS/);
  assert.match(result.stdout, /Score: 12\/12 \(100\.0%\)/);

  const saved = JSON.parse(readFileSync(resultsPath, "utf8"));
  assert.match(saved.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(saved.scorer, "agents/intake.js#applyHardFilters(job, hardFilters)");
  assert.deepEqual(saved.summary, { passed: 12, failed: 0, total: 12, percent: 100 });
  assert.equal(saved.cases.length, 12);
  assert.ok(saved.cases.every((item) => item.result === "PASS"));
});
