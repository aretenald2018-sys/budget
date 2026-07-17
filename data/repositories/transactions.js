import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { firestoreDb as _db, scope as _scope } from '../core/firebase.js';
import {
  REIMBURSEMENT_CATEGORY_NAME,
  UNCATEGORIZED_CATEGORY_NAME,
} from '../constants.js';
import { normalizeDate as normalizeTxDate, normalizeParty } from '../shared/normalize.js';
import {
  buildReceiptMemo,
  classifyReceiptCategory,
  isBlankOrCoupangAliasCategory,
  isGenericReceiptMerchant,
  mergeReceiptMemo,
} from '../../domain/receipts/rules.js';
import {
  displayCategoryName as displayCategoryNameRule,
  isBudgetExcluded as isBudgetExcludedRule,
  isReimbursementExpected as isReimbursementExpectedRule,
  needsPaymentRailReview as needsPaymentRailReviewRule,
} from '../../domain/transactions/budget.js';
import {
  applySharedPaymentRule,
  isShareablePayment,
  markSharedPaymentSuggested,
  sameSharedPaymentParty,
} from '../../domain/transactions/shared-payment.js';
import {
  isNaverPayRailTx,
  isNaverPayTopup as isNaverPayTopupTx,
  isNaverPayTopupPurchasePair,
} from '../../domain/transactions/naverpay.js';
import {
  applyAutomaticSpendingExclusions,
} from '../../domain/transactions/self-transfer.js';
import { queueDaybirdRefresh } from '../../utils/daybird-sync.js';

const CLIENT_GENERIC_RECEIPT_MERCHANTS = [
  '쿠팡',
  '쿠팡이츠',
  '배달의민족',
  '배민',
  'coupang',
  'coupangeats',
  'baemin',
];

// ================================================================
// raw_messages: historical review only. Do not delete existing raw rows.
// ================================================================
export async function listPendingRawMessages(max = 50) {
  const ref = collection(_db, 'users', _scope(), 'raw_messages');
  const q = query(ref, where('status', '==', 'pending'), orderBy('createdAt', 'asc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function markRawMessageSkipped(rawId, reason) {
  const ref = doc(_db, 'users', _scope(), 'raw_messages', rawId);
  await updateDoc(ref, { status: 'skipped', skipReason: reason });
}

// ================================================================
// transactions
// ================================================================
export async function saveTransaction(tx) {
  const ref = collection(_db, 'users', _scope(), 'transactions');
  const normalized = applyAutomaticSpendingExclusions(tx);
  const categorized = await applyMerchantCategoryMemory(normalized);
  const sharedPaymentPrepared = await prepareSharedPayment({
    ...categorized,
    isLateNight: computeIsLateNight(normalizeTxDate(categorized?.occurredAt) || new Date()),
    intent: categorized.intent ?? null,
    mood: categorized.mood ?? null,
    reflection: categorized.reflection ?? null,
  });
  const prepared = withoutRewardPointEntry(
    applyAutomaticSpendingExclusions(sharedPaymentPrepared)
  );
  const docRef = await addDoc(ref, { ...prepared, createdAt: serverTimestamp() });
  void queueDaybirdRefresh('transaction-create');
  return docRef.id;
}

function withoutRewardPointEntry(tx = {}) {
  const next = { ...tx };
  delete next.rewardPointEntry;
  return next;
}

function prepareTransactionPatch(patch = {}) {
  return withoutRewardPointEntry(patch);
}

export async function findSimilarTransaction(tx, windowMs = 10 * 60 * 1000) {
  const occurredAt = normalizeTxDate(tx?.occurredAt);
  const amount = Math.abs(Number(tx?.amount) || 0);
  if (!tx?.type || !amount || !occurredAt) return null;

  const ref = collection(_db, 'users', _scope(), 'transactions');
  const q = query(
    ref,
    where('amount', '==', amount),
    limit(50)
  );
  const originalAmountQuery = query(
    ref,
    where('sharedPayment.originalAmount', '==', amount),
    limit(50)
  );
  const start = new Date(occurredAt.getTime() - windowMs);
  const end = new Date(occurredAt.getTime() + windowMs);
  const [snap, originalSnap] = await Promise.all([
    getDocs(q),
    getDocs(originalAmountQuery),
  ]);
  const docsById = new Map([...snap.docs, ...originalSnap.docs].map(doc => [doc.id, doc]));
  const match = [...docsById.values()]
    .map(d => ({ id: d.id, ...d.data() }))
    .find(existing => {
      const existingAt = normalizeTxDate(existing.occurredAt);
      return existingAt && existingAt >= start && existingAt <= end && isSameTransactionEvent(existing, tx);
    });
  if (match) return match;

  if (!isNaverPayRailTx(tx)) return null;
  const railSnap = await getDocs(query(
    ref,
    where('occurredAt', '>=', Timestamp.fromDate(start)),
    where('occurredAt', '<=', Timestamp.fromDate(end)),
    limit(50)
  ));
  return railSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(existing => !existing.hidden && isNaverPayTopupPurchasePair(existing, tx)) || null;
}

async function applyMerchantCategoryMemory(tx) {
  if (!['card_payment', 'transfer_out'].includes(tx?.type)) return tx;
  if (hasLearnedCategory(tx?.category)) return tx;
  const learned = await findRecentCategoryForParty(tx);
  if (!learned) return { ...tx, category: tx?.category || null };
  return {
    ...tx,
    category: learned.category,
    subcategory: tx?.subcategory || learned.subcategory || null,
    needsReview: false,
    autoCategorySource: 'merchant_history',
  };
}

async function findRecentCategoryForParty(tx) {
  const party = tx?.merchant || tx?.counterparty;
  if (!normalizeParty(party)) return null;
  const ref = collection(_db, 'users', _scope(), 'transactions');
  const snap = await getDocs(query(ref, orderBy('occurredAt', 'desc'), limit(500)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .find(existing => {
      if (existing.hidden) return false;
      if (!hasLearnedCategory(existing.category)) return false;
      if (!sameKnownParty(party, existing.merchant || existing.counterparty)) return false;
      return true;
    }) || null;
}

function hasLearnedCategory(category) {
  return !!category && category !== UNCATEGORIZED_CATEGORY_NAME;
}

function sameKnownParty(a, b) {
  const left = normalizeParty(a);
  const right = normalizeParty(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export async function linkRawMessageToTransaction(txId, rawId) {
  const ref = doc(_db, 'users', _scope(), 'transactions', txId);
  await updateDoc(ref, {
    rawMessageIds: arrayUnion(rawId),
    updatedAt: serverTimestamp(),
  });
}

export async function updateTransaction(txId, patch) {
  const ref = doc(_db, 'users', _scope(), 'transactions', txId);
  const preparedPatch = prepareTransactionPatch(patch);
  await updateDoc(ref, { ...preparedPatch, updatedAt: serverTimestamp() });
  void queueDaybirdRefresh('transaction-update');
}

export async function deleteTransaction(txId) {
  const ref = doc(_db, 'users', _scope(), 'transactions', txId);
  await deleteDoc(ref);
  void queueDaybirdRefresh('transaction-delete');
}

// ================================================================
// reward point usage — virtual ledger, never coupled to transactions
// ================================================================
export async function listRewardPointEntries(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'reward_point_entries');
  const conditions = [];
  if (opts.from) conditions.push(where('usedAt', '>=', Timestamp.fromDate(normalizeTxDate(opts.from) || new Date(0))));
  if (opts.to) conditions.push(where('usedAt', '<=', Timestamp.fromDate(normalizeTxDate(opts.to) || new Date())));
  const max = Math.min(500, Math.max(1, Math.round(Number(opts.max) || 200)));
  const snap = await getDocs(query(ref, ...conditions, orderBy('usedAt', 'desc'), limit(max)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveRewardPointEntry(entry = {}) {
  const payload = prepareRewardPointEntry(entry);
  if (entry.id) {
    const ref = doc(_db, 'users', _scope(), 'reward_point_entries', String(entry.id));
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    void queueDaybirdRefresh('reward-point-entry-update');
    return String(entry.id);
  }
  const ref = await addDoc(collection(_db, 'users', _scope(), 'reward_point_entries'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  void queueDaybirdRefresh('reward-point-entry-create');
  return ref.id;
}

export async function deleteRewardPointEntry(entryId) {
  const id = String(entryId || '').trim();
  if (!id) throw new Error('포인트 사용 이력을 찾을 수 없습니다.');
  await deleteDoc(doc(_db, 'users', _scope(), 'reward_point_entries', id));
  void queueDaybirdRefresh('reward-point-entry-delete');
}

function prepareRewardPointEntry(entry = {}) {
  const pointItemId = normalizeRewardPointUsageItemId(entry.pointItemId || entry.itemId || entry.key);
  const amount = normalizeRewardPointUsageAmount(entry.amount);
  if (!pointItemId) throw new Error('사용할 포인트 항목을 선택하세요.');
  if (!amount) throw new Error('사용 포인트를 1P 이상 입력하세요.');
  const pointItemLabel = String(entry.pointItemLabel || entry.label || pointItemId).trim().slice(0, 32) || pointItemId;
  const usedAt = normalizeTxDate(entry.usedAt) || new Date();
  return {
    pointItemId,
    pointItemLabel,
    amount,
    usedAt: Timestamp.fromDate(usedAt),
    note: String(entry.note || '').trim().slice(0, 120),
  };
}

function normalizeRewardPointUsageItemId(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48);
}

function normalizeRewardPointUsageAmount(value) {
  const amount = Math.round(Math.abs(Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0));
  return Number.isFinite(amount) ? Math.min(999999999, amount) : 0;
}

export async function getTransaction(txId) {
  const ref = doc(_db, 'users', _scope(), 'transactions', txId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listSharedPaymentRules() {
  const ref = collection(_db, 'users', _scope(), 'shared_payment_rules');
  const snap = await getDocs(query(ref, where('active', '==', true), limit(100)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveSharedPaymentRule(rule) {
  const ref = collection(_db, 'users', _scope(), 'shared_payment_rules');
  const payload = {
    name: rule.name || rule.merchant || '공동 결제처',
    merchant: rule.merchant || null,
    merchantKey: normalizeParty(rule.merchantKey || rule.merchant),
    peopleCount: Math.max(2, Math.round(Number(rule.peopleCount) || 2)),
    active: true,
    updatedAt: serverTimestamp(),
  };
  if (rule.id) {
    await setDoc(doc(_db, 'users', _scope(), 'shared_payment_rules', rule.id), payload, { merge: true });
    return rule.id;
  }
  const docRef = await addDoc(ref, { ...payload, createdAt: serverTimestamp() });
  return docRef.id;
}

export async function deleteSharedPaymentRule(ruleId) {
  await updateDoc(doc(_db, 'users', _scope(), 'shared_payment_rules', ruleId), {
    active: false,
    updatedAt: serverTimestamp(),
  });
}

export async function applySharedPayment(txId, peopleCount, opts = {}) {
  const tx = await getTransaction(txId);
  if (!tx) throw new Error('거래를 찾을 수 없습니다.');
  const count = Math.max(2, Math.round(Number(peopleCount) || 2));
  const originalAmount = Number(tx.sharedPayment?.originalAmount || tx.amount) || 0;
  let ruleId = tx.sharedPayment?.ruleId || null;

  if (opts.rememberRule) {
    ruleId = await saveSharedPaymentRule({
      merchant: tx.merchant || tx.counterparty,
      peopleCount: count,
    });
  }

  const prepared = applySharedPaymentRule(tx, count, { ruleId });
  await updateTransaction(txId, {
    amount: prepared.amount,
    needsSharedReview: false,
    needsReview: false,
    sharedPayment: prepared.sharedPayment,
  });
  await hideSharedPaymentDuplicateTransactions(txId, tx, originalAmount);
}

async function hideSharedPaymentDuplicateTransactions(txId, tx, originalAmount) {
  const occurredAt = normalizeTxDate(tx.occurredAt);
  const amount = Math.abs(Number(originalAmount) || 0);
  if (!occurredAt || !amount) return;

  const ref = collection(_db, 'users', _scope(), 'transactions');
  const snap = await getDocs(query(ref, where('amount', '==', amount), limit(50)));
  const start = new Date(occurredAt.getTime() - 10 * 60 * 1000);
  const end = new Date(occurredAt.getTime() + 10 * 60 * 1000);
  const duplicates = snap.docs
    .map(d => ({ doc: d, data: { id: d.id, ...d.data() } }))
    .filter(({ data }) => {
      if (data.id === txId || data.hidden || data.sharedPayment) return false;
      const at = normalizeTxDate(data.occurredAt);
      return at
        && at >= start
        && at <= end
        && data.type === tx.type
        && sameSharedPaymentParty(data.merchant || data.counterparty, tx.merchant || tx.counterparty);
    });
  if (!duplicates.length) return;

  const batch = writeBatch(_db);
  const rawIds = duplicates.flatMap(({ data }) => Array.isArray(data.rawMessageIds) ? data.rawMessageIds : []);
  const receiptIds = duplicates.flatMap(({ data }) => Array.isArray(data.receiptIds) ? data.receiptIds : []);
  for (const { doc: duplicateDoc } of duplicates) {
    batch.update(duplicateDoc.ref, {
      hidden: true,
      duplicateOf: txId,
      duplicateReason: 'shared_payment_original_amount',
      updatedAt: serverTimestamp(),
    });
  }
  const primaryPatch = { updatedAt: serverTimestamp() };
  if (rawIds.length) primaryPatch.rawMessageIds = arrayUnion(...rawIds);
  if (receiptIds.length) primaryPatch.receiptIds = arrayUnion(...receiptIds);
  batch.update(doc(_db, 'users', _scope(), 'transactions', txId), primaryPatch);
  await batch.commit();
}

async function prepareSharedPayment(tx) {
  if (!isShareablePayment(tx)) return tx;
  const rule = await findSharedPaymentRuleForTx(tx);
  if (rule) return applySharedPaymentRule(tx, rule.peopleCount, {
    ruleId: rule.id,
    ruleName: rule.name || null,
  });
  return markSharedPaymentSuggested(tx);
}

async function findSharedPaymentRuleForTx(tx) {
  const merchantKey = normalizeParty(tx.merchant || tx.counterparty);
  if (!merchantKey) return null;
  const rules = await listSharedPaymentRules();
  return rules.find(rule => {
    const key = normalizeParty(rule.merchantKey || rule.merchant);
    return key && (merchantKey === key || merchantKey.includes(key) || key.includes(merchantKey));
  }) || null;
}

/**
 * @param {object} opts
 * @param {Date} opts.from
 * @param {Date} opts.to
 * @param {string[]} opts.types
 * @param {number} opts.max
 * @param {object} opts.cursor — Firestore Timestamp (occurredAt)
 */
export async function listTransactions(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'transactions');
  const conds = [];
  const fallbackConds = [];
  if (opts.from) conds.push(where('occurredAt', '>=', Timestamp.fromDate(opts.from)));
  if (opts.from) fallbackConds.push(where('occurredAt', '>=', Timestamp.fromDate(opts.from)));
  if (opts.to) conds.push(where('occurredAt', '<=', Timestamp.fromDate(opts.to)));
  if (opts.to) fallbackConds.push(where('occurredAt', '<=', Timestamp.fromDate(opts.to)));
  if (opts.types?.length) conds.push(where('type', 'in', opts.types));
  if (opts.types?.length) fallbackConds.push(where('type', 'in', opts.types));
  if (opts.needsReview != null) conds.push(where('needsReview', '==', opts.needsReview));
  let q = query(ref, ...conds, orderBy('occurredAt', 'desc'), limit(opts.max || 50));
  if (opts.cursor) q = query(ref, ...conds, orderBy('occurredAt', 'desc'), startAfter(opts.cursor), limit(opts.max || 50));
  let snap;
  try {
    snap = await getDocs(q);
  } catch (err) {
    if (err.code !== 'failed-precondition' || opts.needsReview == null) throw err;
    const fallbackLimit = Math.min(1000, Math.max((opts.max || 50) * 4, 120));
    let fallbackQuery = query(ref, ...fallbackConds, orderBy('occurredAt', 'desc'), limit(fallbackLimit));
    if (opts.cursor) fallbackQuery = query(ref, ...fallbackConds, orderBy('occurredAt', 'desc'), startAfter(opts.cursor), limit(fallbackLimit));
    snap = await getDocs(fallbackQuery);
  }
  let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (opts.needsReview != null) rows = rows.filter(t => !!t.needsReview === !!opts.needsReview).slice(0, opts.max || 50);
  return opts.includeHidden ? rows : rows.filter(t => !t.hidden);
}

function isSameTransactionEvent(existing, incoming) {
  if (!existing || existing.hidden) return false;
  if (isNaverPayTopupPurchasePair(existing, incoming)) return true;
  if (existing.type !== incoming.type) return false;
  return sameSharedPaymentParty(existing.merchant || existing.counterparty, incoming.merchant || incoming.counterparty);
}

// ================================================================
// receipts
// ================================================================
export async function saveReceipt(receipt) {
  const ref = collection(_db, 'users', _scope(), 'receipts');
  const docRef = await addDoc(ref, { ...receipt, createdAt: serverTimestamp() });
  return docRef.id;
}

export async function updateReceipt(id, patch) {
  const ref = doc(_db, 'users', _scope(), 'receipts', id);
  await updateDoc(ref, patch);
}

export async function listUnmatchedReceipts(max = 100) {
  const ref = collection(_db, 'users', _scope(), 'receipts');
  const q = query(ref, where('matchedTxId', '==', null), orderBy('occurredAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getReceipt(id) {
  const ref = doc(_db, 'users', _scope(), 'receipts', id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function applyReceiptToTransaction(txId, receipt) {
  if (!txId || !receipt?.id) throw new Error('거래와 영수증이 필요합니다.');
  const tx = await getTransaction(txId);
  if (!tx) throw new Error('거래를 찾을 수 없습니다.');
  const receiptRef = doc(_db, 'users', _scope(), 'receipts', receipt.id);
  const txRef = doc(_db, 'users', _scope(), 'transactions', txId);
  const patch = receiptTransactionPatch(tx, receipt);
  await Promise.all([
    updateDoc(receiptRef, { matchedTxId: txId, matchedAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    updateDoc(txRef, {
      ...patch,
      receiptIds: arrayUnion(receipt.id),
      receiptId: receipt.id,
      needsReview: false,
      updatedAt: serverTimestamp(),
    }),
  ]);
}

function receiptTransactionPatch(tx = {}, receipt = {}) {
  const category = classifyReceiptCategory(receipt);
  const patch = {};
  if (category && isBlankOrCoupangAliasCategory(tx.category, UNCATEGORIZED_CATEGORY_NAME)) {
    patch.category = category.category;
  }
  if (category?.subcategory && !tx.subcategory && (!tx.category || tx.category === category.category || isBlankOrCoupangAliasCategory(tx.category, UNCATEGORIZED_CATEGORY_NAME))) {
    patch.subcategory = category.subcategory;
  }
  if (category) {
    patch.confidence = Math.max(Number(tx.confidence) || 0, category.confidence);
    patch.autoCategorySource = category.source;
  }
  const memo = buildReceiptMemo(receipt);
  if (memo) {
    patch.memo = mergeReceiptMemo(tx.memo, memo, { replaceExistingSection: false });
    patch.receiptItemSummary = memo;
  }
  if (receipt.merchant && isGenericReceiptMerchant(tx.merchant || tx.counterparty, CLIENT_GENERIC_RECEIPT_MERCHANTS)) {
    patch.merchant = receipt.merchant;
  }
  return patch;
}

// ================================================================
// settlements — 카카오페이 정산
// ================================================================
export async function saveSettlement(settlement) {
  const ref = collection(_db, 'users', _scope(), 'settlements');
  const docRef = await addDoc(ref, { ...settlement, createdAt: serverTimestamp() });
  return docRef.id;
}

export async function listSettlements(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'settlements');
  const conds = [];
  if (opts.from) conds.push(where('occurredAt', '>=', Timestamp.fromDate(opts.from)));
  if (opts.to) conds.push(where('occurredAt', '<=', Timestamp.fromDate(opts.to)));
  const q = query(ref, ...conds, orderBy('occurredAt', 'desc'), limit(opts.max || 100));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ================================================================
// 통계 (월간 합계, 카테고리별)
// ================================================================
export function aggregateByCategory(transactions) {
  const map = {};
  for (const tx of transactions) {
    if (tx.type === 'internal_transfer') continue;
    if (tx.type === 'settlement_in' || tx.type === 'settlement_out') continue;
    if (isBudgetExcluded(tx)) continue;
    const key = displayCategoryName(tx);
    if (!map[key]) map[key] = { name: key, expense: 0, income: 0, count: 0 };
    if (tx.type === 'card_payment' || tx.type === 'transfer_out') {
      map[key].expense += tx.amount;
    } else if (tx.type === 'transfer_in') {
      map[key].income += tx.amount;
    }
    map[key].count += 1;
  }
  return Object.values(map).sort((a, b) => b.expense - a.expense);
}

export function aggregateMonthlyTotals(transactions) {
  let expense = 0, income = 0, settle = 0;
  for (const tx of transactions) {
    if (tx.type === 'internal_transfer') continue;
    if (isBudgetExcluded(tx)) continue;
    if (tx.type === 'settlement_in') settle += tx.amount;
    else if (tx.type === 'settlement_out') settle -= tx.amount;
    else if (tx.type === 'card_payment' || tx.type === 'transfer_out') expense += tx.amount;
    else if (tx.type === 'transfer_in') income += tx.amount;
  }
  return { expense, income, settle };
}

export function isBudgetExcluded(tx) {
  return isBudgetExcludedRule(tx);
}

export function isReimbursementExpected(tx) {
  return isReimbursementExpectedRule(tx);
}

export function isNaverPayTopup(tx) {
  return isNaverPayTopupTx(tx);
}

export function needsPaymentRailReview(tx) {
  return needsPaymentRailReviewRule(tx);
}

export function displayCategoryName(tx) {
  return displayCategoryNameRule(tx, {
    reimbursementCategoryName: REIMBURSEMENT_CATEGORY_NAME,
    uncategorizedCategoryName: UNCATEGORIZED_CATEGORY_NAME,
  });
}

function computeIsLateNight(date) {
  const hour = date?.getHours ? date.getHours() : new Date().getHours();
  return hour >= 22 || hour < 4;
}
