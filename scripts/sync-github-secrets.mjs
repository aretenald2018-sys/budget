#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPO = 'aretenald2018-sys/budget';
const ENV_PATH = path.resolve('.env.local');
const REQUIRED = [
  'GEMINI_API_KEY',
  'FIREBASE_SERVICE_ACCOUNT',
  'USER_UID',
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'TOMATO_OWNER_ID',
  'TOMATODEV_READER_EMAIL',
  'TOMATODEV_READER_PASSWORD',
];

function main() {
  ensureGhAuth();
  const env = readEnvFile(ENV_PATH);
  const missing = REQUIRED.filter(key => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required values in .env.local: ${missing.join(', ')}`);
  }

  for (const key of REQUIRED) {
    const result = spawnSync('gh', ['secret', 'set', key, '--repo', REPO, '--body', env[key]], {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0) {
      throw new Error(`Failed to set ${key}: ${result.stderr || result.stdout}`);
    }
    console.log(`set ${key}`);
  }
  console.log(`GitHub Actions secrets synced to ${REPO}.`);
}

function ensureGhAuth() {
  const result = spawnSync('gh', ['auth', 'status'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error('GitHub CLI is not logged in. Run: gh auth login');
  }
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('.env.local not found');
  const rows = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const out = {};
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value.replace(/\\n/g, '\n');
  }
  return out;
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
