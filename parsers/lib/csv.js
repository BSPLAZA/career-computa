// Minimal robust CSV parser: RFC4180 quoting, quoted commas and newlines, BOM strip, CRLF.
// No dependencies. Returns array of row arrays; header handling is the caller's job.

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // swallow; \n handles the row break
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Parse with a header row. skipUntil: predicate on a raw row that marks the header
// (used to skip preambles like the Connections.csv Notes block).
function parseCsvWithHeader(text, skipUntil) {
  const rows = parseCsv(text);
  let headerIdx = 0;
  if (skipUntil) {
    headerIdx = rows.findIndex(skipUntil);
    if (headerIdx === -1) return { header: [], records: [] };
  }
  const header = rows[headerIdx].map((h) => h.trim());
  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0].trim() === '') continue; // blank line
    const rec = {};
    for (let j = 0; j < header.length; j++) rec[header[j]] = (r[j] ?? '').trim();
    records.push(rec);
  }
  return { header, records };
}

module.exports = { parseCsv, parseCsvWithHeader };
