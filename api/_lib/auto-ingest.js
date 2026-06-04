// ================================================================
// api/_lib/auto-ingest.js — raw 저장 후 즉시 거래 생성
// ================================================================

import crypto from 'crypto';
import { getAdminDb, userScope, FieldValue, Timestamp } from './firebase-admin.js';
import { mailboxIdFromIngestToken } from './firestore-rest.js';
import { parseRawMessage } from './server-parser.js';
import { applySharedPaymentRules } from './shared-payments.js';
import {
  buildNaverPayDuplicateMergePatch,
  isNaverPayRailTx,
  isNaverPayTopupPurchasePair,
  parseNaverPayAutoPaymentMessage,
} from '../../utils/naverpay.js';

const DUPLICATE_TX_WINDOW_MS = 10 * 60 * 1000;
const PARSED_TRANSACTION_TYPES = new Set([
  'card_payment',
  'transfer_out',
  'transfer_in',
  'settlement_in',
  'settlement_out',
]);

export async function ingestAndParse(payload) {
  const db = getAdminDb();
  const uid = userScope();
  const mailboxId = mailboxIdFromIngestToken();
  const receivedAt = normalizeDate(payload.receivedAt) || new Date();
  const dedupeKey = makeDedupeKey(payload);
  const dedupeRef = db.collection('users').doc(uid).collection('ingest_dedup').doc(dedupeKey);
  const dedupe = await acquireDedupe(dedupeRef, payload);
  if (!dedupe.acquired) {
    const result = diagnosticResult(payload, {
      rawId: dedupe.rawId || null,
      status: dedupe.status === 'processing' ? 'pending' : (dedupe.status || 'pending'),
      txId: dedupe.txId || null,
      skipReason: dedupe.skipReason || null,
      parseError: dedupe.parseError || null,
      duplicate: true,
      duplicateKey: dedupeKey,
    });
    console.info('[ingest] duplicate', result);
    return result;
  }

  const rawDoc = {
    source: payload.source || 'notif',
    sender: payload.sender || null,
    app: payload.app || null,
    body: payload.body,
    dedupeKey,
    meta: payload.meta || {},
    receivedAt: Timestamp.fromDate(receivedAt),
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  };

  const mailboxRawRef = await db.collection('mailboxes').doc(mailboxId).collection('raw_messages').add(rawDoc);
  const userRawRef = db.collection('users').doc(uid).collection('raw_messages').doc(mailboxRawRef.id);
  await userRawRef.set(rawDoc);

  try {
    const [accountsSnap, categoriesSnap] = await Promise.all([
      db.collection('users').doc(uid).collection('accounts').get(),
      db.collection('users').doc(uid).collection('categories').get(),
    ]);
    const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const categories = categoriesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const parsed = await parseRawMessage({ ...rawDoc, receivedAt, body: payload.body }, accounts, categories);

    const skipReason = parsedRawSkipReason(parsed);
    if (skipReason) {
      const patch = {
        status: 'skipped',
        skipReason,
        parsedAt: FieldValue.serverTimestamp(),
      };
      await Promise.all([mailboxRawRef.update(patch), userRawRef.update(patch)]);
      await dedupeRef.set({
        status: 'skipped',
        rawId: mailboxRawRef.id,
        skipReason: patch.skipReason,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const result = diagnosticResult(payload, {
        rawId: mailboxRawRef.id,
        status: 'skipped',
        skipReason: patch.skipReason,
        duplicateKey: dedupeKey,
      });
      console.info('[ingest] result', result);
      return result;
    }

    const confidence = Number(parsed.confidence) || 0;
    const occurredAt = safeOccurredAt(parsed.occurredAt, receivedAt);
    let txDoc = applyParsedTxFields({
      type: parsed.type,
      amount: parsedAmount(parsed.amount),
      occurredAt: Timestamp.fromDate(occurredAt),
      merchant: parsed.merchant || null,
      counterparty: parsed.counterparty || null,
      accountId: parsed.accountId || null,
      category: parsed.category || null,
      confidence,
      needsReview: !!parsed.needsReview || confidence < 0.7,
      rawMessageIds: [mailboxRawRef.id],
      receiptIds: [],
      body: payload.body,
      dedupeKey,
      source: rawDoc.source,
      createdAt: FieldValue.serverTimestamp(),
    }, parsed);
    txDoc = await applyMerchantCategoryMemory(db, uid, txDoc);
    const sharedResult = await applySharedPaymentRules(db, uid, txDoc);
    txDoc = sharedResult.txDoc;
    const matchedUrge = await findAwaitingPurchaseUrge(db, uid, txDoc, occurredAt);
    if (matchedUrge) {
      txDoc.urgeId = matchedUrge.id;
    }

    const txRef = db.collection('users').doc(uid).collection('transactions').doc();
    const saved = await saveTransactionOrLinkDuplicate(db, uid, {
      txRef,
      txDoc,
      occurredAt,
      matchedUrge,
      mailboxRawRef,
      userRawRef,
      dedupeRef,
    });

    const result = diagnosticResult(payload, {
      rawId: mailboxRawRef.id,
      status: 'parsed',
      txId: saved.txId,
      duplicateTx: saved.duplicateTx,
      duplicateKey: dedupeKey,
    });
    console.info('[ingest] result', result);
    return result;
  } catch (err) {
    const patch = {
      status: 'pending',
      lastError: err.message,
      retryCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await Promise.all([mailboxRawRef.update(patch), userRawRef.update(patch)]);
    await dedupeRef.set({
      status: 'pending',
      rawId: mailboxRawRef.id,
      parseError: err.message,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.error('[ingest] result', diagnosticResult(payload, {
      rawId: mailboxRawRef.id,
      status: 'pending',
      parseError: err.message,
      duplicateKey: dedupeKey,
    }));
    throw Object.assign(err, { rawId: mailboxRawRef.id, payload });
  }
}

export async function processPendingStoredRawMessages({ max = 25, lookback = 120 } = {}) {
  const db = getAdminDb();
  const uid = userScope();
  const mailboxId = mailboxIdFromIngestToken();
  const userRef = db.collection('users').doc(uid);
  const recentSnap = await userRef.collection('raw_messages')
    .orderBy('createdAt', 'desc')
    .limit(Math.max(max, lookback))
    .get();
  const processableDocs = recentSnap.docs
    .filter(doc => shouldReprocessStoredRawMessage(doc.data()))
    .slice(0, max);
  if (!processableDocs.length) {
    return { processed: 0, parsed: 0, skipped: 0, failed: 0, duplicateTx: 0, results: [] };
  }

  const [accountsSnap, categoriesSnap] = await Promise.all([
    userRef.collection('accounts').get(),
    userRef.collection('categories').get(),
  ]);
  const accounts = accountsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const categories = categoriesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const results = [];

  for (const doc of processableDocs) {
    const raw = { id: doc.id, ...doc.data() };
    const receivedAt = normalizeDate(raw.receivedAt) || new Date();
    const dedupeKey = raw.dedupeKey || makeDedupeKey(raw);
    const mailboxRawRef = db.collection('mailboxes').doc(mailboxId).collection('raw_messages').doc(doc.id);
    const userRawRef = doc.ref;
    const dedupeRef = userRef.collection('ingest_dedup').doc(dedupeKey);

    try {
      await mailboxRawRef.set({
        source: raw.source || 'notif',
        sender: raw.sender || null,
        app: raw.app || null,
        body: raw.body || '',
        dedupeKey,
        receivedAt: Timestamp.fromDate(receivedAt),
        status: raw.status || 'pending',
      }, { merge: true });

      const parsed = await parseRawMessage({ ...raw, receivedAt, body: raw.body || '' }, accounts, categories);
      const skipReason = parsedRawSkipReason(parsed);
      if (skipReason) {
        const patch = {
          status: 'skipped',
          skipReason,
          parsedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        await Promise.all([mailboxRawRef.set(patch, { merge: true }), userRawRef.set(patch, { merge: true })]);
        await dedupeRef.set({
          status: 'skipped',
          rawId: doc.id,
          skipReason: patch.skipReason,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        results.push({ rawId: doc.id, status: 'skipped', skipReason: patch.skipReason });
        continue;
      }

      const confidence = Number(parsed.confidence) || 0;
      const occurredAt = safeOccurredAt(parsed.occurredAt, receivedAt);
      let txDoc = applyParsedTxFields({
        type: parsed.type,
        amount: parsedAmount(parsed.amount),
        occurredAt: Timestamp.fromDate(occurredAt),
        merchant: parsed.merchant || null,
        counterparty: parsed.counterparty || null,
        accountId: parsed.accountId || null,
        category: parsed.category || null,
        confidence,
        needsReview: !!parsed.needsReview || confidence < 0.7,
        rawMessageIds: [doc.id],
        receiptIds: [],
        body: raw.body || '',
        dedupeKey,
        source: raw.source || 'notif',
        createdAt: FieldValue.serverTimestamp(),
      }, parsed);
      txDoc = await applyMerchantCategoryMemory(db, uid, txDoc);
      const sharedResult = await applySharedPaymentRules(db, uid, txDoc);
      txDoc = sharedResult.txDoc;
      const matchedUrge = await findAwaitingPurchaseUrge(db, uid, txDoc, occurredAt);
      if (matchedUrge) txDoc.urgeId = matchedUrge.id;

      const txRef = userRef.collection('transactions').doc();
      const saved = await saveTransactionOrLinkDuplicate(db, uid, {
        txRef,
        txDoc,
        occurredAt,
        matchedUrge,
        mailboxRawRef,
        userRawRef,
        dedupeRef,
      });
      results.push({ rawId: doc.id, status: 'parsed', txId: saved.txId, duplicateTx: saved.duplicateTx });
    } catch (err) {
      const patch = {
        status: 'pending',
        lastError: err.message,
        retryCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      };
      await Promise.all([mailboxRawRef.set(patch, { merge: true }), userRawRef.set(patch, { merge: true })]);
      results.push({ rawId: doc.id, status: 'failed', error: err.message });
    }
  }

  return {
    processed: results.length,
    parsed: results.filter(r => r.status === 'parsed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
    duplicateTx: results.filter(r => r.duplicateTx).length,
    results,
  };
}

export function diagnosticResult(payload, result) {
  return {
    ...result,
    bodyHead: String(payload?.body || '').slice(0, 300),
  };
}

export function shouldReprocessStoredRawMessage(raw) {
  const status = String(raw?.status || '').trim();
  if (status === 'pending') return true;
  if (status !== 'skipped') return false;
  return !!parseNaverPayAutoPaymentMessage({ body: raw?.body || '', receivedAt: raw?.receivedAt || null });
}

export function parsedAmount(value) {
  return Math.abs(Number(value) || 0);
}

export function parsedRawSkipReason(parsed) {
  if (!parsed || parsed.type === 'skip') return parsed?.reason || '결제 외 메시지';
  if (!PARSED_TRANSACTION_TYPES.has(parsed.type)) return '';
  if (parsedAmount(parsed.amount) > 0) return '';
  return parsed.reason
    ? `금액 없는 거래 파싱 결과: ${parsed.reason}`
    : '금액 없는 결제/이체 메시지';
}

function makeDedupeKey(payload) {
  const normalized = [
    payload?.source || '',
    payload?.sender || '',
    payload?.app || '',
    normalizeText(payload?.body || ''),
  ].join('\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

async function applyMerchantCategoryMemory(db, uid, txDoc) {
  if (!['card_payment', 'transfer_out'].includes(txDoc?.type)) return txDoc;
  if (hasLearnedCategory(txDoc?.category)) return txDoc;
  const party = txDoc?.merchant || txDoc?.counterparty;
  if (!normalizeParty(party)) return { ...txDoc, category: txDoc?.category || null };

  const snap = await db.collection('users').doc(uid).collection('transactions')
    .orderBy('occurredAt', 'desc')
    .limit(500)
    .get();
  const learned = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .find(existing => {
      if (existing.hidden) return false;
      if (!hasLearnedCategory(existing.category)) return false;
      return sameKnownParty(party, existing.merchant || existing.counterparty);
    });
  if (!learned) return { ...txDoc, category: txDoc?.category || null };

  return {
    ...txDoc,
    category: learned.category,
    subcategory: txDoc?.subcategory || learned.subcategory || null,
    needsReview: false,
    autoCategorySource: 'merchant_history',
  };
}

function hasLearnedCategory(category) {
  return !!category && category !== '미분류';
}

function sameKnownParty(a, b) {
  const left = normalizeParty(a);
  const right = normalizeParty(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

async function saveTransactionOrLinkDuplicate(db, uid, refs) {
  const { txRef, txDoc, occurredAt, matchedUrge, mailboxRawRef, userRawRef, dedupeRef } = refs;
  return db.runTransaction(async transaction => {
    const existingTx = await findSimilarTransactionInTransaction(transaction, db, uid, { ...txDoc, occurredAt });
    const txId = existingTx?.id || txRef.id;
    const parsedPatch = {
      status: 'parsed',
      txId,
      parsedAt: FieldValue.serverTimestamp(),
    };

    if (existingTx) {
      parsedPatch.duplicateTx = true;
      transaction.update(existingTx.ref, {
        ...buildDuplicateMergePatch(existingTx.data(), txDoc),
        rawMessageIds: FieldValue.arrayUnion(mailboxRawRef.id),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.set(txRef, txDoc);
      if (matchedUrge?.ref) {
        transaction.update(matchedUrge.ref, {
          status: 'resolved',
          txId: txRef.id,
          resolvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    transaction.update(mailboxRawRef, parsedPatch);
    transaction.update(userRawRef, parsedPatch);
    transaction.set(dedupeRef, {
      status: 'parsed',
      rawId: mailboxRawRef.id,
      txId,
      duplicateTx: !!existingTx,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { txId, duplicateTx: !!existingTx };
  });
}

async function findAwaitingPurchaseUrge(db, uid, txDoc, occurredAt) {
  if (!txDoc?.category || !Number.isFinite(txDoc.amount) || txDoc.amount <= 0) return null;
  const start = new Date(occurredAt.getTime() - 24 * 60 * 60 * 1000);
  const snap = await db.collection('users').doc(uid).collection('urges')
    .where('status', '==', 'awaiting_purchase')
    .limit(50)
    .get();
  const min = txDoc.amount * 0.8;
  const max = txDoc.amount * 1.2;
  return snap.docs
    .map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter(urge => {
      const price = Number(urge.estimatedPrice) || 0;
      const createdAt = urge.createdAt?.toDate ? urge.createdAt.toDate() : normalizeDate(urge.createdAt);
      return urge.category === txDoc.category
        && createdAt
        && createdAt >= start
        && price >= min
        && price <= max;
    })
    .sort((a, b) => {
      const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bt - at;
    })[0] || null;
}

async function findSimilarTransactionInTransaction(transaction, db, uid, tx) {
  if (!tx?.type || !Number.isFinite(tx.amount) || !(tx.occurredAt instanceof Date)) return null;

  const start = new Date(tx.occurredAt.getTime() - DUPLICATE_TX_WINDOW_MS);
  const end = new Date(tx.occurredAt.getTime() + DUPLICATE_TX_WINDOW_MS);
  const query = db.collection('users').doc(uid).collection('transactions')
    .where('amount', '==', tx.amount)
    .limit(50);
  const originalAmountQuery = db.collection('users').doc(uid).collection('transactions')
    .where('sharedPayment.originalAmount', '==', tx.amount)
    .limit(50);
  const [snap, originalSnap] = await Promise.all([
    transaction.get(query),
    transaction.get(originalAmountQuery),
  ]);
  const docsById = new Map([...snap.docs, ...originalSnap.docs].map(doc => [doc.id, doc]));
  const amountMatch = [...docsById.values()].find(doc => {
    const data = doc.data();
    const occurredAt = data?.occurredAt?.toDate ? data.occurredAt.toDate() : normalizeDate(data?.occurredAt);
    return occurredAt && occurredAt >= start && occurredAt <= end && isSameTransactionEvent(data, tx);
  });
  if (amountMatch) return amountMatch;

  if (!isNaverPayRailTx(tx)) return null;
  const railQuery = db.collection('users').doc(uid).collection('transactions')
    .where('occurredAt', '>=', Timestamp.fromDate(start))
    .where('occurredAt', '<=', Timestamp.fromDate(end))
    .limit(50);
  const railSnap = await transaction.get(railQuery);
  return railSnap.docs.find(doc => {
    const data = doc.data();
    return !data?.hidden && isNaverPayTopupPurchasePair(data, tx);
  }) || null;
}

function isSameTransactionEvent(existing, incoming) {
  if (!existing || existing.hidden) return false;
  if (isNaverPayTopupPurchasePair(existing, incoming)) return true;
  if (existing.type !== incoming.type) return false;
  if (!sameParty(existing.merchant || existing.counterparty, incoming.merchant || incoming.counterparty)) return false;
  return true;
}

function applyParsedTxFields(txDoc, parsed) {
  const next = { ...txDoc };
  for (const field of ['paymentRail', 'paymentRailResolved', 'actualMerchant', 'originalMerchant', 'memo', 'sourceDetail']) {
    if (parsed?.[field] !== undefined) next[field] = parsed[field];
  }
  return next;
}

function buildDuplicateMergePatch(existing, incoming) {
  return buildNaverPayDuplicateMergePatch(existing, incoming) || {};
}

function sameParty(a, b) {
  const left = normalizeParty(a);
  const right = normalizeParty(b);
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeParty(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const STALE_PROCESSING_MS = 5 * 60 * 1000;

async function acquireDedupe(ref, payload) {
  const now = new Date();
  try {
    await ref.create({
      status: 'processing',
      bodyHead: String(payload?.body || '').slice(0, 300),
      processingStartedAt: Timestamp.fromDate(now),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { acquired: true };
  } catch (err) {
    if (err.code !== 6 && err.code !== 'already-exists') throw err;
  }

  const snap = await ref.get();
  const data = snap.exists ? snap.data() : {};
  const startedAt = data?.processingStartedAt?.toDate ? data.processingStartedAt.toDate() : null;
  if (data?.status === 'pending') {
    await ref.set({
      status: 'processing',
      processingStartedAt: Timestamp.fromDate(now),
      updatedAt: FieldValue.serverTimestamp(),
      pendingRetryCount: FieldValue.increment(1),
    }, { merge: true });
    return { acquired: true };
  }
  if (data?.status === 'processing' && startedAt && now.getTime() - startedAt.getTime() > STALE_PROCESSING_MS) {
    await ref.set({
      status: 'processing',
      processingStartedAt: Timestamp.fromDate(now),
      updatedAt: FieldValue.serverTimestamp(),
      staleRetryCount: FieldValue.increment(1),
    }, { merge: true });
    return { acquired: true };
  }
  return { acquired: false, ...data };
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toDate) return value.toDate();
  const n = Number(value);
  const date = Number.isFinite(n)
    ? new Date(n < 100000000000 ? n * 1000 : n)
    : parseKoreanLocalDateString(value) || new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseKoreanLocalDateString(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(text)) return null;

  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '0'] = match;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 9, Number(mi), Number(s)));
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function safeOccurredAt(parsedValue, receivedAt) {
  const parsedDate = normalizeDate(parsedValue);
  if (!parsedDate) return receivedAt;
  if (Math.abs(parsedDate.getTime() - receivedAt.getTime()) > SEVEN_DAYS_MS) return receivedAt;
  return parsedDate;
}
