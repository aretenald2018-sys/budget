import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apiBase = normalizeApiBase(process.argv[2] || process.env.BUDGET_API_BASE || '');
const origin = process.env.BUDGET_VERIFY_ORIGIN || 'https://aretenald2018-sys.github.io';

if (!apiBase) throw new Error('API base URL required. Example: node scripts/verify-deployed-recipe-api.mjs https://budget-api-liart.vercel.app');

loadEnv(path.join(root, '.env.local'));

const uid = process.env.USER_UID;
const serviceAccount = loadServiceAccount();
if (!uid || !serviceAccount?.project_id) {
  throw new Error('USER_UID 또는 FIREBASE_SERVICE_ACCOUNT/secrets/firebase-admin.json 이 없습니다.');
}

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const snap = await db.collection('users').doc(uid).collection('cart_items').limit(Number(process.env.BUDGET_RECIPE_VERIFY_MAX || 200)).get();
const items = snap.docs.map(doc => doc.data());
const limit = Number(process.env.BUDGET_DEPLOY_VERIFY_LIMIT || 12);
const targets = items
  .filter(item => /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i.test(String(item.url || '')))
  .slice(0, limit)
  .map(item => [platformFromUrl(item.url), item]);

const rows = [];
for (const [platform, item] of targets) {
  const endpoint = `${apiBase}/api/preview?kind=recipe&url=${encodeURIComponent(item.url)}`;
  const response = await fetch(endpoint, { headers: { Origin: origin } });
  const text = await response.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.slice(0, 160) };
  }
  rows.push({
    platform,
    status: response.status,
    cors: response.headers.get('access-control-allow-origin') || '',
    ok: !!data.ok,
    hasTitle: !!data.title,
    ingredients: Array.isArray(data.ingredients) ? data.ingredients.length : null,
    steps: Array.isArray(data.steps) ? data.steps.length : null,
    provider: data.provider || '',
    warning: clip(data.warning || data.error || '', 140),
  });
}

console.log(JSON.stringify({
  apiBase,
  origin,
  checked: rows.length,
  rows,
}, null, 2));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return JSON.parse(raw);
  const file = path.join(root, 'secrets', 'firebase-admin.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeApiBase(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : '';
  } catch {
    return '';
  }
}

function platformFromUrl(value) {
  const url = String(value || '').toLowerCase();
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('tiktok.com')) return 'tiktok';
  return 'other';
}

function clip(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
