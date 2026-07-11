#!/usr/bin/env node
// Usage: node qr.mjs <url>
// Writes qr.svg and poster.html (printable, QR embedded inline) next to this script.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node qr.mjs <url>");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));

const svg = await QRCode.toString(url, {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 2,
  width: 640,
});
writeFileSync(join(here, "qr.svg"), svg);

const poster = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Career Computa</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: letter portrait; margin: 0; }
  html, body { height: 100%; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    background: #101418; color: #f4f1ea;
    display: flex; align-items: center; justify-content: center;
    text-align: center;
  }
  .poster { max-width: 42rem; padding: 3rem 2rem; }
  h1 { font-size: 4rem; letter-spacing: 0.02em; margin-bottom: 0.75rem; }
  .pitch { font-size: 1.5rem; color: #c9c2b4; margin-bottom: 2.5rem; }
  .qr {
    background: #fff; border-radius: 1rem; padding: 1.25rem;
    display: inline-block; margin-bottom: 2.5rem;
  }
  .qr svg { display: block; width: min(70vw, 26rem); height: auto; }
  .tag { font-size: 2rem; font-style: italic; }
  .url { margin-top: 1.5rem; font-family: ui-monospace, Menlo, monospace; font-size: 1rem; color: #8f8878; word-break: break-all; }
  @media print {
    body { background: #fff; color: #111; }
    .pitch { color: #333; }
    .url { color: #555; }
  }
</style>
</head>
<body>
  <div class="poster">
    <h1>Career Computa</h1>
    <p class="pitch">A career agency run by agents. Real job boards in, apply-ready packages out, delivered to your Telegram.</p>
    <div class="qr">${svg}</div>
    <p class="tag">Hand it your career, watch it work.</p>
    <p class="url">${url}</p>
  </div>
</body>
</html>
`;
writeFileSync(join(here, "poster.html"), poster);

console.log("Wrote qr.svg and poster.html for " + url);
