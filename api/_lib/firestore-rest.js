// ================================================================
// api/_lib/firestore-rest.js — mailbox id helper and legacy REST writer
// ================================================================

import crypto from 'crypto';
import { firebaseConfig } from '../../config.js';

const FIRESTORE_ROOT = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

export function mailboxIdFromIngestToken() {
  const token = process.env.INGEST_TOKEN || '';
  if (!token) throw new Error('INGEST_TOKEN env 미설정');
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function saveRawToMailbox(payload) {
  const mailboxId = mailboxIdFromIngestToken();
  const url = `${FIRESTORE_ROOT}/mailboxes/${mailboxId}/raw_messages?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const now = new Date();
  const receivedAt = normalizeDate(payload.receivedAt) || now;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: toFirestoreFields({
        source: payload.source || 'notif',
        sender: payload.sender || null,
        app: payload.app || null,
        body: payload.body,
        receivedAt,
        status: 'pending',
        createdAt: now,
      }),
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Firestore REST ${res.status}`);
  return data.name?.split('/').pop() || null;
}

function normalizeDate(value) {
  if (!value) return null;
  const n = Number(value);
  const date = Number.isFinite(n) ? new Date(n < 100000000000 ? n * 1000 : n) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toFirestoreFields(obj) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, toFirestoreValue(value)]));
}

function toFirestoreValue(value) {
  if (value == null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}
