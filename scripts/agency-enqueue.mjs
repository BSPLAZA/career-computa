#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OWNER_USER_ID = "kn7baxvjdz6c1bz2wkwwtkjj618ab12r";
const KNOWN_BOARDS = {
  openai: "Scan the OpenAI careers board for new roles.",
  anthropic: "Scan the Anthropic careers board for new roles.",
  perplexity: "Scan the Perplexity careers board for new roles.",
};

export function parseArgs(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index === -1 ? null : argv[index + 1] || null;
  };
  const board = valueAfter("--board");
  if (!board) throw new Error("Usage: agency-enqueue.mjs --board <key-or-free-text> [--user <id>]");
  return { board, userId: valueAfter("--user") || process.env.AGENCY_USER_ID || OWNER_USER_ID };
}

export function resolveBoardInput(board) {
  const value = board.trim();
  if (!value) throw new Error("--board cannot be empty");
  return KNOWN_BOARDS[value.toLowerCase()] || `Scan ${value} for new roles.`;
}

function convexClient() {
  const url = readFileSync(resolve(ROOT, ".convex-url"), "utf8").trim();
  if (!url) throw new Error(".convex-url is empty");
  return new ConvexHttpClient(url);
}

async function resolveOwnerUserId(api, explicitUserId) {
  const user = await api.query("users:getUser", { userId: explicitUserId });
  if (!user) throw new Error(`Unknown user: ${explicitUserId}`);
  return explicitUserId;
}

export async function enqueue({ board, userId }) {
  const api = convexClient();
  const ownerUserId = await resolveOwnerUserId(api, userId);
  const input = resolveBoardInput(board);
  const result = await api.mutation("tasks:createTask", { userId: ownerUserId, kind: "intake", input });
  return { taskId: result.taskId, userId: ownerUserId, input, status: "queued" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`agency-enqueue: ${error.message}`);
    process.exit(2);
  }
  enqueue(args).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(`agency-enqueue: ${error.message}`);
    process.exitCode = 1;
  });
}
