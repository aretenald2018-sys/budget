import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdminDb, userScope, FieldValue, Timestamp } from '../api/_lib/firebase-admin.js';
import { mailboxIdFromIngestToken } from '../api/_lib/firestore-rest.js';
import { parseRawMessage } from '../api/_lib/server-parser.js';
import { applySharedPaymentRules } from '../api/_lib/shared-payments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, '..', '.env.local'));

const DUPLICATE_TX_WINDOW_MS = 10 * 60 * 1000;

async function main() {
  const db = getAdminDb();
  const uid = userScope();
  const mailboxId = mailboxIdFromIngestToken();
  const userRef = db.collection('users').doc(uid);
  const rawSnap = await userRef.collection('raw_messages')
    .where('status', '==', 'pending')
    .limit(Number(process.argv[2]) || 20)
    .get();

  if (rawSnap.empty) {
    console.log('pending raw 없음');
    return;
  }

  const [accountsSnap, categoriesSnap] = await Promise.all([
    userRef.collection('accounts').get(),
    userRef.collection('categories').get(),
  ]);
  const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const categories = categoriesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let parsedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const doc of rawSnap.docs) {
    const raw = { id: doc.id, ...doc.data() };
    try {
      const receivedAt = normalizeDate(raw.receivedAt) || new Date();
      const parsed = await parseRawMessage({ ...raw, receivedAt }, accounts, categories);
      if (!parsed || parsed.type === 'skip') {
        await updateRaw(db, uid, mailboxId, raw.id, {
          status: 'skipped',
          skipReason: parsed?.reason || '결제 외 메시지',
          parsedAt: FieldValue.serverTimestamp(),
        });
        skippedCount++;
        console.log(`skipped ${raw.id}`);
        continue;
      }

      const occurredAt = safeOccurredAt(parsed.occurredAt, receivedAt);
      let txDoc = {
        type: parsed.type,
        amount: Math.abs(Number(parsed.amount) || 0),
        occurredAt: Timestamp.fromDate(occurredAt),
        merchant: parsed.merchant || null,
        counterparty: parsed.counterparty || null,
        accountId: parsed.accountId || null,
        category: parsed.category || null,
        confidence: Number(parsed.confidence) || 0,
        needsReview: !!parsed.needsReview || (Number(parsed.confidence) || 0) < 0.7,
        rawMessageIds: [raw.id],
        receiptIds: [],
        body: raw.body,
        dedupeKey: raw.dedupeKey || null,
        source: raw.source || 'sms',
        createdAt: FieldValue.serverTimestamp(),
      };
      txDoc = (await applySharedPaymentRules(db, uid, txDoc)).txDoc;

      const existingTx = await findSimilarTransaction(db, uid, { ...txDoc, occurredAt });
      const txRef = existingTx?.ref || userRef.collection('transactions').doc();
      const batch = db.batch();
      if (existingTx) {
        batch.update(existingTx.ref, {
          rawMessageIds: FieldValue.arrayUnion(raw.id),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        batch.set(txRef, txDoc);
      }
      batch.update(doc.ref, {
        status: 'parsed',
        txId: txRef.id,
        duplicateTx: !!existingTx,
        parsedAt: FieldValue.serverTimestamp(),
      });
      batch.update(db.collection('mailboxes').doc(mailboxId).collection('raw_messages').doc(raw.id), {
        status: 'parsed',
        txId: txRef.id,
        duplicateTx: !!existingTx,
        parsedAt: FieldValue.serverTimestamp(),
      });
      if (raw.dedupeKey) {
        batch.set(userRef.collection('ingest_dedup').doc(raw.dedupeKey), {
          status: 'parsed',
          rawId: raw.id,
          txId: txRef.id,
          duplicateTx: !!existingTx,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
      parsedCount++;
      console.log(`parsed ${raw.id} -> ${txRef.id}${existingTx ? ' duplicate-linked' : ''}`);
    } catch (err) {
      failedCount++;
      await doc.ref.update({
        lastError: err.message,
        retryCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.error(`failed ${raw.id}: ${err.message}`);
    }
  }

  console.log(`done parsed=${parsedCount} skipped=${skippedCount} failed=${failedCount}`);
}

async function updateRaw(db, uid, mailboxId, rawId, patch) {
  await Promise.all([
    db.collection('users').doc(uid).collection('raw_messages').doc(rawId).update(patch),
    db.collection('mailboxes').doc(mailboxId).collection('raw_messages').doc(rawId).update(patch),
  ]);
}

async function findSimilarTransaction(db, uid, tx) {
  if (!tx?.type || !Number.isFinite(tx.amount) || !(tx.occurredAt instanceof Date)) return null;
  const start = new Date(tx.occurredAt.getTime() - DUPLICATE_TX_WINDOW_MS);
  const end = new Date(tx.occurredAt.getTime() + DUPLICATE_TX_WINDOW_MS);
  const snap = await db.collection('users').doc(uid).collection('transactions')
    .where('amount', '==', tx.amount)
    .limit(50)
    .get();
  return snap.docs.find(doc => {
    const data = doc.data();
    const occurredAt = normalizeDate(data?.occurredAt);
    return occurredAt && occurredAt >= start && occurredAt <= end && isSameTransactionEvent(data, tx);
  }) || null;
}

function isSameTransactionEvent(existing, incoming) {
  if (!existing || existing.hidden) return false;
  if (existing.type !== incoming.type) return false;
  const left = normalizeParty(existing.merchant || existing.counterparty);
  const right = normalizeParty(incoming.merchant || incoming.counterparty);
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

function safeOccurredAt(parsedValue, receivedAt) {
  const parsedDate = normalizeDate(parsedValue);
  if (!parsedDate) return receivedAt;
  if (Math.abs(parsedDate.getTime() - receivedAt.getTime()) > 7 * 24 * 60 * 60 * 1000) return receivedAt;
  return parsedDate;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toDate) return value.toDate();
  const n = Number(value);
  const date = Number.isFinite(n)
    ? new Date(n < 100000000000 ? n * 1000 : n)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeParty(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

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

main().catch(err => {
  console.error(err);
  process.exit(1);
});
