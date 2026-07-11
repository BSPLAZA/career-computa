// user-context.js: loads user + profile + resume text for a task.
// Convex path: users:getById and userProfiles:getByUserId (STUB CONTRACT, confirm with convex lane).
// Local path: reads the local store tables; falls back to a minimal anonymous profile so the
// pipeline still runs and the gaps show up honestly in caveats.
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
  return { user: user || { _id: userId }, profile, resumeText };
}
