// ================================================================
// api/_lib/firebase-admin.js — server-side Firestore writes
// ================================================================

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

let db;

function ensureAdminApp() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (!serviceAccount.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT env 미설정');
    initializeApp({ credential: cert(serviceAccount) });
  }
}

export function getAdminDb() {
  if (db) return db;
  ensureAdminApp();
  db = getFirestore();
  return db;
}

export async function verifyUserRequest(req) {
  ensureAdminApp();
  const expectedToken = process.env.INGEST_TOKEN || '';
  const auth = String(req.headers.authorization || '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (expectedToken && bearer === expectedToken) {
    return { uid: userScope(), via: 'ingest-token' };
  }
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
