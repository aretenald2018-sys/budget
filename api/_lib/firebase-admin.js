// ================================================================
// api/_lib/firebase-admin.js — server-side Firestore writes
// ================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

let db;

function ensureAdminApp() {
  if (!getApps().length) {
    const serviceAccount = parseFirebaseServiceAccountEnv(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!serviceAccount.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT env 미설정');
    initializeApp({ credential: cert(serviceAccount) });
  }
}

export function parseFirebaseServiceAccountEnv(value = process.env.FIREBASE_SERVICE_ACCOUNT) {
  const raw = String(value || '').trim();
  if (!raw) return {};

  const candidates = [raw, escapeRawNewlinesInJsonStrings(raw)];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return normalizeServiceAccount(JSON.parse(candidate));
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`FIREBASE_SERVICE_ACCOUNT env JSON 파싱 실패: ${lastError?.message || 'invalid JSON'}`);
}

function normalizeServiceAccount(serviceAccount) {
  const next = { ...(serviceAccount || {}) };
  if (typeof next.private_key === 'string') {
    next.private_key = next.private_key.replace(/\\n/g, '\n');
  }
  return next;
}

function escapeRawNewlinesInJsonStrings(value) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }
    if (inString && char === '\\') {
      result += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    if (inString && char === '\r') {
      if (value[i + 1] === '\n') i++;
      result += '\\n';
      continue;
    }
    if (inString && char === '\n') {
      result += '\\n';
      continue;
    }
    result += char;
  }

  return result;
}

export function getAdminDb() {
  if (db) return db;
  ensureAdminApp();
  db = getFirestore();
  return db;
}

export function getAdminAuth() {
  ensureAdminApp();
  return getAuth();
}

export async function verifyUserRequest(req) {
  ensureAdminApp();
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!bearer) {
    const err = new Error('unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const decoded = await getAuth().verifyIdToken(bearer);
  const expectedUid = userScope();
  if (decoded.uid !== expectedUid) {
    const err = new Error('forbidden');
    err.statusCode = 403;
    throw err;
  }
  return { uid: decoded.uid, via: 'firebase' };
}

export function userScope() {
  const uid = process.env.USER_UID;
  if (!uid) throw new Error('USER_UID env 미설정');
  return uid;
}

export { FieldValue, Timestamp };
