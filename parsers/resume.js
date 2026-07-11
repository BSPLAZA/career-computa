// Resume engine: the plaza-serif house template plus the six quality gates.
// Spec: idea-lab/resume-engine-plan.md sections 4 and 5. Whitespace is bought by
// SELECTION, never by shrinking type. Renders HTML to PDF via headless Chrome.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ---------- typography constants (the floors live here; gate 3 asserts them) ----------
const STYLE = {
  marginIn: 0.55,          // floor 0.5
  bodyPt: 10,              // floor 10
  lineHeight: 1.22,        // floor 1.15
  namePt: 22,
  contactPt: 9.5,
  headerPt: 11,
  align: 'left',
};
const USABLE_WIDTH_IN = 8.5 - 2 * STYLE.marginIn;   // 7.4
const USABLE_HEIGHT_IN = 11 - 2 * STYLE.marginIn;   // 9.9
const CHARS_PER_LINE = 104;                          // 10pt Times across 7.4in, estimated
const BULLET_CHARS_PER_LINE = 98;                    // bullets are indented

function stripEmDashes(s) {
  return String(s)
    .replace(/\s*, \s*/g, ', ')
    .replace(/\s*–\s*/g, ', ')
    .replace(/,\s*,/g, ',');
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function estLines(text, charsPerLine) {
  return Math.max(1, Math.ceil(String(text).length / charsPerLine));
}

// ---------- JD relevance scoring ----------
const STOP = new Set('a an the and or of to in for with on at by is are as be this that you we our your from will have has'.split(' '));
function tokens(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9+#./ -]/g, ' ').split(/[\s/]+/).filter((t) => t.length > 2 && !STOP.has(t));
}
function scoreAgainstJd(text, jdFreq, jdTotal) {
  const ts = tokens(text);
  if (!ts.length) return 0;
  let score = 0;
  const seen = new Set();
  for (const t of ts) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (jdFreq.has(t)) score += 1 + Math.log(1 + jdFreq.get(t));
  }
  return score / Math.sqrt(ts.length);
}
function buildJdFreq(jdText) {
  const freq = new Map();
  for (const t of tokens(jdText)) freq.set(t, (freq.get(t) || 0) + 1);
  return freq;
}

// ---------- selection ----------
// Picks 10 to 12 bullets across roles by JD relevance. Preserves themed
// sub-headers and role order. Returns { selected, cut } with score annotations.
function selectBullets(experience, jdText, budget) {
  const jdFreq = buildJdFreq(jdText);
  const all = [];
  experience.forEach((role, ri) => {
    (role.bullets || []).forEach((b, bi) => {
      all.push({ roleIdx: ri, bulletIdx: bi, theme: b.theme || '', text: b.text, source: b.source || null, score: scoreAgainstJd(b.text, jdFreq) });
    });
  });
  const ranked = [...all].sort((a, b) => b.score - a.score);
  const selectedSet = new Set();
  // Guarantee each role keeps at least 1 bullet so no role renders empty.
  for (let ri = 0; ri < experience.length; ri++) {
    const best = ranked.find((x) => x.roleIdx === ri);
    if (best) selectedSet.add(best);
  }
  for (const cand of ranked) {
    if (selectedSet.size >= budget) break;
    selectedSet.add(cand);
  }
  const selected = all.filter((x) => selectedSet.has(x));
  const cut = all.filter((x) => !selectedSet.has(x)).map((x) => ({ text: x.text, theme: x.theme, score: Number(x.score.toFixed(3)), reason: 'below relevance cutoff for this JD' }));
  return { selected, cut };
}

function selectSummary(summary, jdText, maxLines) {
  const jdFreq = buildJdFreq(jdText);
  const sentences = String(summary).split(/(?<=[.!?])\s+/).filter(Boolean);
  const scored = sentences.map((s, i) => ({ s, i, score: scoreAgainstJd(s, jdFreq) }));
  const budget = maxLines * CHARS_PER_LINE;
  const picked = [];
  let used = 0;
  for (const cand of [...scored].sort((a, b) => b.score - a.score)) {
    if (used + cand.s.length + 1 > budget) continue;
    picked.push(cand);
    used += cand.s.length + 1;
  }
  picked.sort((a, b) => a.i - b.i);
  return picked.map((p) => p.s).join(' ');
}

function capSkillLine(label, items) {
  const budget = 2 * CHARS_PER_LINE - label.length - 2;
  const kept = [];
  let used = 0;
  for (const it of items) {
    if (used + it.length + 2 > budget) break;
    kept.push(it);
    used += it.length + 2;
  }
  return kept;
}

// ---------- HTML template (plaza-serif, fresh CSS from the section 4 spec) ----------
function buildHtml(model) {
  const { name, contact, summary, skills, roles, projects, education, variantId } = model;
  const css = `
  @page { size: letter; margin: ${STYLE.marginIn}in; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: ${STYLE.bodyPt}pt; line-height: ${STYLE.lineHeight}; color: #111; text-align: ${STYLE.align}; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6pt; }
  .name { font-size: ${STYLE.namePt}pt; letter-spacing: 3pt; text-transform: uppercase; font-weight: bold; }
  .contact { text-align: right; font-size: ${STYLE.contactPt}pt; line-height: 1.35; }
  .contact a { color: #111; text-decoration: none; }
  h2 { font-size: ${STYLE.headerPt}pt; font-variant: small-caps; letter-spacing: 2pt; font-weight: bold; border-bottom: 0.5pt solid #999; padding-bottom: 1.5pt; margin: 9pt 0 4pt 0; }
  .summary { margin-bottom: 2pt; }
  .skill-line { margin-bottom: 1.5pt; }
  .skill-line b { font-style: italic; }
  .role-head { display: flex; justify-content: space-between; margin-top: 4pt; }
  .role-title { font-weight: bold; font-style: italic; }
  .role-dates { font-size: 9.5pt; }
  .role-sub { display: flex; justify-content: space-between; font-size: 9.5pt; margin-bottom: 1pt; }
  .theme { font-weight: bold; font-size: 9.5pt; letter-spacing: 0.5pt; margin: 2.5pt 0 0.5pt 0; }
  ul { margin: 0 0 0 14pt; }
  li { margin-bottom: 1.5pt; padding-left: 2pt; }
  .proj b { font-style: italic; }
  .edu { display: flex; justify-content: space-between; }
  `;
  const contactBits = [contact.email, contact.linkedin, contact.github, contact.location].filter(Boolean);
  const roleHtml = roles.map((r) => {
    const themes = [];
    for (const b of r.bullets) {
      let grp = themes.find((t) => t.name === (b.theme || ''));
      if (!grp) { grp = { name: b.theme || '', bullets: [] }; themes.push(grp); }
      grp.bullets.push(b);
    }
    return `
    <div class="role-head"><span class="role-title">${esc(r.title)}</span><span class="role-dates">${esc(r.dates || '')}</span></div>
    <div class="role-sub"><span>${esc(r.company)}</span><span>${esc(r.location || '')}</span></div>
    ${themes.map((t) => (t.name ? `<div class="theme">${esc(t.name)}</div>` : '') + `<ul>${t.bullets.map((b) => `<li>${esc(b.text)}</li>`).join('')}</ul>`).join('')}`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(name)} Resume ${esc(variantId || '')}</title><style>${css}</style></head><body>
  <div class="top"><div class="name">${esc(name)}</div><div class="contact">${contactBits.map((c) => esc(c)).join('<br>')}</div></div>
  <div class="summary">${esc(summary)}</div>
  <h2>Skills</h2>
  ${skills.map((s) => `<div class="skill-line"><b>${esc(s.label)}:</b> ${esc(s.items.join(', '))}</div>`).join('')}
  <h2>Professional Experience</h2>
  ${roleHtml}
  ${projects.length ? `<h2>Projects</h2><ul>${projects.map((p) => `<li class="proj"><b>${esc(p.name)}:</b> ${esc(p.text)}</li>`).join('')}</ul>` : ''}
  <h2>Education</h2>
  ${education.map((e) => `<div class="edu"><span><b>${esc(e.school)}</b>${e.degree ? ', ' + esc(e.degree) : ''}</span><span>${esc(e.location || '')}</span></div>`).join('')}
  </body></html>`;
}

// ---------- headless render ----------
function findChrome() {
  // Prefer the Playwright headless shell (exits cleanly); fall back to system Chrome.
  const pwCache = path.join(process.env.HOME || '', 'Library/Caches/ms-playwright');
  try {
    const shells = fs.readdirSync(pwCache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
    for (const d of shells) {
      const bin = path.join(pwCache, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
      if (fs.existsSync(bin)) return bin;
    }
  } catch { /* fall through */ }
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
function htmlToPdf(htmlPath, pdfPath) {
  const chrome = findChrome();
  if (!chrome) throw new Error('No headless Chrome found; run npx playwright install chromium or install Chrome');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-pdf-'));
  try {
    execFileSync(chrome, [
      '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + profile,
      '--no-pdf-header-footer',
      '--print-to-pdf=' + pdfPath,
      'file://' + htmlPath,
    ], { stdio: 'pipe', timeout: 60000 });
  } catch (err) {
    // System Chrome sometimes writes the PDF then hangs on exit; accept the
    // artifact if it landed, otherwise rethrow.
    if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size < 1000) throw err;
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
function pdfPageCount(pdfPath) {
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' });
  const m = info.match(/^Pages:\s+(\d+)/m);
  return m ? parseInt(m[1], 10) : -1;
}
function pdfExtractText(pdfPath) {
  return execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
}

// ---------- gates ----------
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function gateTruthfulness(model) {
  const missing = [];
  const unsupportedNumbers = [];
  for (const r of model.roles) {
    for (const b of r.bullets) {
      if (!b.source || !b.source.doc || !b.source.excerpt) { missing.push(b.text.slice(0, 60)); continue; }
      const srcDigits = (b.source.excerpt.match(/\d[\d,.%$kKmMbB+]*/g) || []).map(norm);
      for (const num of b.text.match(/\d[\d,.%$kKmMbB+]*/g) || []) {
        if (!srcDigits.some((d) => d.includes(norm(num)) || norm(num).includes(d))) unsupportedNumbers.push(num + ' in: ' + b.text.slice(0, 50));
      }
    }
  }
  const pass = missing.length === 0 && unsupportedNumbers.length === 0;
  return { gate: 'truthfulness', pass, note: pass ? 'every bullet has a source pointer and every number appears in its source excerpt' : ('missing source: ' + missing.length + '; unsupported numbers: ' + unsupportedNumbers.slice(0, 3).join(' | ')) };
}

function estimateUsedHeightIn(model) {
  let lines = 2.2; // name/contact block
  lines += estLines(model.summary, CHARS_PER_LINE);
  lines += 1.6; // skills header
  for (const s of model.skills) lines += estLines(s.label + ': ' + s.items.join(', '), CHARS_PER_LINE);
  lines += 1.6; // experience header
  for (const r of model.roles) {
    lines += 2; // role head + sub
    const themes = new Set(r.bullets.map((b) => b.theme || '').values());
    lines += [...themes].filter(Boolean).length * 0.9;
    for (const b of r.bullets) lines += estLines(b.text, BULLET_CHARS_PER_LINE);
  }
  if (model.projects.length) { lines += 1.6; for (const p of model.projects) lines += estLines(p.name + ': ' + p.text, BULLET_CHARS_PER_LINE); }
  lines += 1.6 + model.education.length;
  const lineHeightIn = (STYLE.bodyPt * STYLE.lineHeight) / 72;
  return lines * lineHeightIn * 1.08; // 8% margin for block spacing
}

// PDF-free page fit check for the hot path: uses the same line estimate the
// selection loop uses. The real pdf gates run when the PDF is rendered on request.
function gatePageFitEstimate(model) {
  const used = estimateUsedHeightIn(model);
  if (used > USABLE_HEIGHT_IN) return { gate: 'page_fit_estimate', pass: false, note: 'estimated content ' + used.toFixed(1) + 'in exceeds usable ' + USABLE_HEIGHT_IN + 'in' };
  const trailingPct = Math.max(0, (USABLE_HEIGHT_IN - used) / USABLE_HEIGHT_IN);
  return { gate: 'page_fit_estimate', pass: true, note: 'estimated 1 page; trailing whitespace ' + Math.round(trailingPct * 100) + '%' };
}

function gatePageFit(pdfPath, model) {
  const pages = pdfPageCount(pdfPath);
  if (pages !== 1) return { gate: 'page_fit', pass: false, note: 'rendered ' + pages + ' pages; re-selection required (never shrink type)' };
  const used = estimateUsedHeightIn(model);
  const trailingPct = Math.max(0, (USABLE_HEIGHT_IN - used) / USABLE_HEIGHT_IN);
  if (trailingPct > 0.2) return { gate: 'page_fit', pass: false, note: 'estimated trailing whitespace ' + Math.round(trailingPct * 100) + '% exceeds 20%; add back a cut bullet' };
  return { gate: 'page_fit', pass: true, note: '1 page; estimated trailing whitespace ' + Math.round(trailingPct * 100) + '%' };
}

function gateTypography() {
  const ok = STYLE.bodyPt >= 10 && STYLE.lineHeight >= 1.15 && STYLE.marginIn >= 0.5 && STYLE.align === 'left';
  return { gate: 'typography_floors', pass: ok, note: 'body ' + STYLE.bodyPt + 'pt, line-height ' + STYLE.lineHeight + ', margins ' + STYLE.marginIn + 'in, left aligned' };
}

const SPELLED_NUMBERS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million)\b/i;
function gateBulletLint(model) {
  const problems = [];
  const allBullets = model.roles.flatMap((r) => r.bullets.map((b) => b.text)).concat(model.projects.map((p) => p.text));
  for (const t of allBullets) {
    if (/, |–/.test(t)) problems.push('em dash: ' + t.slice(0, 50));
    if (!/^[A-Z]/.test(t.trim())) problems.push('not verb-first capitalized: ' + t.slice(0, 50));
    if (estLines(t, BULLET_CHARS_PER_LINE) > 2) problems.push('over 2 lines: ' + t.slice(0, 50));
    if (SPELLED_NUMBERS.test(t)) problems.push('spelled-out number: ' + t.slice(0, 50));
  }
  if (/, |–/.test(model.summary)) problems.push('em dash in summary');
  return { gate: 'bullet_lint', pass: problems.length === 0, note: problems.length ? problems.slice(0, 4).join(' | ') : allBullets.length + ' bullets pass verb-first, digits, 2-line, no-em-dash checks' };
}

function gateAts(pdfPath, model) {
  const extracted = norm(pdfExtractText(pdfPath));
  const misses = [];
  const checks = [model.name, 'Skills', 'Professional Experience', 'Education', ...model.roles.map((r) => r.company)];
  for (const r of model.roles) for (const b of r.bullets) checks.push(b.text.split(/\s+/).slice(0, 5).join(' '));
  for (const c of checks) {
    if (!c) continue;
    if (!extracted.includes(norm(c))) misses.push(String(c).slice(0, 40));
  }
  return { gate: 'ats_extract', pass: misses.length === 0, note: misses.length ? 'not found in re-extracted text: ' + misses.slice(0, 3).join(' | ') : checks.length + ' key strings re-extracted cleanly from the PDF text layer' };
}

function gateRender(pdfPath) {
  const ok = fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 10000 && pdfPageCount(pdfPath) >= 1;
  return { gate: 'render', pass: ok, note: ok ? 'PDF rendered, ' + fs.statSync(pdfPath).size + ' bytes' : 'PDF missing or too small' };
}

// ---------- main entry ----------
// inventory: output of docs.extractResumeInventory (bullets may carry .source; if
// absent, the bullet's own master-resume text becomes its source excerpt).
// Returns { pdfPath, htmlPath, gateResults, cutList, model, variantId }.
async function renderResumeVariant({ inventory, jdText, outDir, variantId, options = {} }) {
  const density = options.density || 'lean';
  const summaryLines = options.summaryLines || 3;
  let budget = density === 'full' ? 12 : 10;
  fs.mkdirSync(outDir, { recursive: true });

  // Attach default source pointers: the master resume is the source of record.
  const experience = (inventory.experience || []).map((r) => ({
    ...r,
    bullets: (r.bullets || []).map((b) => ({
      ...b,
      text: stripEmDashes(b.text),
      source: b.source || { doc: inventory.sourceDoc || 'master-resume', excerpt: b.text },
    })),
  }));

  const htmlOnly = options.htmlOnly === true;
  let attempt = 0; let model; let pdfPath; let htmlPath; let selection; let html;
  while (attempt < 5) {
    selection = selectBullets(experience, jdText, budget);
    const byRole = experience.map((r, ri) => ({
      company: r.company, title: r.title, location: r.location, dates: r.dates,
      bullets: selection.selected.filter((s) => s.roleIdx === ri).sort((a, b) => a.bulletIdx - b.bulletIdx)
        .map((s) => ({ text: s.text, theme: s.theme, source: experience[s.roleIdx].bullets[s.bulletIdx].source, score: s.score })),
    })).filter((r) => r.bullets.length > 0);

    model = {
      name: inventory.name,
      contact: inventory.contact || {},
      summary: stripEmDashes(selectSummary(inventory.summary || '', jdText, summaryLines)),
      skills: (inventory.skills || []).slice(0, 3).map((s) => ({ label: s.label, items: capSkillLine(s.label, s.items || []) })),
      roles: byRole,
      projects: (inventory.projects || []).slice(0, 3).map((p) => ({ name: p.name, text: stripEmDashes(p.text) })),
      education: inventory.education || [],
      variantId,
    };

    htmlPath = path.join(outDir, variantId + '.html');
    pdfPath = path.join(outDir, variantId + '.pdf');
    html = buildHtml(model);
    fs.writeFileSync(htmlPath, html);

    if (htmlOnly) {
      // Hot path: no Chrome. Page fit is estimated; the PDF renders async on request.
      if (estimateUsedHeightIn(model) <= USABLE_HEIGHT_IN) break;
      budget = Math.max(6, budget - 1);
      attempt++;
      continue;
    }
    htmlToPdf(htmlPath, pdfPath);

    const pages = pdfPageCount(pdfPath);
    if (pages === 1) break;
    // Page-fit fail: drop the lowest-relevance selected bullet, never shrink type.
    budget = Math.max(6, budget - 1);
    attempt++;
  }

  const gateResults = htmlOnly
    ? [
        gateTruthfulness(model),
        gatePageFitEstimate(model),
        gateTypography(),
        gateBulletLint(model),
      ]
    : [
        gateTruthfulness(model),
        gatePageFit(pdfPath, model),
        gateTypography(),
        gateBulletLint(model),
        gateAts(pdfPath, model),
        gateRender(pdfPath),
      ];
  return { pdfPath: htmlOnly ? null : pdfPath, expectedPdfPath: pdfPath, htmlPath, html, gateResults, cutList: selection.cut, model, variantId };
}

module.exports = { renderResumeVariant, buildHtml, selectBullets, stripEmDashes, STYLE, findChrome, pdfPageCount };
