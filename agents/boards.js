// boards.js: verified public ATS board registry (tokens verified live earlier today).
// A board here is a Company with pollable=true. atsType matches contracts/schema.ts Company.atsType.
export const BOARDS = {
  // greenhouse
  anthropic:  { name: 'Anthropic',  atsType: 'greenhouse', boardToken: 'anthropic' },
  stripe:     { name: 'Stripe',     atsType: 'greenhouse', boardToken: 'stripe' },
  databricks: { name: 'Databricks', atsType: 'greenhouse', boardToken: 'databricks' },
  figma:      { name: 'Figma',      atsType: 'greenhouse', boardToken: 'figma' },
  instacart:  { name: 'Instacart',  atsType: 'greenhouse', boardToken: 'instacart' },
  scaleai:    { name: 'Scale AI',   atsType: 'greenhouse', boardToken: 'scaleai' },
  coinbase:   { name: 'Coinbase',   atsType: 'greenhouse', boardToken: 'coinbase' },
  brex:       { name: 'Brex',       atsType: 'greenhouse', boardToken: 'brex' },
  samsara:    { name: 'Samsara',    atsType: 'greenhouse', boardToken: 'samsara' },
  pinterest:  { name: 'Pinterest',  atsType: 'greenhouse', boardToken: 'pinterest' },
  gusto:      { name: 'Gusto',      atsType: 'greenhouse', boardToken: 'gusto' },
  robinhood:  { name: 'Robinhood',  atsType: 'greenhouse', boardToken: 'robinhood' },
  // ashby (huge payloads, 60s CDN cache; sierra is the demo hot path)
  sierra:     { name: 'Sierra',     atsType: 'ashby', boardToken: 'sierra' },
  openai:     { name: 'OpenAI',     atsType: 'ashby', boardToken: 'openai' },
  clickhouse: { name: 'ClickHouse', atsType: 'ashby', boardToken: 'clickhouse' },
  supabase:   { name: 'Supabase',   atsType: 'ashby', boardToken: 'supabase' },
  linear:     { name: 'Linear',     atsType: 'ashby', boardToken: 'linear' },
  ramp:       { name: 'Ramp',       atsType: 'ashby', boardToken: 'ramp' },
  // lever
  veeva:      { name: 'Veeva',      atsType: 'lever', boardToken: 'veeva' },
  matchgroup: { name: 'Match Group', atsType: 'lever', boardToken: 'matchgroup' },
};

export function getBoard(key) {
  const b = BOARDS[String(key).toLowerCase()];
  if (!b) throw new Error(`Unknown board "${key}". Known: ${Object.keys(BOARDS).join(', ')}`);
  return { key: String(key).toLowerCase(), ...b };
}
