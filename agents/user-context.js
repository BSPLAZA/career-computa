// user-context.js: loads user + profile + resume text for a task.
// Convex path: users:getUser and userProfiles:getByUserId (both live on the deployment).
// Local path: reads the local store tables; falls back to a minimal anonymous profile so the
// pipeline still runs and the gaps show up honestly in caveats.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './env.js';

export async function loadUserContext(store, userId) {
  let user = null; let profile = null; let resumeText = '';
  try { user = await store.getUser(userId); } catch { /* missing fn on convex side yet */ }
  try {
    if (store.kind === 'convex') profile = await store.query('userProfiles:getByUserId', { userId });
    else profile = store.readAll('userProfiles').find((p) => p.userId === userId) || null;
  } catch { /* missing fn on convex side yet */ }
  try {
    if (store.kind === 'local') {
      const doc = store.readAll('resumeTexts').find((r) => r.userId === userId);
      resumeText = doc?.text || '';
    } else if (store.kind === 'convex') {
      const doc = await store.query('resumeTexts:getByUserId', { userId });
      resumeText = doc?.text || '';
    }
  } catch { /* resume text is optional; fit scorer says so in caveats */ }
  if (!profile) {
    profile = {
      userId, name: '', headline: '', locations: [],
      goals: { targetTitles: [], remote: 'flexible' },
      hardFilters: [], softPrefs: [],
      stylePrefs: { style: 'modern-sans', density: 'lean', summaryLines: 2 }, preferenceRules: [],
    };
  }
  // Local per-user conventions until the schema grows homes for these:
  // resume inventory at parsers/out/inventories/<userId>.json (feeds parsers/render.js),
  // resume text at parsers/out/resume-texts/<userId>.txt (feeds fit scoring evidence).
  const invPath = join(REPO_ROOT, 'parsers', 'out', 'inventories', `${userId}.json`);
  if (!profile.resumeInventoryPath && existsSync(invPath)) profile.resumeInventoryPath = invPath;
  if (!resumeText) {
    const txtPath = join(REPO_ROOT, 'parsers', 'out', 'resume-texts', `${userId}.txt`);
    if (existsSync(txtPath)) resumeText = readFileSync(txtPath, 'utf8');
  }
  return { user: user || { _id: userId }, profile, resumeText };
}
