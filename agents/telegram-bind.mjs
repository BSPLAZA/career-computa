// Product-bot bind listener. Polls @CareerAgencyBriefs_bot for /start <signupToken>
// deep-link taps and binds that chat to the account via Convex bindTelegram, then
// confirms in the chat. This is the missing half of the "Connect Telegram" flow:
// the web app hands out t.me/<bot>?start=<token>, and this process turns the tap
// the user makes into a real binding. Run it alongside the pipeline worker.
//
// Usage: node agents/telegram-bind.mjs   (reads TELEGRAM_PRODUCT_BOT_TOKEN from .env)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadToken() {
  if (process.env.TELEGRAM_PRODUCT_BOT_TOKEN) return process.env.TELEGRAM_PRODUCT_BOT_TOKEN;
  const env = readFileSync(join(root, '.env'), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('TELEGRAM_PRODUCT_BOT_TOKEN='));
  if (!line) throw new Error('TELEGRAM_PRODUCT_BOT_TOKEN not found in .env');
  return line.slice('TELEGRAM_PRODUCT_BOT_TOKEN='.length).trim();
}

const TOKEN = loadToken();
const API = `https://api.telegram.org/bot${TOKEN}`;

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Bind through the deployed Convex mutation. execFileSync keeps this dependency-free
// and reuses the operator's existing Convex auth.
function bind(signupToken, chatId) {
  try {
    const out = execFileSync(
      'npx',
      ['convex', 'run', 'users:bindTelegram', JSON.stringify({ signupToken, chatId: String(chatId) })],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { ok: !/"ok": *false/.test(out), raw: out };
  } catch (e) {
    return { ok: false, raw: e.message };
  }
}

async function main() {
  const me = await tg('getMe', {});
  if (!me.ok) throw new Error('bad product bot token: ' + JSON.stringify(me));
  console.log(`[telegram-bind] listening as @${me.result.username} (${new Date().toISOString()})`);

  let offset = 0;
  // Drain any backlog first so a tap you already made gets picked up.
  while (true) {
    let updates;
    try {
      updates = await tg('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
    } catch (e) {
      console.error('[telegram-bind] poll error, retrying in 3s:', e.message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!updates.ok) {
      console.error('[telegram-bind] getUpdates not ok:', JSON.stringify(updates));
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const u of updates.result) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (!msg || !msg.text) continue;
      const chatId = msg.chat.id;
      const m = msg.text.match(/^\/start(?:\s+(\S+))?/);
      if (!m) continue;
      const token = m[1];
      if (!token) {
        await tg('sendMessage', { chat_id: chatId, text: 'Welcome to Career Computa. Open the Connect Telegram link from your dashboard to link this chat to your account.' });
        continue;
      }
      const r = bind(token, chatId);
      if (r.ok) {
        console.log(`[telegram-bind] bound chat ${chatId} to token ${token.slice(0, 6)}...`);
        await tg('sendMessage', { chat_id: chatId, text: 'You are connected. Career Computa will deliver your finished application packages here.' });
      } else {
        console.error(`[telegram-bind] bind failed for ${token.slice(0, 6)}...:`, r.raw.slice(0, 200));
        await tg('sendMessage', { chat_id: chatId, text: 'That link looks expired or invalid. Grab a fresh Connect Telegram link from your dashboard and tap it again.' });
      }
    }
  }
}

main().catch((e) => {
  console.error('[telegram-bind] fatal:', e);
  process.exit(1);
});
