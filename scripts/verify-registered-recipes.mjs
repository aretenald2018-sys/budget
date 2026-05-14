import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  buildStaticRecipePreview,
  recipePresetPreviewFromText,
} from '../choice/recipe-autofill.js?v=verify-registered-recipes';
import {
  mergeRecipeIngredients,
  normalizedIngredients,
} from '../choice/recipe-runtime.js?v=verify-registered-recipes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

loadEnv(path.join(root, '.env.local'));

const uid = process.env.USER_UID;
const serviceAccount = loadServiceAccount();
if (!uid || !serviceAccount?.project_id) {
  throw new Error('USER_UID 또는 FIREBASE_SERVICE_ACCOUNT/secrets/firebase-admin.json 이 없습니다.');
}

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();
const max = Number(process.env.BUDGET_RECIPE_VERIFY_MAX || 500);
const snap = await db.collection('users').doc(uid).collection('cart_items').limit(max).get();
const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(isVideoRecipeCandidate);

const rows = [];
for (const item of items) {
  const seed = recipeSeedText(item);
  const visual = {
    title: item.title,
    summary: item.summary,
    note: item.note,
    imageUrl: item.imageUrl,
    source: item.source,
  };
  let preview = null;
  let error = '';
  try {
    preview = await buildStaticRecipePreview(item.url, seed, visual);
  } catch (err) {
    error = err?.message || String(err);
  }
  if (!preview) preview = recipePresetPreviewFromText(seed, item.url, visual);

  const existingIngredients = normalizedIngredients(item);
  const existingSteps = normalizedRecipeSteps(item.steps);
  const fallbackIngredients = normalizedIngredients(preview || {});
  const fallbackSteps = normalizedRecipeSteps(preview?.steps);
  const sparseIngredients = existingIngredients.length > 0 && existingIngredients.length < 2;
  const displayIngredients = sparseIngredients ? mergeRecipeIngredients(existingIngredients, fallbackIngredients) : existingIngredients.length ? existingIngredients : fallbackIngredients;
  const displaySteps = existingSteps.length ? existingSteps : fallbackSteps;

  rows.push({
    platform: platformFromUrl(item.url),
    type: item.type || '',
    status: item.status || 'active',
    title: clip(item.title || preview?.title || '(제목 없음)', 72),
    existingIngredients: existingIngredients.length,
    existingSteps: existingSteps.length,
    fallbackIngredients: fallbackIngredients.length,
    fallbackSteps: fallbackSteps.length,
    displayIngredients: displayIngredients.length,
    displaySteps: displaySteps.length,
    provider: preview?.provider || '',
    sampleIngredients: displayIngredients.slice(0, 5).map(row => row.name).join(', '),
    warning: clip(preview?.warning || error || '', 90),
  });
}

const summary = rows.reduce((acc, row) => {
  acc.total += 1;
  acc[row.platform] = (acc[row.platform] || 0) + 1;
  if (row.displayIngredients > 0) acc.withIngredients += 1;
  if (row.displaySteps > 0) acc.withSteps += 1;
  if (row.existingIngredients === 0 && row.fallbackIngredients > 0) acc.improvedIngredients += 1;
  if (row.existingIngredients > 0 && row.displayIngredients > row.existingIngredients) acc.expandedSparseIngredients += 1;
  if (row.existingSteps === 0 && row.fallbackSteps > 0) acc.improvedSteps += 1;
  if (row.displayIngredients === 0) acc.missingIngredients += 1;
  if (row.displaySteps === 0) acc.missingSteps += 1;
  return acc;
}, {
  total: 0,
  youtube: 0,
  instagram: 0,
  other: 0,
  withIngredients: 0,
  withSteps: 0,
  improvedIngredients: 0,
  expandedSparseIngredients: 0,
  improvedSteps: 0,
  missingIngredients: 0,
  missingSteps: 0,
});

console.log(JSON.stringify({ summary, rows }, null, 2));

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

function isVideoRecipeCandidate(item) {
  const url = String(item?.url || '');
  if (/(youtube\.com\/shorts|youtu\.be|instagram\.com\/(?:reel|reels|p)\/|tiktok\.com)/i.test(url)) return true;
  return item?.type === 'recipe' && /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i.test(url);
}

function recipeSeedText(item) {
  return [
    item.title,
    item.summary,
    item.note,
    item.domain,
    item.source?.caption,
    item.url,
  ].filter(Boolean).join('\n');
}

function normalizedRecipeSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.map(step => String(step || '').trim()).filter(Boolean).slice(0, 30);
}

function platformFromUrl(value) {
  const url = String(value || '').toLowerCase();
  if (url.includes('instagram.com')) return 'instagram';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  return 'other';
}

function clip(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
