#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const parseEnv = (source) => Object.fromEntries(
  source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match) return [];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[match[1], value]];
  }),
);

const taskText = (raw) => {
  const task = JSON.parse(raw);
  for (const field of ['company', 'role', 'fit']) {
    if (task[field] === undefined || task[field] === '') throw new Error(`--task requires ${field}`);
  }
  const number = task.task ?? task.taskId ?? task.id;
  return `Task${number === undefined ? '' : ` ${number}`} complete: ${task.role} at ${task.company}, fit ${task.fit}, package ready`;
};

const textArg = valueAfter('--text');
const taskArg = valueAfter('--task');
if ((textArg ? 1 : 0) + (taskArg ? 1 : 0) !== 1) {
  throw new Error("Provide exactly one of --text 'message' or --task '{json}'");
}
const text = textArg || taskText(taskArg);

const envPath = join(homedir(), '.hermes', '.env');
const env = parseEnv(await readFile(envPath, 'utf8'));
const apiKey = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error(`ELEVENLABS_API_KEY not found in ${envPath}`);

const headers = { 'xi-api-key': apiKey };
const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', { headers });
if (!voicesResponse.ok) throw new Error(`ElevenLabs voices failed: ${voicesResponse.status}`);
const { voices } = await voicesResponse.json();
if (!voices?.length) throw new Error('ElevenLabs returned no voices');

const speechResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voices[0].voice_id}`, {
  method: 'POST',
  headers: { ...headers, 'content-type': 'application/json', accept: 'audio/mpeg' },
  body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
});
if (!speechResponse.ok) {
  const detail = await speechResponse.text();
  throw new Error(`ElevenLabs speech failed: ${speechResponse.status} ${detail}`);
}

const outputDir = join(process.cwd(), 'artifacts', 'announcements');
await mkdir(outputDir, { recursive: true });
const outputPath = join(outputDir, `announcement-${Date.now()}.mp3`);
await writeFile(outputPath, Buffer.from(await speechResponse.arrayBuffer()));

if (!args.includes('--silent')) {
  const playback = spawnSync('afplay', [outputPath], { stdio: 'inherit' });
  if (playback.error) throw playback.error;
  if (playback.status !== 0) throw new Error(`afplay exited with status ${playback.status}`);
}
console.log(outputPath);
