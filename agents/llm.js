// llm.js: OpenRouter chat completions helper with token and cost accounting per call.
import { requireEnv } from './env.js';

export const MODEL_DEFAULT = 'anthropic/claude-sonnet-4.6';
export const MODEL_CHEAP = 'anthropic/claude-haiku-4.5';

const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Returns { text, tokensIn, tokensOut, costUsd, ms, model }.
export async function chat({ system, user, model = MODEL_DEFAULT, maxTokens = 1500, temperature = 0.3, json = false }) {
  const key = requireEnv('OPENROUTER_API_KEY');
  const t0 = Date.now();
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    usage: { include: true },
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user },
    ],
  };
  if (json) body.response_format = { type: 'json_object' };
  const res = await fetch(OR_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'x-title': 'career-agency-intake',
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${raw.slice(0, 300)}`);
  const data = JSON.parse(raw);
  const usage = data.usage || {};
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    tokensIn: usage.prompt_tokens || 0,
    tokensOut: usage.completion_tokens || 0,
    costUsd: typeof usage.cost === 'number' ? usage.cost : 0,
    ms: Date.now() - t0,
    model,
  };
}

// chat + parseJson with one retry on invalid JSON (refusals, prose). Usage sums both attempts.
export async function chatJson(opts) {
  const first = await chat({ ...opts, json: true });
  const usage = { tokensIn: first.tokensIn, tokensOut: first.tokensOut, costUsd: first.costUsd, ms: first.ms };
  try {
    return { value: parseJson(first.text), ...usage };
  } catch {
    const second = await chat({
      ...opts, json: true,
      user: `${opts.user}\n\nYour previous reply was not valid JSON (it began: "${first.text.slice(0, 80)}"). Respond with ONLY the requested JSON object. If information is missing, fill fields with honest placeholders instead of refusing.`,
    });
    usage.tokensIn += second.tokensIn; usage.tokensOut += second.tokensOut; usage.costUsd += second.costUsd; usage.ms += second.ms;
    return { value: parseJson(second.text), ...usage };
  }
}

// Parse a JSON object out of a model reply, tolerating code fences.
export function parseJson(text) {
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}
