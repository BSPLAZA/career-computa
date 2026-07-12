// gen-boards.mjs: generates web/src/onboard/boards.gen.ts from agents/boards.js,
// the single source of board truth. Run via `npm run gen:boards` at the repo root;
// the web build runs it automatically (prebuild hook), so the two can never drift.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOARDS } from '../agents/boards.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(REPO_ROOT, 'web', 'src', 'onboard', 'boards.gen.ts');

const entries = Object.entries(BOARDS).map(
  ([key, b]) => `  { key: ${JSON.stringify(key)}, name: ${JSON.stringify(b.name)} },`,
);

const out = [
  '// GENERATED FILE, do not edit by hand.',
  '// Source of truth: agents/boards.js. Regenerate: npm run gen:boards (runs on every web build).',
  '// Scan tasks must be board:<key>; these are the boards the intake worker can poll live.',
  'export const LIVE_BOARDS: { key: string; name: string }[] = [',
  ...entries,
  '];',
  '',
].join('\n');

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, out);
console.log(`boards.gen.ts written: ${entries.length} boards from agents/boards.js`);
