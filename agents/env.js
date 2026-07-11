// env.js: loads secrets from ~/.hermes/.env and the repo .env into process.env.
// Values are never logged. Existing process.env values win.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

let loaded = false;
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const merged = {
    ...parseEnvFile(join(homedir(), '.hermes', '.env')),
    ...parseEnvFile(join(REPO_ROOT, '.env')),
  };
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

export function requireEnv(name) {
  loadEnv();
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (checked ~/.hermes/.env and repo .env)`);
  return v;
}
