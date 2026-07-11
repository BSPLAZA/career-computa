import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const fixturePath = new URL("./fit-eval-cases.json", import.meta.url);
const runnerPath = new URL("./fit-eval.mjs", import.meta.url);

test("fit-eval-v1 contains 12 live jobs and 5 message cases", () => {
  const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));
  assert.equal(fixtures.name, "fit-eval-v1");
  assert.equal(fixtures.profile.hardFilters.length, 2);
  assert.equal(fixtures.jobCases.length, 12);
  assert.equal(fixtures.messageCases.length, 5);
  for (const item of fixtures.jobCases) {
    assert.match(item.sourceUrl, /^https:\/\//);
    assert.equal(typeof item.expected.rejected, "boolean");
    assert.ok(item.expected.reason);
  }
});

test("runner prints all cases and a summary", () => {
  const result = spawnSync(process.execPath, [runnerPath.pathname], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /fit-eval-v1/);
  assert.match(result.stdout, /12 job cases/);
  assert.match(result.stdout, /5 message cases/);
});
