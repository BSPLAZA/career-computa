// telegram.js: delivery of the brief to the submitter's OWN bound chat via the product bot.
// This is the single allowed autonomous outbound (see AGENTS.md tap boundary).
import { requireEnv } from './env.js';

// Sends plain text (chunked at 4096, Telegram's hard message cap). Returns { ok, messageIds }.
export async function sendBrief(chatId, text) {
  const token = requireEnv('TELEGRAM_PRODUCT_BOT_TOKEN');
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const chunks = [];
  let s = String(text);
  while (s.length > 0) { chunks.push(s.slice(0, 4000)); s = s.slice(4000); }
  const messageIds = [];
  for (const chunk of chunks) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, disable_web_page_preview: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`telegram sendMessage failed: ${data.description || res.status}`);
    messageIds.push(data.result?.message_id);
  }
  return { ok: true, messageIds };
}
