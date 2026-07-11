import { access, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const fixtureUrl = new URL("./fit-eval-cases.json", import.meta.url);
const intakeUrl = new URL("../agents/intake.js", import.meta.url);

function boolVerdict(result) {
  if (typeof result === "boolean") return result;
  return Boolean(
    result?.rejected ??
      result?.hardFilterResult?.rejected ??
      result?.hardFilter?.rejected,
  );
}

function classVerdict(result) {
  if (typeof result === "string") return result;
  return result?.classification ?? result?.category ?? result?.kind ?? result?.label;
}

function exportedFunctions(module) {
  const values = { ...module };
  if (module.default && typeof module.default === "object") {
    Object.assign(values, module.default);
  } else if (typeof module.default === "function") {
    values.default = module.default;
  }
  return Object.entries(values).filter(([, value]) => typeof value === "function");
}

async function loadScorers() {
  try {
    await access(intakeUrl);
  } catch {
    return null;
  }
  const module = await import(`${pathToFileURL(intakeUrl.pathname).href}?v=${Date.now()}`);
  const functions = exportedFunctions(module);
  const job = functions.find(([name]) => /hard|fit|score|job/i.test(name));
  const message = functions.find(([name]) => /class|message|intake/i.test(name));
  return { job, message, available: functions.map(([name]) => name) };
}

function printFixtureTable(fixtures) {
  console.log(`${fixtures.name} | fixture-only mode`);
  console.table(
    fixtures.jobCases.map((item) => ({
      id: item.id,
      company: item.company,
      location: item.location,
      expected: item.expected.rejected ? "reject" : "pass",
    })),
  );
  console.table(
    fixtures.messageCases.map((item) => ({
      id: item.id,
      expected: item.expected,
    })),
  );
  console.log(`${fixtures.jobCases.length} job cases | ${fixtures.messageCases.length} message cases`);
}

async function runScored(fixtures, scorers) {
  console.log(`${fixtures.name} | agents/intake.js mode`);
  console.log(`Exports: ${scorers.available.join(", ") || "none"}`);
  let correct = 0;
  let total = 0;

  if (scorers.job) {
    const [, scoreJob] = scorers.job;
    const rows = [];
    for (const item of fixtures.jobCases) {
      try {
        const result = await scoreJob(item, fixtures.profile);
        const actual = boolVerdict(result);
        const pass = actual === item.expected.rejected;
        correct += Number(pass);
        total += 1;
        rows.push({ id: item.id, expected: item.expected.rejected ? "reject" : "pass", actual: actual ? "reject" : "pass", result: pass ? "PASS" : "FAIL" });
      } catch (error) {
        total += 1;
        rows.push({ id: item.id, expected: item.expected.rejected ? "reject" : "pass", actual: "error", result: error.message });
      }
    }
    console.table(rows);
  }

  if (scorers.message) {
    const [, classifyMessage] = scorers.message;
    const rows = [];
    for (const item of fixtures.messageCases) {
      try {
        const actual = classVerdict(await classifyMessage(item.text));
        const pass = actual === item.expected;
        correct += Number(pass);
        total += 1;
        rows.push({ id: item.id, expected: item.expected, actual, result: pass ? "PASS" : "FAIL" });
      } catch (error) {
        total += 1;
        rows.push({ id: item.id, expected: item.expected, actual: "error", result: error.message });
      }
    }
    console.table(rows);
  }

  if (total === 0) {
    console.log("No compatible scorer exports found. Printing fixtures instead.");
    printFixtureTable(fixtures);
    return;
  }
  const percent = ((correct / total) * 100).toFixed(1);
  console.log(`Score: ${correct}/${total} (${percent}%)`);
}

const fixtures = JSON.parse(await readFile(fixtureUrl, "utf8"));
const scorers = await loadScorers();
if (!scorers) printFixtureTable(fixtures);
else await runScored(fixtures, scorers);
