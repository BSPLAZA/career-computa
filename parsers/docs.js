// Document parsers: resume PDF/DOCX text extraction and performance-review TXT
// to STAR stories via OpenRouter. Every story keeps sourceDoc + excerpt, which
// is the truthfulness anchor for the resume gates.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function hasBin(bin) {
  try { execFileSync('which', [bin], { stdio: 'pipe' }); return true; } catch { return false; }
}

// ---------- text extraction ----------

function extractPdfText(pdfPath) {
  if (hasBin('pdftotext')) {
    return execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  }
  throw new Error('pdftotext not available; install poppler or add a JS fallback');
}

// DOCX is a zip; the document body lives in word/document.xml.
function extractDocxText(docxPath) {
  const xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return xml
    .replace(/<w:p[ >]/g, '\n<w:p ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#8217;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractDocText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractPdfText(filePath);
  if (ext === '.docx') return extractDocxText(filePath);
  if (ext === '.txt' || ext === '.md') return fs.readFileSync(filePath, 'utf8');
  throw new Error('Unsupported doc type: ' + ext);
}

// ---------- OpenRouter ----------

function loadOpenRouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const envPath = path.join(process.env.HOME || '', '.hermes', '.env');
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, 'utf8').match(/^OPENROUTER_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('OPENROUTER_API_KEY not found in env or ~/.hermes/.env');
}

async function openRouterChat(messages, { model = 'anthropic/claude-sonnet-4.6', maxTokens = 4000 } = {}) {
  const key = loadOpenRouterKey();
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });
  if (!res.ok) throw new Error('OpenRouter ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  const usage = data.usage || {};
  return { text: data.choices?.[0]?.message?.content || '', tokensIn: usage.prompt_tokens || 0, tokensOut: usage.completion_tokens || 0 };
}

// ---------- STAR story extraction ----------

const STAR_PROMPT = `You extract STAR stories (Situation, Task, Action, Result) from a performance review document.

Rules:
- Only use facts stated in the document. Never invent metrics, titles, dates, or outcomes.
- For each story include a short verbatim excerpt from the document that supports it (the source anchor).
- 2 to 6 stories per document. Skip anything without a concrete action or result.
- No em dashes anywhere in your output. Use commas or colons instead.

Return ONLY a JSON array, no prose, each item:
{"title": "...", "text": "one paragraph STAR narrative", "competencies": ["..."], "excerpt": "verbatim quote from the document"}`;

async function extractStarStories(txtPath, opts = {}) {
  const raw = fs.readFileSync(txtPath, 'utf8');
  const doc = raw.length > 24000 ? raw.slice(0, 24000) : raw;
  const { text } = await openRouterChat(
    [
      { role: 'system', content: STAR_PROMPT },
      { role: 'user', content: 'Document name: ' + path.basename(txtPath) + '\n\n' + doc },
    ],
    { model: opts.model || 'anthropic/claude-sonnet-4.6' }
  );
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No JSON array in model output for ' + path.basename(txtPath));
  const stories = JSON.parse(jsonMatch[0]);
  return stories
    .filter((s) => s && s.title && s.text && s.excerpt)
    .map((s) => ({
      title: String(s.title).replace(/—|–/g, ','),
      text: String(s.text).replace(/—|–/g, ','),
      competencies: Array.isArray(s.competencies) ? s.competencies.map(String) : [],
      sourceDoc: path.basename(txtPath),
      excerpt: String(s.excerpt).slice(0, 600),
    }));
}

// ---------- resume content inventory ----------

const INVENTORY_PROMPT = `You convert a resume's raw extracted text into a structured content inventory.

Rules:
- Copy content faithfully. Never invent, merge, or embellish. Fix only obvious PDF extraction line-break artifacts (a word broken across lines).
- Keep every bullet as written, one entry per bullet.
- Preserve themed sub-headers inside a role (like "Internal Tooling & Automation") as the bullet's theme.
- No em dashes anywhere in output text; replace with commas or colons.

Return ONLY JSON, no prose:
{
 "name": "...", "contact": {"email": "...", "linkedin": "...", "github": "...", "location": ""},
 "summary": "...",
 "skills": [{"label": "...", "items": ["..."]}],
 "experience": [{"company": "...", "title": "...", "location": "...", "dates": "...",
   "bullets": [{"theme": "" , "text": "..."}]}],
 "projects": [{"name": "...", "text": "..."}],
 "education": [{"school": "...", "degree": "...", "location": ""}]
}`;

async function extractResumeInventory(resumePath, opts = {}) {
  const raw = extractDocText(resumePath);
  const { text } = await openRouterChat(
    [
      { role: 'system', content: INVENTORY_PROMPT },
      { role: 'user', content: raw.slice(0, 24000) },
    ],
    { model: opts.model || 'anthropic/claude-sonnet-4.6', maxTokens: 8000 }
  );
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON object in model output for ' + path.basename(resumePath));
  const inv = JSON.parse(jsonMatch[0]);
  inv.sourceDoc = path.basename(resumePath);
  inv.rawText = raw;
  return inv;
}

module.exports = { extractPdfText, extractDocxText, extractDocText, extractStarStories, extractResumeInventory, openRouterChat };
