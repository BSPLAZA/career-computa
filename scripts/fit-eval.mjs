import { readFile, writeFile } from "node:fs/promises";

const fixtureUrl = new URL("./fit-eval-cases.json", import.meta.url);
const intakeUrl = new URL("../agents/intake.js", import.meta.url);
const resultsUrl = new URL("./eval-results-v1.json", import.meta.url);

function boolVerdict(result) {
  if (typeof result === "boolean") return result;
  return Boolean(
    result?.rejected ??
      result?.hardFilterResult?.rejected ??
      result?.hardFilter?.rejected,
  );
}

const fixtures = JSON.parse(await readFile(fixtureUrl, "utf8"));
const { applyHardFilters } = await import(`${intakeUrl.href}?v=${Date.now()}`);

if (typeof applyHardFilters !== "function") {
  throw new TypeError("agents/intake.js must export applyHardFilters(job, hardFilters)");
}

console.log(`${fixtures.name} | real scorer`);
console.log("Scorer: agents/intake.js#applyHardFilters(job, hardFilters)");

const cases = fixtures.jobCases.map((item) => {
  const compRange = item.baseSalary
    ? `${item.baseSalary.min}-${item.baseSalary.max} ${item.baseSalary.currency}`
    : undefined;
  try {
    const verdict = applyHardFilters({ ...item, compRange }, fixtures.profile.hardFilters);
    const actualRejected = boolVerdict(verdict);
    const passed = actualRejected === item.expected.rejected;
    return {
      id: item.id,
      company: item.company,
      sourceUrl: item.sourceUrl,
      expected: item.expected.rejected ? "reject" : "pass",
      actual: actualRejected ? "reject" : "pass",
      result: passed ? "PASS" : "FAIL",
      expectedReason: item.expected.reason,
      scorerReason: verdict.reason ?? null,
    };
  } catch (error) {
    return {
      id: item.id,
      company: item.company,
      sourceUrl: item.sourceUrl,
      expected: item.expected.rejected ? "reject" : "pass",
      actual: "error",
      result: "FAIL",
      expectedReason: item.expected.reason,
      scorerReason: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

console.table(cases.map(({ id, company, expected, actual, result, scorerReason }) => ({
  id,
  company,
  expected,
  actual,
  result,
  reason: scorerReason ?? "not rejected",
})));

const passed = cases.filter((item) => item.result === "PASS").length;
const total = cases.length;
const failed = total - passed;
const percent = total === 0 ? 0 : Number(((passed / total) * 100).toFixed(1));
const output = {
  timestamp: new Date().toISOString(),
  fixture: fixtures.name,
  fixtureFetchedAt: fixtures.fetchedAt,
  scorer: "agents/intake.js#applyHardFilters(job, hardFilters)",
  hardFilters: fixtures.profile.hardFilters,
  summary: { passed, failed, total, percent },
  cases,
};

await writeFile(resultsUrl, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Score: ${passed}/${total} (${percent.toFixed(1)}%)`);
console.log(`Results: ${resultsUrl.pathname}`);

if (failed > 0 || total !== 12) process.exitCode = 1;
