// render.js: bridge from the pipeline lane (agents/intake.js) to the resume engine.
// Exports renderResume({ profile, resumeText, job }) -> { path, content, variantId, gateResults }.
//
// The engine needs a structured content inventory. It is looked up from, in order:
//   1. profile.resumeInventory (object)
//   2. profile.resumeInventoryPath (JSON file path, absolute or repo-relative)
// If neither exists the adapter returns an honest placeholder instead of failing the run;
// worker-claimed users without an inventory get a visible gap, never an invented resume.
//
// Over-length bullets (would render past 2 lines) are condensed via OpenRouter before
// selection when a key is available. Condensed text must keep every digit inside the
// original source excerpt (the truthfulness gate re-checks this) or the original stays.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const { renderResumeVariant, stripEmDashes, findChrome } = require('./resume.js');
const { openRouterChat } = require('./docs.js');

const REPO = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO, 'artifacts', 'variants');
const BULLET_CHAR_LIMIT = 190; // 2 lines at ~98 chars/line with margin

function slug(s, n = 40) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, n);
}

function loadInventory(profile = {}) {
  if (profile.resumeInventory && typeof profile.resumeInventory === 'object') return profile.resumeInventory;
  if (profile.resumeInventoryPath) {
    const p = path.isAbsolute(profile.resumeInventoryPath)
      ? profile.resumeInventoryPath
      : path.join(REPO, profile.resumeInventoryPath);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

function digitsOf(s) {
  return (String(s).match(/\d[\d,.%$kKmMbB+]*/g) || []).map((d) => d.replace(/[,\s]/g, '').toLowerCase());
}

// Condense one bullet under the char limit without inventing or dropping-in numbers.
// Two attempts (the second much stricter); a null return keeps the original so the
// bullet_lint gate reports the length problem honestly instead of hiding it.
async function condenseBullet(text) {
  for (const target of [BULLET_CHAR_LIMIT - 10, BULLET_CHAR_LIMIT - 35, BULLET_CHAR_LIMIT - 60]) {
    const { text: raw } = await openRouterChat(
      [
        {
          role: 'user',
          content:
            'Rewrite this resume bullet to AT MOST ' + target + ' characters. That limit is a hard cap: count characters and stay under it. ' +
            'Keep it verb-first, keep the strongest metric, do not add any number or fact that is not in the original, ' +
            (/\d/.test(text) ? '' : 'the original contains no digit characters so your rewrite must not contain digits either (keep spelled-out quantities spelled out), ') +
            'no em dashes. Reply with the rewritten bullet only.\n\nBULLET:\n' + text,
        },
      ],
      { maxTokens: 200 },
    );
    const out = stripEmDashes(raw.trim().replace(/^["'\-\s]+|["']+$/g, ''));
    if (!out || out.length > BULLET_CHAR_LIMIT + 6) continue; // too long, try stricter
    const orig = new Set(digitsOf(text));
    const invented = digitsOf(out).some((d) => ![...orig].some((o) => o.includes(d) || d.includes(o)));
    if (invented) continue; // invented number: never accept
    return out;
  }
  return null;
}

// Condensed inventories cache next to nothing user-visible; keyed by inventory identity.
const condensedCache = new Map();

async function condenseInventory(inventory) {
  const key = inventory.sourceDoc || inventory.name || 'inv';
  if (condensedCache.has(key)) return condensedCache.get(key);
  const cacheFile = path.join(OUT_DIR, '.condensed-' + slug(key, 60) + '.json');
  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    condensedCache.set(key, cached);
    return cached;
  }
  const inv = JSON.parse(JSON.stringify(inventory));
  let condensed = 0;
  for (const role of inv.experience || []) {
    for (const b of role.bullets || []) {
      const original = b.text;
      if (original.length <= BULLET_CHAR_LIMIT) continue;
      try {
        const shorter = await condenseBullet(original);
        if (shorter) {
          // Source excerpt stays the ORIGINAL master-resume line: the pointer never lies.
          b.source = b.source || { doc: inv.sourceDoc || 'master-resume', excerpt: original };
          if (!b.source.excerpt) b.source.excerpt = original;
          b.text = shorter;
          condensed++;
        }
      } catch {
        // No key or API failure: keep the original, bullet_lint reports it honestly.
      }
    }
  }
  for (const p of inv.projects || []) {
    if (!p.text || p.text.length <= BULLET_CHAR_LIMIT) continue;
    try {
      const shorter = await condenseBullet(p.text);
      if (shorter) { p.text = shorter; condensed++; }
    } catch { /* keep original; bullet_lint reports it honestly */ }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(inv, null, 2));
  condensedCache.set(key, inv);
  return inv;
}

async function renderResume({ profile = {}, resumeText = '', job = {} }) {
  const variantId = [slug(job.title || 'role'), Date.now().toString(36)].join('-');
  const rawInventory = loadInventory(profile);
  if (!rawInventory) {
    return {
      content:
        'NO RESUME INVENTORY for this user yet: upload a master resume on the Onboard tab to unlock tailored variants. ' +
        'Target was: ' + (job.title || 'unknown role') + '. No variant was rendered; nothing was invented.',
      variantId: 'novariant-' + variantId,
      gateResults: [{ gate: 'inventory_present', pass: false, note: 'no resume inventory on file for this user' }],
    };
  }
  const inventory = await condenseInventory(rawInventory);
  const jdText = job.descriptionText || job.descriptionHtml || job.title || '';
  // Hot path renders HTML only: Chrome print-to-pdf has timed out before, so the PDF
  // is generated async on request via renderPdf(). Task latency stays LLM-bound.
  const r = await renderResumeVariant({
    inventory,
    jdText,
    outDir: OUT_DIR,
    variantId,
    options: { ...(profile.stylePrefs || {}), htmlOnly: true },
  });
  return {
    content: r.html,
    html: r.html,
    htmlPath: r.htmlPath,
    pdfPath: r.expectedPdfPath,
    variantId: r.variantId,
    gateResults: r.gateResults,
    cutList: r.cutList,
  };
}

// Async, non-blocking PDF render for the on-request path. Never used inside the
// intake hot loop; callers fire it in the background and log the outcome.
function renderPdf({ htmlPath, pdfPath }) {
  return new Promise((resolve, reject) => {
    const chrome = findChrome();
    if (!chrome) return reject(new Error('No headless Chrome found for async PDF render'));
    if (!fs.existsSync(htmlPath)) return reject(new Error('HTML source missing: ' + htmlPath));
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-pdf-async-'));
    execFile(chrome, [
      '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + profileDir,
      '--no-pdf-header-footer',
      '--print-to-pdf=' + pdfPath,
      'file://' + htmlPath,
    ], { timeout: 90000 }, (err) => {
      fs.rmSync(profileDir, { recursive: true, force: true });
      // System Chrome sometimes writes the PDF then hangs on exit; accept a landed artifact.
      if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 1000) return resolve(pdfPath);
      reject(err || new Error('PDF did not land at ' + pdfPath));
    });
  });
}

module.exports = { renderResume, renderPdf };
