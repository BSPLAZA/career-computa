// Seeds the verified pollable ATS boards into the companies table.
// Run: npx tsx scripts/seed-companies.ts (reads .convex-url at the repo root).
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const convexUrl = readFileSync(join(root, ".convex-url"), "utf8").trim();
const client = new ConvexHttpClient(convexUrl);

type Seed = { name: string; atsType: "greenhouse" | "lever" | "ashby"; boardToken: string };

const seeds: Seed[] = [
  { name: "Anthropic", atsType: "greenhouse", boardToken: "anthropic" },
  { name: "Stripe", atsType: "greenhouse", boardToken: "stripe" },
  { name: "Databricks", atsType: "greenhouse", boardToken: "databricks" },
  { name: "Figma", atsType: "greenhouse", boardToken: "figma" },
  { name: "Instacart", atsType: "greenhouse", boardToken: "instacart" },
  { name: "Scale AI", atsType: "greenhouse", boardToken: "scaleai" },
  { name: "Coinbase", atsType: "greenhouse", boardToken: "coinbase" },
  { name: "Brex", atsType: "greenhouse", boardToken: "brex" },
  { name: "Samsara", atsType: "greenhouse", boardToken: "samsara" },
  { name: "Pinterest", atsType: "greenhouse", boardToken: "pinterest" },
  { name: "Gusto", atsType: "greenhouse", boardToken: "gusto" },
  { name: "Robinhood", atsType: "greenhouse", boardToken: "robinhood" },
  { name: "Sierra", atsType: "ashby", boardToken: "sierra" },
  { name: "OpenAI", atsType: "ashby", boardToken: "openai" },
  { name: "ClickHouse", atsType: "ashby", boardToken: "clickhouse" },
  { name: "Supabase", atsType: "ashby", boardToken: "supabase" },
  { name: "Linear", atsType: "ashby", boardToken: "linear" },
  { name: "Ramp", atsType: "ashby", boardToken: "ramp" },
  { name: "Veeva", atsType: "lever", boardToken: "veeva" },
  { name: "Match Group", atsType: "lever", boardToken: "matchgroup" },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const seed of seeds) {
    const result = await client.mutation(api.companies.upsertCompany, {
      ...seed,
      pollable: true,
    });
    if (result.created) created++;
    else updated++;
    console.log(`${result.created ? "created" : "updated"} ${seed.name} (${seed.atsType}:${seed.boardToken})`);
  }
  const all = await client.query(api.companies.listCompanies, { pollableOnly: true });
  console.log(`\nseeded ${created} created, ${updated} updated; ${all.length} pollable companies in table`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
