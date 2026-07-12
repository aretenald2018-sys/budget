// ================================================================
// data.js — Firestore CRUD 단일 진입점
//
// 절대규칙:
//   - Firestore API 직접 호출 금지. 이 파일의 export 함수만 사용.
//   - raw_messages는 절대 삭제 금지 (재처리용). 상태만 변경.
// ================================================================

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp, Timestamp, arrayUnion, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import {
  currentUser as _user,
  firestoreDb as _db,
  getCurrentUser,
  getUid,
  initFirebase,
  onAuthChange,
  scope as _scope,
  sessionCache as _cache,
  signIn,
  signOut,
} from './data/core/firebase.js';
import {
  DEV_IDEA_STATUS,
  REIMBURSEMENT_CATEGORY_NAME,
  UNCATEGORIZED_CATEGORY_NAME,
} from './data/constants.js';
import {
  deleteAccount,
  deleteCategory,
  deleteCategorySubcategory,
  getAccountById,
  getAccounts,
  getCategories,
  getCategoryById,
  getCategoryByName,
  loadAccounts as _loadAccounts,
  loadCategories as _loadCategories,
  saveAccount,
  saveCategory,
  saveCategoryBudgetRhythm,
  saveCategoryMonthlyTarget,
  saveCategorySubcategory,
} from './data/repositories/master-data.js';
import { normalizeDate as normalizeTxDate, normalizeParty } from './data/shared/normalize.js';
import { INITIAL_WINES } from './wine-data.js';
import { ASSET_TRACKS } from './utils/market-data.js';
import {
  isNaverPayRailTx,
  isNaverPayTopup as isNaverPayTopupTx,
  isNaverPayTopupPurchasePair,
} from './utils/naverpay.js?v=20260531-naverpay-complete';
import {
  applyTossKimTaewooSelfTransferExclusion,
  isTossKimTaewooSelfTransfer,
} from './utils/self-transfer.js?v=20260701-toss-kim-taewoo';

let _financeMigrationUid = null;
let _financeMigrationPromise = null;
let _financeScenarioPresetUid = null;
let _financeScenarioPresetPromise = null;

export { DEV_IDEA_STATUS, REIMBURSEMENT_CATEGORY_NAME, UNCATEGORIZED_CATEGORY_NAME };
const DEV_IDEA_STATUS_VALUES = new Set(Object.values(DEV_IDEA_STATUS));
const WINE_MIGRATION_VERSION = 'tomatofarm-2026-05-01-v1';
const FINANCE_MIGRATION_VERSION = 'tomatofarm-finance-2026-05-02-v1';
const FINANCE_SCENARIO_PRESET_VERSION = 'tomatofarm-finance-scenarios-2026-05-04-v1';
const STATIC_NEWSFEED_URL = './public/newsfeed/telegram-public-feed.json?v=20260707-newsfeed-digest-clipboard';
const STATIC_NEWSFEED_CACHE_MS = 2 * 60 * 1000;
let _staticNewsfeedSnapshotPromise = null;
let _staticNewsfeedSnapshotFetchedAt = 0;
const FINANCE_SCENARIO_PRESETS = [
  {
    id: 'qqqm-schd-gold-low-2026',
    name: '하방 5.5% · QQQM70/SCHD10/금15/개별5',
    startYear: 2026,
    periodYears: 20,
    annualRate: 5.5,
    inflationRate: 2.5,
    initialPrincipal: 50000000,
    annualContribution: 20000000,
    contributionTiming: 'yearEnd',
    contributionSchedule: [
      { startYear: 2026, endYear: 2031, annualContribution: 20000000 },
      { startYear: 2032, endYear: null, annualContribution: 30000000 },
    ],
    source: 'codex-20260504',
  },
  {
    id: 'qqqm-schd-gold-base-2026',
    name: '기준 8.0% · QQQM70/SCHD10/금15/개별5',
    startYear: 2026,
    periodYears: 20,
    annualRate: 8,
    inflationRate: 2.5,
    initialPrincipal: 50000000,
    annualContribution: 20000000,
    contributionTiming: 'yearEnd',
    contributionSchedule: [
      { startYear: 2026, endYear: 2031, annualContribution: 20000000 },
      { startYear: 2032, endYear: null, annualContribution: 30000000 },
    ],
    source: 'codex-20260504',
  },
  {
    id: 'qqqm-schd-gold-high-2026',
    name: '상방 11.0% · QQQM70/SCHD10/금15/개별5',
    startYear: 2026,
    periodYears: 20,
    annualRate: 11,
    inflationRate: 2.5,
    initialPrincipal: 50000000,
    annualContribution: 20000000,
    contributionTiming: 'yearEnd',
    contributionSchedule: [
      { startYear: 2026, endYear: 2031, annualContribution: 20000000 },
      { startYear: 2032, endYear: null, annualContribution: 30000000 },
    ],
    source: 'codex-20260504',
  },
];
export {
  deleteAccount,
  deleteCategory,
  deleteCategorySubcategory,
  getAccountById,
  getAccounts,
  getCategories,
  getCategoryById,
  getCategoryByName,
  saveAccount,
  saveCategory,
  saveCategoryBudgetRhythm,
  saveCategoryMonthlyTarget,
  saveCategorySubcategory,
};

// ================================================================
// 초기화 + 인증
// ================================================================
export async function initData() {
  await initFirebase(async (user) => {
    if (user) await Promise.all([_loadAccounts(), _loadCategories()]);
  });
}

export { getCurrentUser, getUid, onAuthChange, signIn, signOut };

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
  const normalized = applyTossKimTaewooSelfTransferExclusion(tx);
  const categorized = await applyMerchantCategoryMemory(normalized);
  const sharedPaymentPrepared = await prepareSharedPayment({
    ...categorized,
    isLateNight: computeIsLateNight(normalizeTxDate(categorized?.occurredAt) || new Date()),
    intent: categorized.intent ?? null,
    mood: categorized.mood ?? null,
    reflection: categorized.reflection ?? null,
  });
  const prepared = withoutRewardPointEntry(
    applyTossKimTaewooSelfTransferExclusion(sharedPaymentPrepared)
  );
  const docRef = await addDoc(ref, { ...prepared, createdAt: serverTimestamp() });
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
}

export async function deleteTransaction(txId) {
  const ref = doc(_db, 'users', _scope(), 'transactions', txId);
  await deleteDoc(ref);
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
    return String(entry.id);
  }
  const ref = await addDoc(collection(_db, 'users', _scope(), 'reward_point_entries'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteRewardPointEntry(entryId) {
  const id = String(entryId || '').trim();
  if (!id) throw new Error('포인트 사용 이력을 찾을 수 없습니다.');
  await deleteDoc(doc(_db, 'users', _scope(), 'reward_point_entries', id));
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
  const myAmount = Math.max(1, Math.round(originalAmount / count));
  let ruleId = tx.sharedPayment?.ruleId || null;

  if (opts.rememberRule) {
    ruleId = await saveSharedPaymentRule({
      merchant: tx.merchant || tx.counterparty,
      peopleCount: count,
    });
  }

  await updateTransaction(txId, {
    amount: myAmount,
    needsSharedReview: false,
    needsReview: false,
    sharedPayment: {
      status: 'applied',
      originalAmount,
      peopleCount: count,
      myAmount,
      ruleId,
      appliedAt: new Date().toISOString(),
    },
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
        && sameParty(data.merchant || data.counterparty, tx.merchant || tx.counterparty);
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
  if (rule) return applySharedRule(tx, rule);
  if (shouldSuggestSharedPayment(tx)) {
    return { ...tx, needsReview: true, needsSharedReview: true };
  }
  return tx;
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

function applySharedRule(tx, rule) {
  const originalAmount = Number(tx.sharedPayment?.originalAmount || tx.amount) || 0;
  const peopleCount = Math.max(2, Math.round(Number(rule.peopleCount) || 2));
  const myAmount = Math.max(1, Math.round(originalAmount / peopleCount));
  return {
    ...tx,
    amount: myAmount,
    needsSharedReview: false,
    sharedPayment: {
      status: 'applied',
      originalAmount,
      peopleCount,
      myAmount,
      ruleId: rule.id,
      ruleName: rule.name || null,
      appliedAt: new Date().toISOString(),
    },
  };
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

export async function listNewsfeedItems(opts = {}) {
	try {
		const firestoreItems = await listFirestoreNewsfeedItems(opts);
		if (!shouldFallbackToStaticNewsfeed(firestoreItems, opts)) return firestoreItems;
		const fallbackItems = await listStaticNewsfeedItems(opts).catch(() => null);
		return hasNewsfeedItems(fallbackItems) ? fallbackItems : firestoreItems;
	} catch (err) {
		try {
			const fallbackItems = await listStaticNewsfeedItems(opts);
			if (opts.page) return fallbackItems;
			if (fallbackItems.length) return fallbackItems;
		} catch {
		}
		throw err;
  }
}

async function listFirestoreNewsfeedItems(opts = {}) {
	const max = newsfeedPageSize(opts);
	const fetchMax = opts.sourceId || opts.category ? Math.min(400, Math.max(max * 4, 120)) : max;
	const ref = collection(_db, 'users', _scope(), 'newsfeed_items');
	const cursorDate = newsfeedCursorDate(opts.cursor);
	const q = cursorDate
		? query(ref, orderBy('postedAt', 'desc'), startAfter(Timestamp.fromDate(cursorDate)), limit(fetchMax))
		: query(ref, orderBy('postedAt', 'desc'), limit(fetchMax));
	const snap = await getDocs(q);
	let rows = snap.docs.map(d => normalizeNewsfeedItem({ id: d.id, ...d.data() }));
	if (opts.sourceId) rows = rows.filter(item => item.sourceId === opts.sourceId);
	if (opts.category) rows = rows.filter(item => item.sourceCategory === opts.category);
	rows = rows.filter(item => !item.hidden).slice(0, max);
	return opts.page ? newsfeedPageResult(rows, max) : rows;
}

export async function getTelegramPublicFeedStatus(opts = {}) {
  let firestoreStatus = null;
  try {
    const ref = doc(_db, 'users', _scope(), 'integrations', 'telegram_public_feed');
    const snap = await getDoc(ref);
    if (snap.exists()) firestoreStatus = { id: snap.id, ...snap.data() };
  } catch {
  }
  const fallback = await loadStaticNewsfeedSnapshot(opts).catch(() => null);
  if (!fallback) return firestoreStatus;
  const staticStatus = normalizeStaticNewsfeedStatus(fallback);
  const firestoreCount = Number(firestoreStatus?.itemCount || 0);
  return staticStatus.itemCount > firestoreCount ? staticStatus : firestoreStatus || staticStatus;
}

export async function getNewsfeedDigestSnapshot(opts = {}) {
	const snapshot = await loadStaticNewsfeedSnapshot(opts);
	const items = Array.isArray(snapshot?.items)
		? snapshot.items
			.map(normalizeNewsfeedItem)
			.filter(item => !item.hidden)
			.sort(compareNewsfeedItems)
		: [];
	return {
		sourceType: snapshot?.sourceType || 'telegram_public_static',
		sourceVersion: snapshot?.sourceVersion || '',
		generatedAt: snapshot?.generatedAt || null,
		since: snapshot?.since || null,
		sourceCount: Number(snapshot?.sourceCount || 0),
		fetched: Number(snapshot?.fetched || 0),
		failed: Number(snapshot?.failed || 0),
		maxPages: Number(snapshot?.maxPages || 0),
		itemLimit: Number(snapshot?.itemLimit || 0),
		truncated: !!snapshot?.truncated,
		pagesFetched: Number(snapshot?.pagesFetched || 0),
		backfillComplete: snapshot?.backfillComplete ?? null,
		sources: Array.isArray(snapshot?.sources) ? snapshot.sources : [],
		snapshotTotal: Array.isArray(snapshot?.items) ? snapshot.items.length : 0,
		items,
	};
}

export async function saveUrge(urge) {
  const ref = collection(_db, 'users', _scope(), 'urges');
  const payload = {
    what: urge.what || '',
    estimatedPrice: Math.max(0, Math.round(Number(urge.estimatedPrice) || 0)),
    desireType: urge.desireType || 'buy',
    originalPortion: urge.originalPortion || null,
    plannedPortion: urge.plannedPortion || null,
    category: urge.category || null,
    mood: urge.mood || null,
    context: urge.context || null,
    alternatives: urge.alternatives || [],
    status: urge.status || 'pending',
    chosenAlternativeId: urge.chosenAlternativeId || null,
    resolvedAt: urge.resolvedAt || null,
    txId: urge.txId || null,
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(ref, payload);
  return docRef.id;
}

export async function updateUrge(urgeId, patch) {
  const ref = doc(_db, 'users', _scope(), 'urges', urgeId);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

export async function getUrge(urgeId) {
  const ref = doc(_db, 'users', _scope(), 'urges', urgeId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listUrges(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'urges');
  const conds = [];
  if (opts.status) conds.push(where('status', '==', opts.status));
  try {
    const q = query(ref, ...conds, orderBy('createdAt', 'desc'), limit(opts.max || 50));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (!opts.status || err.code !== 'failed-precondition') throw err;
    const snap = await getDocs(query(ref, orderBy('createdAt', 'desc'), limit((opts.max || 50) * 3)));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(item => item.status === opts.status)
      .slice(0, opts.max || 50);
  }
}

export async function saveMindbankEntry(entry) {
  const ref = collection(_db, 'users', _scope(), 'mindbank');
  const payload = {
    urgeId: entry.urgeId || null,
    urgeWhat: entry.urgeWhat || '',
    urgePrice: Math.max(0, Math.round(Number(entry.urgePrice) || 0)),
    desireType: entry.desireType || null,
    choiceType: entry.choiceType || 'substitute',
    choiceTitle: entry.choiceTitle || '',
    choiceDesc: entry.choiceDesc || '',
    routineTitle: entry.routineTitle || '',
    routineDesc: entry.routineDesc || '',
    savedAmount: Math.max(0, Math.round(Number(entry.savedAmount) || 0)),
    savedKcal: Math.max(0, Math.round(Number(entry.savedKcal) || 0)),
    calorieMeta: entry.calorieMeta || null,
    badges: entry.badges || [],
    reminderAt: entry.reminderAt || null,
    pactId: entry.pactId || null,
    pactTitle: entry.pactTitle || '',
    pactStatus: entry.pactStatus || null,
    mood: entry.mood || null,
    category: entry.category || null,
    occurredAt: entry.occurredAt ? Timestamp.fromDate(normalizeTxDate(entry.occurredAt)) : serverTimestamp(),
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(ref, payload);
  return docRef.id;
}

export async function listMindbankEntries(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'mindbank');
  const conds = [];
  if (opts.from) conds.push(where('occurredAt', '>=', Timestamp.fromDate(opts.from)));
  if (opts.to) conds.push(where('occurredAt', '<=', Timestamp.fromDate(opts.to)));
  const q = query(ref, ...conds, orderBy('occurredAt', 'desc'), limit(opts.max || 100));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteMindbankEntry(entryId) {
  const ref = doc(_db, 'users', _scope(), 'mindbank', entryId);
  await deleteDoc(ref);
}

// ================================================================
// personal backlog — dev ideas
// ================================================================
export async function listDevIdeas(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'dev_ideas');
  const q = query(ref, orderBy('createdAt', 'desc'), limit(opts.max || 30));
  const snap = await getDocs(q);
  return snap.docs.map(d => normalizeDevIdea({ id: d.id, ...d.data() }));
}

export async function saveDevIdea(idea) {
  const status = normalizeDevIdeaStatus(idea.status, idea.done);
  const payload = {
    title: String(idea.title || '').trim(),
    note: String(idea.note || '').trim(),
    status,
    done: status === DEV_IDEA_STATUS.DONE,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (!payload.title) throw new Error('아이디어 내용을 입력해 주세요.');
  const docRef = await addDoc(collection(_db, 'users', _scope(), 'dev_ideas'), payload);
  return docRef.id;
}

export async function updateDevIdea(ideaId, patch) {
  const payload = { ...patch, updatedAt: serverTimestamp() };
  if ('title' in payload) payload.title = String(payload.title || '').trim();
  if ('note' in payload) payload.note = String(payload.note || '').trim();
  if ('status' in payload) {
    payload.status = normalizeDevIdeaStatus(payload.status, payload.done);
    payload.done = payload.status === DEV_IDEA_STATUS.DONE;
    if (payload.status === DEV_IDEA_STATUS.RUNNING) payload.startedAt = serverTimestamp();
    if (payload.status === DEV_IDEA_STATUS.DONE) payload.completedAt = serverTimestamp();
    if (payload.status === DEV_IDEA_STATUS.PENDING) {
      payload.startedAt = null;
      payload.completedAt = null;
      payload.failedAt = null;
      payload.lastError = null;
    }
  } else if ('done' in payload) {
    payload.done = !!payload.done;
    payload.status = payload.done ? DEV_IDEA_STATUS.DONE : DEV_IDEA_STATUS.PENDING;
    payload.completedAt = payload.done ? serverTimestamp() : null;
    if (!payload.done) {
      payload.startedAt = null;
      payload.failedAt = null;
      payload.lastError = null;
    }
  }
  await updateDoc(doc(_db, 'users', _scope(), 'dev_ideas', ideaId), payload);
}

export async function deleteDevIdea(ideaId) {
  await deleteDoc(doc(_db, 'users', _scope(), 'dev_ideas', ideaId));
}

function normalizeDevIdea(idea) {
  const status = normalizeDevIdeaStatus(idea.status, idea.done);
  return {
    ...idea,
    status,
    done: status === DEV_IDEA_STATUS.DONE,
  };
}

function normalizeDevIdeaStatus(status, done = false) {
  const value = String(status || '').trim();
  if (DEV_IDEA_STATUS_VALUES.has(value)) return value;
  return done ? DEV_IDEA_STATUS.DONE : DEV_IDEA_STATUS.PENDING;
}

// ================================================================
// app settings — local UX preferences backed by Firestore
// ================================================================
const DEFAULT_APP_SETTINGS = {
  theme: 'dark',
  planSegment: 'want',
  homeManagedCategoryIds: [],
  biweeklyStartDate: '',
  rewardSavings: {
    enabled: true,
    lookbackDays: 180,
    allocationRate: 0.3,
    pointRates: {
      winePurchase: 0.3,
      premiumIngredients: 0,
      travelFund: 0,
    },
    pointItems: [
      { id: 'winePurchase', label: '와인구매 포인트', rate: 0.3, targetAmount: 120000, enabled: true, order: 10 },
      { id: 'premiumIngredients', label: '고급재료 포인트', rate: 0, targetAmount: 80000, enabled: true, order: 20 },
      { id: 'travelFund', label: '여행충당 포인트', rate: 0, targetAmount: 200000, enabled: true, order: 30 },
    ],
    baselineMethod: 'trimmed_weekly',
    dailyReward: {
      enabled: true,
      selectedDateKey: '',
      selectedRuleId: '',
      focusBucketKey: '',
      bonusRate: 0.1,
      bonusCap: 5000,
      freezeCount: 1,
      streakDays: 0,
      tierLabel: '브론즈 1단계',
    },
  },
};

export async function getAppSettings() {
  if (_cache.appSettings) return cloneAppSettings(_cache.appSettings);
  if (_cache.appSettingsPromise) return _cache.appSettingsPromise;
  const ref = doc(_db, 'users', _scope(), 'settings', 'app');
  _cache.appSettingsPromise = getDoc(ref)
    .then(snap => {
      const settings = normalizeAppSettings(snap.exists() ? snap.data() : {});
      _cache.appSettings = settings;
      return cloneAppSettings(settings);
    })
    .finally(() => {
      _cache.appSettingsPromise = null;
    });
  return _cache.appSettingsPromise;
}

export async function saveAppSettings(patch = {}) {
  const payload = normalizeAppSettings(patch, { partial: true });
  await setDoc(doc(_db, 'users', _scope(), 'settings', 'app'), {
    ...payload,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  _cache.appSettings = null;
  _cache.appSettingsPromise = null;
  return payload;
}

function cloneAppSettings(settings) {
  return {
    ...settings,
    homeManagedCategoryIds: Array.isArray(settings?.homeManagedCategoryIds)
      ? settings.homeManagedCategoryIds.slice()
      : [],
    rewardSavings: normalizeRewardSavingsSettings(settings?.rewardSavings),
  };
}

function normalizeAppSettings(value = {}, opts = {}) {
  const base = opts.partial ? {} : { ...DEFAULT_APP_SETTINGS };
  if (!opts.partial || 'theme' in value) {
    const theme = String(value.theme || '').toLowerCase();
    base.theme = ['light', 'dark', 'system'].includes(theme) ? theme : DEFAULT_APP_SETTINGS.theme;
  }
  if (!opts.partial || 'planSegment' in value) {
    const segment = String(value.planSegment || '').toLowerCase();
    base.planSegment = ['want', 'do', 'bank'].includes(segment) ? segment : DEFAULT_APP_SETTINGS.planSegment;
  }
  if (!opts.partial || 'homeManagedCategoryIds' in value) {
    base.homeManagedCategoryIds = Array.isArray(value.homeManagedCategoryIds)
      ? value.homeManagedCategoryIds.map(id => String(id || '').trim()).filter(Boolean).slice(0, 8)
      : DEFAULT_APP_SETTINGS.homeManagedCategoryIds;
  }
  if (!opts.partial || 'biweeklyStartDate' in value) {
    base.biweeklyStartDate = normalizeISODate(value.biweeklyStartDate);
  }
  if (!opts.partial || 'rewardSavings' in value) {
    base.rewardSavings = normalizeRewardSavingsSettings(value.rewardSavings);
  }
  return base;
}

function normalizeRewardSavingsSettings(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const allocation = Number(src.allocationRate);
  const lookback = Math.round(Number(src.lookbackDays) || DEFAULT_APP_SETTINGS.rewardSavings.lookbackDays);
  const baselineMethod = String(src.baselineMethod || DEFAULT_APP_SETTINGS.rewardSavings.baselineMethod);
  const legacyRate = Number.isFinite(allocation)
    ? Math.min(1, Math.max(0, allocation > 1 ? allocation / 100 : allocation))
    : DEFAULT_APP_SETTINGS.rewardSavings.allocationRate;
  const pointItems = normalizeRewardPointItems(src.pointItems, src.pointRates, legacyRate);
  const pointRates = pointRatesFromItems(pointItems);
  return {
    enabled: src.enabled !== false && src.enabled !== 'false',
    lookbackDays: [90, 180, 365].includes(lookback) ? lookback : DEFAULT_APP_SETTINGS.rewardSavings.lookbackDays,
    allocationRate: pointRates.winePurchase ?? pointItems[0]?.rate ?? legacyRate,
    pointRates,
    pointItems,
    baselineMethod: ['trimmed_weekly', 'simple_daily'].includes(baselineMethod) ? baselineMethod : DEFAULT_APP_SETTINGS.rewardSavings.baselineMethod,
    dailyReward: normalizeDailyRewardSettings(src.dailyReward),
  };
}

function normalizeDailyRewardSettings(value = {}) {
  const src = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_APP_SETTINGS.rewardSavings.dailyReward;
  return {
    enabled: src.enabled !== false && src.enabled !== 'false',
    selectedDateKey: normalizeISODate(src.selectedDateKey),
    selectedRuleId: String(src.selectedRuleId || '').trim().slice(0, 32),
    focusBucketKey: normalizeRewardFocusKey(src.focusBucketKey),
    bonusRate: normalizeRewardRate(src.bonusRate, defaults.bonusRate),
    bonusCap: normalizeRewardTargetAmount(src.bonusCap, defaults.bonusCap),
    freezeCount: clampInteger(src.freezeCount, 0, 12, defaults.freezeCount),
    streakDays: clampInteger(src.streakDays, 0, 999, defaults.streakDays),
    tierLabel: String(src.tierLabel || defaults.tierLabel).trim().slice(0, 24),
  };
}

function normalizeRewardPointRates(value = {}, legacyWineRate = DEFAULT_APP_SETTINGS.rewardSavings.allocationRate) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    winePurchase: normalizeRewardRate(src.winePurchase, legacyWineRate),
    premiumIngredients: normalizeRewardRate(src.premiumIngredients, DEFAULT_APP_SETTINGS.rewardSavings.pointRates.premiumIngredients),
    travelFund: normalizeRewardRate(src.travelFund, DEFAULT_APP_SETTINGS.rewardSavings.pointRates.travelFund),
  };
}

function normalizeRewardRate(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const ratio = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, ratio));
}

function normalizeRewardPointItems(value, legacyPointRates = {}, legacyWineRate = DEFAULT_APP_SETTINGS.rewardSavings.allocationRate) {
  const defaultItems = DEFAULT_APP_SETTINGS.rewardSavings.pointItems;
  const legacyRates = normalizeRewardPointRates(legacyPointRates, legacyWineRate);
  const sourceItems = Array.isArray(value)
    ? value
    : defaultItems.map(item => ({
        ...item,
        rate: legacyRates[item.id] ?? item.rate,
      }));
  const used = new Set();
  return sourceItems
    .map((item, index) => normalizeRewardPointItem(item, index, legacyRates, used))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function normalizeRewardPointItem(item = {}, index = 0, legacyRates = {}, used = new Set()) {
  const fallback = DEFAULT_APP_SETTINGS.rewardSavings.pointItems[index] || {};
  const rawId = normalizeRewardPointItemId(item.id || fallback.id || `customPoint${index + 1}`);
  const id = uniqueRewardPointItemId(rawId, used);
  const label = String(item.label || item.name || fallback.label || `포인트 ${index + 1}`).trim().slice(0, 32);
  const fallbackRate = legacyRates[id] ?? legacyRates[fallback.id] ?? fallback.rate ?? 0;
  const fallbackTarget = fallback.targetAmount ?? 100000;
  return {
    id,
    label: label || `포인트 ${index + 1}`,
    rate: normalizeRewardRate(item.rate ?? legacyRates[id], fallbackRate),
    targetAmount: normalizeRewardTargetAmount(item.targetAmount, fallbackTarget),
    enabled: item.enabled !== false && item.enabled !== 'false',
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : (index + 1) * 10,
  };
}

function normalizeRewardPointItemId(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48);
  return normalized || 'customPoint';
}

function normalizeRewardFocusKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48);
}

function uniqueRewardPointItemId(base, used) {
  let id = base || 'customPoint';
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function normalizeRewardTargetAmount(value, fallback = 100000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.max(0, Math.round(Number(fallback) || 0));
  return Math.min(999999999, Math.max(0, Math.round(n)));
}

function clampInteger(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pointRatesFromItems(items = []) {
  return Object.fromEntries((Array.isArray(items) ? items : []).map(item => [item.id, item.rate]));
}

// ================================================================
// pacts — future-self commitments for 소계획/하고픈 것
// ================================================================
export async function listPacts(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'pacts');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc'), limit(opts.max || 100)));
  return snap.docs.map(d => normalizePact({ id: d.id, ...d.data() }));
}

export async function savePact(pact) {
  const payload = preparePactPayload(pact);
  if (pact.id) {
    await setDoc(doc(_db, 'users', _scope(), 'pacts', pact.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return pact.id;
  }
  const ref = await addDoc(collection(_db, 'users', _scope(), 'pacts'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePact(pactId, patch) {
  await setDoc(doc(_db, 'users', _scope(), 'pacts', pactId), {
    ...preparePactPayload(patch, { partial: true }),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function deletePact(pactId) {
  await deleteDoc(doc(_db, 'users', _scope(), 'pacts', pactId));
}

function preparePactPayload(pact = {}, opts = {}) {
  const payload = {};
  if (!opts.partial || 'what' in pact || 'title' in pact) payload.what = normalizePactWhat(pact.what || pact);
  if (!opts.partial || 'trigger' in pact) payload.trigger = normalizePactTrigger(pact.trigger || {});
  if (!opts.partial || 'cost' in pact) payload.cost = normalizePactCost(pact.cost || pact);
  if (!opts.partial || 'signature' in pact) payload.signature = normalizePactSignature(pact.signature || pact);
  if (!opts.partial || 'status' in pact) payload.status = normalizePactStatus(pact.status);
  if (!opts.partial || 'linkedCartItemId' in pact) payload.linkedCartItemId = String(pact.linkedCartItemId || '').trim();
  if (!opts.partial || 'linkedUrgeId' in pact) payload.linkedUrgeId = String(pact.linkedUrgeId || '').trim();
  if (!opts.partial || 'parentPactId' in pact) payload.parentPactId = String(pact.parentPactId || '').trim();
  if (!opts.partial || 'fulfilledTxId' in pact) payload.fulfilledTxId = String(pact.fulfilledTxId || '').trim();
  if (!opts.partial || 'conditions' in pact) payload.conditions = normalizePactConditions(pact.conditions);
  if (!opts.partial || 'sourceUrl' in pact) payload.sourceUrl = String(pact.sourceUrl || pact.url || '').trim();
  if (!opts.partial || 'evidence' in pact) payload.evidence = Array.isArray(pact.evidence) ? pact.evidence.map(String).slice(0, 12) : [];
  if ('fulfilledAt' in pact) payload.fulfilledAt = normalizeTimestampLike(pact.fulfilledAt);
  if ('brokenAt' in pact) payload.brokenAt = normalizeTimestampLike(pact.brokenAt);
  if ('brokenReason' in pact) payload.brokenReason = String(pact.brokenReason || '').trim().slice(0, 300);
  return payload;
}

function normalizePact(value = {}) {
  return {
    ...value,
    what: normalizePactWhat(value.what || value),
    trigger: normalizePactTrigger(value.trigger || {}),
    cost: normalizePactCost(value.cost || {}),
    signature: normalizePactSignature(value.signature || {}),
    status: normalizePactStatus(value.status),
    linkedCartItemId: String(value.linkedCartItemId || '').trim(),
    linkedUrgeId: String(value.linkedUrgeId || '').trim(),
    parentPactId: String(value.parentPactId || '').trim(),
    fulfilledTxId: String(value.fulfilledTxId || '').trim(),
    conditions: normalizePactConditions(value.conditions),
    sourceUrl: String(value.sourceUrl || value.url || '').trim(),
    evidence: Array.isArray(value.evidence) ? value.evidence.map(String) : [],
  };
}

function normalizePactConditions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((condition, index) => {
    const type = String(condition?.type || 'amount').toLowerCase();
    const id = String(condition?.id || `cond_${index}`).trim();
    const label = String(condition?.label || condition?.name || '').trim();
    if (!label) return null;
    return {
      id,
      type: ['amount', 'check', 'date', 'diet', 'number'].includes(type) ? type : 'amount',
      label: label.slice(0, 80),
      current: Math.max(0, Number(condition?.current) || 0),
      target: Math.max(0, Number(condition?.target) || 0),
      unit: String(condition?.unit || '').trim().slice(0, 16),
      done: !!condition?.done,
      dueDate: String(condition?.dueDate || condition?.date || '').trim().slice(0, 24),
      note: String(condition?.note || '').trim().slice(0, 160),
    };
  }).filter(Boolean);
}

function normalizePactWhat(value = {}) {
  const category = String(value.category || value.whatCategory || 'purchase').toLowerCase();
  return {
    title: String(value.title || '').trim() || '이름 없는 약속',
    emoji: String(value.emoji || pactEmoji(category)).trim().slice(0, 4),
    category: ['purchase', 'experience', 'action', 'relation', 'restraint'].includes(category) ? category : 'purchase',
    cost: Math.max(0, Math.round(Number(value.cost ?? value.price) || 0)),
    note: String(value.note || '').trim().slice(0, 500),
    sourceUrl: String(value.sourceUrl || value.url || '').trim(),
    imageUrl: String(value.imageUrl || '').trim(),
    originalImageUrl: String(value.originalImageUrl || '').trim(),
    visualMode: normalizeCartVisualMode(value.visualMode),
    visualCredit: String(value.visualCredit || '').trim().slice(0, 160),
    visualQuery: String(value.visualQuery || '').trim().slice(0, 120),
  };
}

function normalizePactTrigger(value = {}) {
  const type = String(value.type || 'manual').toLowerCase();
  const config = value.config && typeof value.config === 'object' ? value.config : value;
  return {
    type: ['time', 'savings', 'streak', 'measure', 'event', 'manual'].includes(type) ? type : 'manual',
    config: normalizePactTriggerConfig(type, config),
    progress: Math.max(0, Math.min(1, Number(value.progress) || 0)),
  };
}

function normalizePactTriggerConfig(type, config = {}) {
  if (type === 'time') return {
    date: String(config.date || '').slice(0, 10),
    recurrence: ['none', 'daily', 'weekly', 'monthly'].includes(config.recurrence) ? config.recurrence : 'none',
  };
  if (type === 'savings') return {
    targetAmount: Math.max(0, Math.round(Number(config.targetAmount) || 0)),
    currentAmount: Math.max(0, Math.round(Number(config.currentAmount) || 0)),
  };
  if (type === 'streak') return {
    metric: String(config.metric || '습관').trim().slice(0, 40),
    count: Math.max(1, Math.round(Number(config.count) || 1)),
    currentCount: Math.max(0, Math.round(Number(config.currentCount) || 0)),
    of: ['days', 'occurrences'].includes(config.of) ? config.of : 'days',
  };
  if (type === 'measure') return {
    metric: String(config.metric || 'weight').trim().slice(0, 40),
    op: ['<=', '>='].includes(config.op) ? config.op : '<=',
    value: Number(config.value) || 0,
    currentValue: Number(config.currentValue) || 0,
    unit: String(config.unit || '').trim().slice(0, 12),
  };
  if (type === 'event') return {
    eventName: String(config.eventName || '이벤트').trim().slice(0, 80),
    done: !!config.done,
  };
  return { manual: true, done: !!config.done };
}

function normalizePactCost(value = {}) {
  const source = String(value.source || value.costSource || 'budget').toLowerCase();
  return {
    source: ['budget', 'mindbank', 'envelope', 'external'].includes(source) ? source : 'budget',
    envelopeId: String(value.envelopeId || '').trim(),
    accruedAmount: Math.max(0, Math.round(Number(value.accruedAmount) || 0)),
  };
}

function normalizePactSignature(value = {}) {
  return {
    message: String(value.message || '').trim().slice(0, 280),
    cooloffHours: Math.max(0, Math.round(Number(value.cooloffHours) || 24)),
  };
}

function normalizePactStatus(status) {
  const value = String(status || 'active').toLowerCase();
  return ['draft', 'active', 'ripening', 'ready', 'fulfilled', 'broken', 'archived'].includes(value) ? value : 'active';
}

function normalizeTimestampLike(value) {
  if (!value) return null;
  if (value instanceof Date || value?.toDate || value?.seconds) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function pactEmoji(category) {
  if (category === 'experience') return '🌅';
  if (category === 'action') return '🎯';
  if (category === 'relation') return '💝';
  if (category === 'restraint') return '🚫';
  return '🛍';
}

// ================================================================
// finance direction — long-term goals and snapshots
// ================================================================
export async function listFinanceGoals(opts = {}) {
  await ensureFinanceMigration();
  await ensureFinanceScenarioPresets();
  const ref = collection(_db, 'users', _scope(), 'finance_goals');
  const q = query(ref, orderBy('createdAt', 'asc'), limit(opts.max || 20));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveFinanceGoal(goal) {
  const payload = prepareFinanceGoalPayload(goal);
  if (goal.id) {
    const ref = doc(_db, 'users', _scope(), 'finance_goals', goal.id);
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    return goal.id;
  }
  const ref = collection(_db, 'users', _scope(), 'finance_goals');
  const docRef = await addDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return docRef.id;
}

export async function listFinanceSnapshots(opts = {}) {
  await ensureFinanceMigration();
  const ref = collection(_db, 'users', _scope(), 'finance_snapshots');
  const q = query(ref, orderBy('year', 'desc'), limit(opts.max || 20));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function saveFinanceSnapshot(snapshot) {
  const payload = {
    year: Math.round(Number(snapshot.year) || new Date().getFullYear()),
    month: snapshot.month ? Math.max(1, Math.min(12, Math.round(Number(snapshot.month)))) : null,
    cumulativeSaved: Math.max(0, Math.round(Number(snapshot.cumulativeSaved) || 0)),
    netWorth: Math.max(0, Math.round(Number(snapshot.netWorth) || 0)),
    emergencyFund: Math.max(0, Math.round(Number(snapshot.emergencyFund) || 0)),
    monthlyExpense: Math.max(0, Math.round(Number(snapshot.monthlyExpense) || 0)),
    inflow: Math.max(0, Math.round(Number(snapshot.inflow) || 0)),
    fixedOutflow: Math.max(0, Math.round(Number(snapshot.fixedOutflow) || 0)),
  };
  if (snapshot.id) {
    const ref = doc(_db, 'users', _scope(), 'finance_snapshots', snapshot.id);
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    return snapshot.id;
  }
  const ref = collection(_db, 'users', _scope(), 'finance_snapshots');
  const docRef = await addDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return docRef.id;
}

export async function listFinanceBenchmarks(opts = {}) {
  await ensureFinanceMigration();
  await ensureFinanceScenarioPresets();
  const ref = collection(_db, 'users', _scope(), 'finance_benchmarks');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'asc'), limit(opts.max || 50)));
  return snap.docs.map(d => normalizeFinanceBenchmark({ id: d.id, ...d.data() }));
}

export async function saveFinanceBenchmark(item) {
  const contributionSchedule = normalizeContributionSchedulePayload(item.contributionSchedule);
  const payload = {
    name: item.name || '투자 시뮬레이션',
    startYear: Math.round(Number(item.startYear) || new Date().getFullYear()),
    periodYears: Math.max(1, Math.round(Number(item.periodYears) || 10)),
    annualRate: Number(item.annualRate) || 0,
    inflationRate: Number(item.inflationRate) || 0,
    initialPrincipal: Math.max(0, Math.round(Number(item.initialPrincipal) || 0)),
    annualContribution: Math.max(0, Math.round(Number(item.annualContribution) || 0)),
    contributionTiming: contributionSchedule.length ? 'yearEnd' : (item.contributionTiming || 'monthly'),
    contributionSchedule,
    amountUnit: 'krw',
    source: item.source || 'budgetproject',
  };
  if (item.id) {
    await setDoc(doc(_db, 'users', _scope(), 'finance_benchmarks', item.id), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    return item.id;
  }
  const docRef = await addDoc(collection(_db, 'users', _scope(), 'finance_benchmarks'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return docRef.id;
}

export async function deleteFinanceBenchmark(id) {
  await deleteDoc(doc(_db, 'users', _scope(), 'finance_benchmarks', id));
}

export async function listFinancePlans(opts = {}) {
  await ensureFinanceMigration();
  const ref = collection(_db, 'users', _scope(), 'finance_plans');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'asc'), limit(opts.max || 50)));
  return snap.docs.map(d => normalizeFinancePlan({ id: d.id, ...d.data() }));
}

export async function saveFinancePlan(plan) {
  const payload = {
    name: plan.name || '계획선',
    entries: (plan.entries || [])
      .map(entry => ({
        year: Math.round(Number(entry.year) || 0),
        target: Math.max(0, Math.round(Number(entry.target) || 0)),
      }))
      .filter(entry => entry.year && entry.target),
    amountUnit: 'krw',
    source: plan.source || 'budgetproject',
  };
  if (plan.id) {
    await setDoc(doc(_db, 'users', _scope(), 'finance_plans', plan.id), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    return plan.id;
  }
  const docRef = await addDoc(collection(_db, 'users', _scope(), 'finance_plans'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return docRef.id;
}

export async function deleteFinancePlan(id) {
  await deleteDoc(doc(_db, 'users', _scope(), 'finance_plans', id));
}

export async function listFinanceActuals(opts = {}) {
  await ensureFinanceMigration();
  const ref = collection(_db, 'users', _scope(), 'finance_actuals');
  const snap = await getDocs(query(ref, orderBy('year', 'asc'), limit(opts.max || 50)));
  return snap.docs.map(d => normalizeFinanceActual({ id: d.id, ...d.data() }));
}

export async function saveFinanceActual(actual) {
  const payload = {
    year: Math.round(Number(actual.year) || new Date().getFullYear()),
    cumulativeSaved: Math.max(0, Math.round(Number(actual.cumulativeSaved) || 0)),
    netWorth: Math.max(0, Math.round(Number(actual.netWorth) || 0)),
    emergencyFund: Math.max(0, Math.round(Number(actual.emergencyFund) || 0)),
    monthlyExpense: Math.max(0, Math.round(Number(actual.monthlyExpense) || 0)),
    inflow: Math.max(0, Math.round(Number(actual.inflow) || 0)),
    fixedOutflow: Math.max(0, Math.round(Number(actual.fixedOutflow) || 0)),
    amountUnit: 'krw',
    source: actual.source || 'budgetproject',
  };
  if (actual.id) {
    await setDoc(doc(_db, 'users', _scope(), 'finance_actuals', actual.id), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    return actual.id;
  }
  const docRef = await addDoc(collection(_db, 'users', _scope(), 'finance_actuals'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return docRef.id;
}

export async function deleteFinanceActual(id) {
  await deleteDoc(doc(_db, 'users', _scope(), 'finance_actuals', id));
}

export async function listFinanceAssetTracks(opts = {}) {
  await ensureFinanceMigration();
  const ref = collection(_db, 'users', _scope(), 'finance_asset_tracks');
  const snap = await getDocs(query(ref, orderBy('order', 'asc'), limit(opts.max || 50)));
  if (snap.empty) {
    await Promise.all(ASSET_TRACKS.map((track, idx) => setDoc(doc(ref, track.id), {
      ...normalizeFinanceAssetTrack({ ...track, order: idx + 1 }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true })));
    return ASSET_TRACKS.map((track, idx) => normalizeFinanceAssetTrack({ ...track, id: track.id, order: idx + 1 }));
  }
  return snap.docs.map(d => normalizeFinanceAssetTrack({ id: d.id, ...d.data() }));
}

export async function saveFinanceAssetTrack(track) {
  const payload = normalizeFinanceAssetTrack(track);
  if (track.id) {
    await setDoc(doc(_db, 'users', _scope(), 'finance_asset_tracks', track.id), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    return track.id;
  }
  const ref = await addDoc(collection(_db, 'users', _scope(), 'finance_asset_tracks'), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function deleteFinanceAssetTrack(id) {
  await deleteDoc(doc(_db, 'users', _scope(), 'finance_asset_tracks', id));
}

function normalizeFinanceBenchmark(item) {
  const multiplier = item.amountUnit === 'krw' ? 1 : 10000;
  return {
    ...item,
    initialPrincipal: Math.round(Number(item.initialPrincipal) || 0) * multiplier,
    annualContribution: Math.round(Number(item.annualContribution) || 0) * multiplier,
    contributionSchedule: normalizeContributionSchedulePayload(item.contributionSchedule, multiplier),
    contributionTiming: item.contributionTiming || ((item.contributionSchedule || []).length ? 'yearEnd' : 'monthly'),
  };
}

function normalizeFinancePlan(plan) {
  const multiplier = plan.amountUnit === 'krw' ? 1 : 10000;
  return {
    ...plan,
    entries: (plan.entries || []).map(entry => ({
      year: Math.round(Number(entry.year) || 0),
      target: Math.round(Number(entry.target) || 0) * multiplier,
    })).filter(entry => entry.year && entry.target),
  };
}

function normalizeFinanceActual(actual) {
  const multiplier = actual.amountUnit === 'krw' ? 1 : 10000;
  return {
    ...actual,
    cumulativeSaved: Math.round(Number(actual.cumulativeSaved) || 0) * multiplier,
    netWorth: Math.round(Number(actual.netWorth) || 0) * multiplier,
    emergencyFund: Math.round(Number(actual.emergencyFund) || 0) * multiplier,
    monthlyExpense: Math.round(Number(actual.monthlyExpense) || 0) * multiplier,
    inflow: Math.round(Number(actual.inflow) || 0) * multiplier,
    fixedOutflow: Math.round(Number(actual.fixedOutflow ?? actual.fOutflow) || 0) * multiplier,
  };
}

function normalizeFinanceAssetTrack(track = {}) {
  const normalized = {
    name: track.name || '자산 트랙',
    role: track.role || '',
    desc: track.desc || '',
    principal: Math.max(0, Math.round(Number(track.principal) || 0)),
    currentValue: Math.max(0, Math.round(Number(track.currentValue) || 0)),
    order: Math.round(Number(track.order) || 99),
    holdings: (track.holdings || []).map(normalizeHolding).filter(item => item.symbol),
    source: track.source || 'budgetproject',
  };
  if (track.id) normalized.id = track.id;
  return normalized;
}

function normalizeHolding(item = {}) {
  const market = String(item.market || '').toUpperCase() === 'US' ? 'US' : 'KR';
  const currency = item.currency || (market === 'US' ? 'USD' : 'KRW');
  return {
    symbol: String(item.symbol || '').trim().toUpperCase(),
    name: item.name || String(item.symbol || '').trim().toUpperCase(),
    market,
    currency,
    quantity: Math.max(0, Number(item.quantity ?? item.qty) || 0),
    avgPrice: Math.max(0, Number(item.avgPrice) || 0),
    avgFx: Math.max(0, Number(item.avgFx) || 0),
    purchaseDate: normalizeISODate(item.purchaseDate),
    broker: String(item.broker || '').trim(),
    currentValueKRW: Math.max(0, Math.round(Number(item.currentValueKRW) || 0)),
    principalKRW: Math.max(0, Math.round(Number(item.principalKRW) || 0)),
    profitKRW: Math.round(Number(item.profitKRW) || 0),
    returnPct: Number.isFinite(Number(item.returnPct)) ? Number(item.returnPct) : null,
    assetClass: String(item.assetClass || '').trim(),
    avgPriceMode: String(item.avgPriceMode || '').trim(),
    source: String(item.source || '').trim(),
    snapshotAt: normalizeISODate(item.snapshotAt),
  };
}

function normalizeISODate(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function prepareFinanceGoalPayload(goal = {}) {
  return {
    name: goal.name || '장기 목표',
    targetAmount: Math.max(0, Math.round(Number(goal.targetAmount) || 0)),
    targetYear: Math.round(Number(goal.targetYear) || new Date().getFullYear() + 5),
    startAmount: Math.max(0, Math.round(Number(goal.startAmount) || 0)),
    annualRate: Number(goal.annualRate) || 0,
    inflationRate: Number(goal.inflationRate) || 0,
    monthlyContributionTarget: Math.max(0, Math.round(Number(goal.monthlyContributionTarget) || 0)),
    heroBasisType: ['goal', 'scenario'].includes(goal.heroBasisType) ? goal.heroBasisType : 'goal',
    heroBenchmarkId: goal.heroBenchmarkId || null,
    source: goal.source || 'budgetproject',
    active: goal.active !== false,
  };
}

async function ensureFinanceMigration() {
  const uid = _scope();
  if (_financeMigrationUid === uid && _financeMigrationPromise) return _financeMigrationPromise;
  _financeMigrationUid = uid;
  _financeMigrationPromise = runFinanceMigrationEnsure(uid).catch(err => {
    if (_financeMigrationUid === uid) _financeMigrationPromise = null;
    throw err;
  });
  return _financeMigrationPromise;
}

async function runFinanceMigrationEnsure(uid) {
  const metaRef = doc(_db, 'users', uid, 'settings', 'finance_migration');
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data()?.version === FINANCE_MIGRATION_VERSION) return;

  const goalRef = collection(_db, 'users', uid, 'finance_goals');
  const existingGoals = await getDocs(query(goalRef, limit(1)));
  if (!existingGoals.empty) {
    await setDoc(metaRef, { version: FINANCE_MIGRATION_VERSION, skipped: 'existing_goals', migratedAt: serverTimestamp() }, { merge: true });
    return;
  }

  const [plansSnap, actualsSnap, benchSnap] = await Promise.all([
    getDocs(collection(_db, 'users', uid, 'finance_plans')),
    getDocs(collection(_db, 'users', uid, 'finance_actuals')),
    getDocs(collection(_db, 'users', uid, 'finance_benchmarks')),
  ]);
  const plans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const actuals = actualsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.year || 0) - (b.year || 0));
  const benchmarks = benchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const latestActual = actuals[actuals.length - 1] || null;
  const firstPlan = plans[0] || null;
  const firstBenchmark = benchmarks[0] || null;
  const planEntries = (firstPlan?.entries || []).slice().sort((a, b) => (a.year || 0) - (b.year || 0));
  const lastPlan = planEntries[planEntries.length - 1] || null;

  if (firstPlan || firstBenchmark || latestActual) {
    await addDoc(goalRef, {
      ...prepareFinanceGoalPayload({
        name: firstPlan?.name || firstBenchmark?.name || '장기 목표',
        targetAmount: manwonToKRW(lastPlan?.target || firstBenchmark?.targetAmount || 0),
        targetYear: lastPlan?.year || (firstBenchmark?.startYear ? firstBenchmark.startYear + (firstBenchmark.periodYears || 5) - 1 : new Date().getFullYear() + 5),
        startAmount: manwonToKRW(latestActual?.cumulativeSaved || latestActual?.netWorth || firstBenchmark?.initialPrincipal || 0),
        annualRate: firstBenchmark?.annualRate || 0,
        inflationRate: firstBenchmark?.inflationRate || 0,
        monthlyContributionTarget: manwonToKRW(Math.round((firstBenchmark?.annualContribution || 0) / 12)),
        source: 'tomatofarm-migration',
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await Promise.all(actuals.map(actual => addDoc(collection(_db, 'users', uid, 'finance_snapshots'), {
    year: Math.round(Number(actual.year) || new Date().getFullYear()),
    month: null,
    cumulativeSaved: manwonToKRW(actual.cumulativeSaved),
    netWorth: manwonToKRW(actual.netWorth),
    emergencyFund: manwonToKRW(actual.emergencyFund),
    monthlyExpense: manwonToKRW(actual.monthlyExpense),
    inflow: manwonToKRW(actual.inflow),
    fixedOutflow: manwonToKRW(actual.fOutflow),
    source: 'tomatofarm-migration',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })));

  await setDoc(metaRef, {
    version: FINANCE_MIGRATION_VERSION,
    migratedAt: serverTimestamp(),
    migratedGoals: firstPlan || firstBenchmark || latestActual ? 1 : 0,
    migratedSnapshots: actuals.length,
  }, { merge: true });
}

async function ensureFinanceScenarioPresets() {
  const uid = _scope();
  if (_financeScenarioPresetUid === uid && _financeScenarioPresetPromise) return _financeScenarioPresetPromise;
  _financeScenarioPresetUid = uid;
  _financeScenarioPresetPromise = runFinanceScenarioPresetEnsure(uid).catch(err => {
    if (_financeScenarioPresetUid === uid) _financeScenarioPresetPromise = null;
    throw err;
  });
  return _financeScenarioPresetPromise;
}

async function runFinanceScenarioPresetEnsure(uid) {
  const metaRef = doc(_db, 'users', uid, 'settings', 'finance_scenario_presets');
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data()?.version === FINANCE_SCENARIO_PRESET_VERSION) return;

  const benchmarkRef = collection(_db, 'users', uid, 'finance_benchmarks');
  await Promise.all(FINANCE_SCENARIO_PRESETS.map(item => setDoc(doc(benchmarkRef, item.id), {
    ...prepareFinanceBenchmarkPreset(item),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true })));

  const basePreset = FINANCE_SCENARIO_PRESETS.find(item => item.id === 'qqqm-schd-gold-base-2026') || FINANCE_SCENARIO_PRESETS[0];
  const goalRef = collection(_db, 'users', uid, 'finance_goals');
  const goalsSnap = await getDocs(query(goalRef, orderBy('createdAt', 'asc'), limit(1)));
  const baseTargetAmount = projectPresetLastBalance(basePreset);
  const baseTargetYear = basePreset.startYear + basePreset.periodYears - 1;
  let seededDefaultGoal = false;
  const goalPayload = prepareFinanceGoalPayload({
    name: basePreset.name,
    targetAmount: baseTargetAmount,
    targetYear: baseTargetYear,
    startAmount: basePreset.initialPrincipal,
    annualRate: basePreset.annualRate,
    inflationRate: basePreset.inflationRate,
    monthlyContributionTarget: Math.round(basePreset.annualContribution / 12),
    heroBasisType: 'scenario',
    heroBenchmarkId: basePreset.id,
    source: 'codex-20260504',
  });
  if (goalsSnap.empty) {
    await addDoc(goalRef, {
      ...goalPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    seededDefaultGoal = true;
  }

  await setDoc(metaRef, {
    version: FINANCE_SCENARIO_PRESET_VERSION,
    seededScenarioIds: FINANCE_SCENARIO_PRESETS.map(item => item.id),
    targetScenarioId: basePreset.id,
    seededDefaultGoal,
    preservedExistingGoal: !goalsSnap.empty,
    seededAt: serverTimestamp(),
  }, { merge: true });
}

function prepareFinanceBenchmarkPreset(item) {
  return {
    name: item.name,
    startYear: item.startYear,
    periodYears: item.periodYears,
    annualRate: item.annualRate,
    inflationRate: item.inflationRate,
    initialPrincipal: item.initialPrincipal,
    annualContribution: item.annualContribution,
    contributionTiming: item.contributionTiming || 'yearEnd',
    contributionSchedule: normalizeContributionSchedulePayload(item.contributionSchedule),
    amountUnit: 'krw',
    source: item.source || 'budgetproject',
  };
}

function normalizeContributionSchedulePayload(entries = [], multiplier = 1) {
  return (Array.isArray(entries) ? entries : [])
    .map(entry => {
      const startYear = Math.round(Number(entry.startYear) || 0);
      const rawEndYear = Number(entry.endYear);
      const endYear = rawEndYear ? Math.max(startYear, Math.round(rawEndYear)) : null;
      const annualContribution = Math.max(0, Math.round(Number(entry.annualContribution ?? entry.amount) || 0) * multiplier);
      return { startYear, endYear, annualContribution };
    })
    .filter(entry => entry.startYear && entry.annualContribution)
    .sort((a, b) => a.startYear - b.startYear);
}

function projectPresetLastBalance(item) {
  const startYear = Number(item.startYear) || new Date().getFullYear();
  const targetYear = startYear + Math.max(1, Number(item.periodYears) || 1) - 1;
  const annualRate = Math.max(-0.99, Number(item.annualRate) || 0) / 100;
  const schedule = normalizeContributionSchedulePayload(item.contributionSchedule);
  let balance = Math.max(0, Math.round(Number(item.initialPrincipal) || 0));
  for (let year = startYear; year <= targetYear; year += 1) {
    balance = Math.round(balance * (1 + annualRate));
    balance += contributionForPresetYear(schedule, year, item.annualContribution);
  }
  return balance;
}

function contributionForPresetYear(schedule, year, fallbackAnnualContribution = 0) {
  const matched = schedule.find(entry => {
    const endYear = entry.endYear == null ? Infinity : Number(entry.endYear);
    return year >= entry.startYear && year <= endYear;
  });
  return Math.max(0, Math.round(Number(matched?.annualContribution ?? fallbackAnnualContribution) || 0));
}

function manwonToKRW(value) {
  return Math.max(0, Math.round(Number(value) || 0) * 10000);
}

// ================================================================
// sensory cellar — wine bottles and tasting notes
// ================================================================
export async function listWineBottles(opts = {}) {
  await ensureWineMigration();
  const ref = collection(_db, 'users', _scope(), 'wine_bottles');
  const q = query(ref, orderBy('createdAt', 'desc'), limit(opts.max || 100));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getWineBottle(bottleId) {
  await ensureWineMigration();
  const ref = doc(_db, 'users', _scope(), 'wine_bottles', bottleId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveWineBottle(bottle) {
  const payload = prepareWineBottlePayload(bottle);
  if (bottle.id) {
    await setDoc(doc(_db, 'users', _scope(), 'wine_bottles', bottle.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return bottle.id;
  }
  const docRef = await addDoc(collection(_db, 'users', _scope(), 'wine_bottles'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteWineBottle(bottleId) {
  const uid = _scope();
  const tastingSnap = await getDocs(query(
    collection(_db, 'users', uid, 'wine_tastings'),
    where('bottleId', '==', bottleId),
    limit(100)
  ));
  await Promise.all(tastingSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(_db, 'users', uid, 'wine_bottles', bottleId));
}

export async function listWineTastings(opts = {}) {
  await ensureWineMigration();
  const ref = collection(_db, 'users', _scope(), 'wine_tastings');
  const q = opts.bottleId
    ? query(ref, where('bottleId', '==', opts.bottleId), limit(opts.max || 100))
    : query(ref, orderBy('tastedAt', 'desc'), limit(opts.max || 100));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (normalizeTxDate(b.tastedAt)?.getTime() || 0) - (normalizeTxDate(a.tastedAt)?.getTime() || 0));
}

export async function saveWineTasting(note) {
  const payload = {
    bottleId: note.bottleId || null,
    tastedAt: note.tastedAt ? Timestamp.fromDate(normalizeTxDate(note.tastedAt)) : Timestamp.fromDate(new Date()),
    occasion: note.occasion || '',
    moodBefore: note.moodBefore || '',
    moodAfter: note.moodAfter || '',
    color: note.color || '',
    nose: note.nose || '',
    palate: note.palate || '',
    structure: normalizeWineStructure(note.structure),
    pairing: note.pairing || '',
    note: note.note || '',
    taewooScore: note.taewooScore ? Number(note.taewooScore) : null,
    taewooSummary: note.taewooSummary || '',
  };
  if (note.id) {
    await setDoc(doc(_db, 'users', _scope(), 'wine_tastings', note.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return note.id;
  }
  const docRef = await addDoc(collection(_db, 'users', _scope(), 'wine_tastings'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteWineTasting(noteId) {
  await deleteDoc(doc(_db, 'users', _scope(), 'wine_tastings', noteId));
}

async function ensureWineMigration() {
  const uid = _scope();
  const metaRef = doc(_db, 'users', uid, 'settings', 'wine_migration');
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data()?.version === WINE_MIGRATION_VERSION) return;

  const bottleSnap = await getDocs(query(collection(_db, 'users', uid, 'wine_bottles'), limit(1)));
  if (bottleSnap.empty) {
    for (const wine of INITIAL_WINES) {
      const bottle = prepareWineBottlePayload({
        ...wine,
        source: 'tomatofarm',
        status: 'opened',
        acquiredAt: wine.createdAt || null,
      });
      await setDoc(doc(_db, 'users', uid, 'wine_bottles', wine.id), {
        ...bottle,
        createdAt: Timestamp.fromDate(normalizeTxDate(wine.createdAt) || new Date()),
        migratedAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(_db, 'users', uid, 'wine_tastings', `${wine.id}_taste_1`), {
        bottleId: wine.id,
        tastedAt: Timestamp.fromDate(normalizeTxDate(wine.createdAt) || new Date()),
        occasion: '',
        moodBefore: '',
        moodAfter: '',
        color: wine.color || '',
        nose: wine.nose || '',
        palate: wine.palate || '',
        structure: normalizeWineStructure(wine.structure),
        pairing: '',
        note: wine.note || '',
        taewooScore: wine.taewooScore ? Number(wine.taewooScore) : null,
        taewooSummary: wine.taewooSummary || '',
        source: 'tomatofarm',
        createdAt: Timestamp.fromDate(normalizeTxDate(wine.createdAt) || new Date()),
        migratedAt: serverTimestamp(),
      }, { merge: true });
    }
  }

  await setDoc(metaRef, {
    version: WINE_MIGRATION_VERSION,
    migratedAt: serverTimestamp(),
  }, { merge: true });
}

function prepareWineBottlePayload(bottle) {
  return {
    name: bottle.name || '',
    vintage: bottle.vintage ? Number(bottle.vintage) : null,
    region: bottle.region || '',
    variety: bottle.variety || '',
    status: bottle.status || 'cellared',
    price: Math.max(0, Math.round(Number(bottle.price) || 0)),
    merchant: bottle.merchant || '',
    acquiredAt: bottle.acquiredAt ? Timestamp.fromDate(normalizeTxDate(bottle.acquiredAt)) : null,
    txId: bottle.txId || null,
    urgeId: bottle.urgeId || null,
    imageUrl: bottle.imageUrl || null,
    source: bottle.source || 'sensory-bank',
  };
}

function normalizeWineStructure(structure = {}) {
  return {
    sweetness: structure.sweetness ? Number(structure.sweetness) : null,
    tannin: structure.tannin ? Number(structure.tannin) : null,
    acidity: structure.acidity ? Number(structure.acidity) : null,
    alcohol: structure.alcohol ? Number(structure.alcohol) : null,
  };
}

function isSameTransactionEvent(existing, incoming) {
  if (!existing || existing.hidden) return false;
  if (isNaverPayTopupPurchasePair(existing, incoming)) return true;
  if (existing.type !== incoming.type) return false;
  return sameParty(existing.merchant || existing.counterparty, incoming.merchant || incoming.counterparty);
}

function isShareablePayment(tx) {
  return tx?.type === 'card_payment' && !tx.sharedPayment;
}

function shouldSuggestSharedPayment(tx) {
  if (!isShareablePayment(tx)) return false;
  if ((Number(tx.amount) || 0) < 20000) return false;
  const text = normalizeParty([tx.category, tx.merchant, tx.counterparty, tx.body].filter(Boolean).join(' '));
  return ['카페', '커피', 'cafe', 'coffee', '스타벅스', '투썸', '이디야', '메가커피', '컴포즈', '스마트파이브']
    .some(keyword => text.includes(normalizeParty(keyword)));
}

function sameParty(a, b) {
  const left = normalizeParty(a);
  const right = normalizeParty(b);
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeNewsfeedItem(item) {
  const postedAt = normalizeTxDate(item.postedAt)
    || normalizeTxDate(item.receivedAt)
    || normalizeTxDate(item.createdAt)
    || new Date(0);
  const receivedAt = normalizeTxDate(item.receivedAt)
    || normalizeTxDate(item.collectedAt)
    || postedAt;
  return {
    ...item,
    provider: item.provider || 'telegram',
    sourceType: item.sourceType || 'telegram_public',
    sourceTitle: item.sourceTitle || item.sourceHandle || 'Telegram',
    sourceCategory: item.sourceCategory || '뉴스',
    title: item.title || firstNewsfeedLine(item.text) || item.sourceTitle || 'Telegram',
    text: String(item.text || ''),
    url: String(item.url || ''),
    links: Array.isArray(item.links) ? item.links : [],
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
    postedAt,
    receivedAt,
  };
}

function firstNewsfeedLine(value) {
	return String(value || '').split(/\n+/).map(line => line.trim()).find(Boolean) || '';
}

function newsfeedPageSize(opts = {}) {
	return Math.max(1, Math.min(Math.round(Number(opts.pageSize || opts.max) || 60), 200));
}

function newsfeedPageResult(items, pageSize, meta = {}) {
	const last = items[items.length - 1] || null;
	const hasMore = typeof meta.total === 'number'
		? (meta.nextOffset || 0) < meta.total
		: items.length >= pageSize;
	return {
		items,
		nextCursor: hasMore ? newsfeedCursorForItem(last, meta) : null,
		hasMore,
		total: typeof meta.total === 'number' ? meta.total : null,
		snapshot: meta.snapshot || null,
	};
}

function newsfeedCursorForItem(item, meta = {}) {
	if (!item) return null;
	const postedAt = normalizeTxDate(item.postedAt);
	return {
		postedAt: postedAt ? postedAt.toISOString() : null,
		sourceId: item.sourceId || '',
		messageId: item.messageId || '',
		offset: typeof meta.nextOffset === 'number' ? meta.nextOffset : null,
	};
}

function newsfeedCursorDate(cursor) {
	if (!cursor) return null;
	if (cursor instanceof Date || cursor?.toDate) return normalizeTxDate(cursor);
	return normalizeTxDate(cursor.postedAt || cursor);
}

function newsfeedCursorOffset(cursor) {
	const offset = Number(cursor?.offset || 0);
	return Number.isFinite(offset) && offset > 0 ? Math.round(offset) : 0;
}

function compareNewsfeedItems(a, b) {
	const dateDiff = normalizeTxDate(b.postedAt).getTime() - normalizeTxDate(a.postedAt).getTime();
	if (dateDiff) return dateDiff;
	const sourceDiff = String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
	if (sourceDiff) return sourceDiff;
	return Number(b.messageId || 0) - Number(a.messageId || 0);
}

function shouldFallbackToStaticNewsfeed(result, opts = {}) {
	if (hasNewsfeedItems(result)) return false;
	if (newsfeedCursorOffset(opts.cursor) > 0) return true;
	return !newsfeedCursorDate(opts.cursor);
}

function hasNewsfeedItems(result) {
	const items = Array.isArray(result) ? result : result?.items;
	return Array.isArray(items) && items.length > 0;
}

async function listStaticNewsfeedItems(opts = {}) {
	const snapshot = await loadStaticNewsfeedSnapshot(opts);
	const max = newsfeedPageSize(opts);
	let rows = Array.isArray(snapshot.items) ? snapshot.items.map(normalizeNewsfeedItem) : [];
	if (opts.sourceId) rows = rows.filter(item => item.sourceId === opts.sourceId);
	if (opts.category) rows = rows.filter(item => item.sourceCategory === opts.category);
	rows = rows
		.filter(item => !item.hidden)
		.sort(compareNewsfeedItems);
	if (!opts.page) return rows.slice(0, max);

	const start = newsfeedCursorOffset(opts.cursor);
	const items = rows.slice(start, start + max);
	return newsfeedPageResult(items, max, {
		nextOffset: start + items.length,
		total: rows.length,
		snapshot,
	});
}

async function loadStaticNewsfeedSnapshot(opts = {}) {
  const now = Date.now();
  const cacheFresh = _staticNewsfeedSnapshotPromise && now - _staticNewsfeedSnapshotFetchedAt < STATIC_NEWSFEED_CACHE_MS;
  if (!opts.refreshStatic && cacheFresh) return _staticNewsfeedSnapshotPromise;

  const url = opts.refreshStatic ? `${STATIC_NEWSFEED_URL}&t=${now}` : STATIC_NEWSFEED_URL;
  _staticNewsfeedSnapshotFetchedAt = now;
  _staticNewsfeedSnapshotPromise = fetch(url, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`static newsfeed HTTP ${response.status}`);
        return response.json();
      })
      .catch(err => {
        _staticNewsfeedSnapshotPromise = null;
        _staticNewsfeedSnapshotFetchedAt = 0;
        throw err;
      });
  return _staticNewsfeedSnapshotPromise;
}

function normalizeStaticNewsfeedStatus(snapshot) {
	const generatedAt = normalizeTxDate(snapshot.generatedAt);
	return {
    id: 'telegram_public_feed_static',
    sourceType: 'telegram_public_static',
    sourceVersion: snapshot.sourceVersion || '',
    sourceCount: Number(snapshot.sourceCount || 0),
    itemCount: Array.isArray(snapshot.items) ? snapshot.items.length : Number(snapshot.itemCount || 0),
    lastRunAt: generatedAt,
    lastSuccessAt: generatedAt,
    updatedAt: generatedAt,
		staticFallback: true,
		failed: Number(snapshot.failed || 0),
		since: snapshot.since || null,
		truncated: !!snapshot.truncated,
		pagesFetched: Number(snapshot.pagesFetched || 0),
		backfillComplete: snapshot.backfillComplete ?? null,
		sources: Array.isArray(snapshot.sources) ? snapshot.sources : [],
	};
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
  const category = classifyReceiptCategoryClient(receipt);
  const patch = {};
  if (category && isBlankOrCoupangAliasCategoryClient(tx.category)) {
    patch.category = category.category;
  }
  if (category?.subcategory && !tx.subcategory && (!tx.category || tx.category === category.category || isBlankOrCoupangAliasCategoryClient(tx.category))) {
    patch.subcategory = category.subcategory;
  }
  if (category) {
    patch.confidence = Math.max(Number(tx.confidence) || 0, category.confidence);
    patch.autoCategorySource = category.source;
  }
  const memo = buildReceiptMemoClient(receipt);
  if (memo) {
    patch.memo = mergeReceiptMemoClient(tx.memo, memo);
    patch.receiptItemSummary = memo;
  }
  if (receipt.merchant && isGenericMerchantClient(tx.merchant || tx.counterparty)) {
    patch.merchant = receipt.merchant;
  }
  return patch;
}

function classifyReceiptCategoryClient(receipt = {}) {
  const source = normalizeReceiptText(receipt.source);
  const merchant = normalizeReceiptText(receipt.merchant);
  if (/coupangeats|쿠팡이츠/.test(`${source} ${merchant}`)) return null;
  if (!(source === 'coupang' || /쿠팡/.test(merchant))) return null;
  const subcategory = classifyCoupangSubcategoryClient(receipt.items || []);
  return {
    category: '생활비용',
    subcategory,
    confidence: subcategory ? 0.86 : 0.78,
    source: subcategory ? 'gmail_receipt_items' : 'gmail_receipt_merchant',
  };
}

function classifyCoupangSubcategoryClient(items = []) {
  const scores = items.reduce((acc, item) => {
    const name = normalizeReceiptText(item?.name);
    const amount = Math.max(1, Math.round((Number(item?.price) || 0) * (Number(item?.qty) || 1)));
    if (/(쌀|현미|잡곡|햇반|밥|라면|면|국수|파스타|식품|간식|과자|초콜릿|우유|요거트|치즈|계란|달걀|닭가슴살|닭|돼지|소고기|한우|육포|참치|연어|고등어|만두|냉동|김치|반찬|샐러드|채소|야채|과일|사과|바나나|토마토|고구마|감자|양파|마늘|고추장|된장|간장|소스|올리브유|오일|커피|차|티백|음료|생수|탄산수|프로틴|단백질)/.test(name)) acc.food += amount;
    else if (/(휴지|물티슈|키친타월|세제|섬유유연제|샴푸|린스|트리트먼트|바디워시|비누|치약|칫솔|구강|면도|화장지|청소|쓰레기|봉투|주방세제|수세미|랩|호일|지퍼백|건전지|전구|필터|방향제|탈취제|수건|타월|양말|마스크|위생|소독|로션|선크림|화장솜|면봉)/.test(name)) acc.goods += amount;
    else acc.unknown += amount;
    return acc;
  }, { food: 0, goods: 0, unknown: 0 });
  const known = scores.food + scores.goods;
  if (!known) return '생활용품';
  if (scores.food >= known * 0.6 || scores.food > scores.goods * 1.25) return '식재료비';
  return '생활용품';
}

function buildReceiptMemoClient(receipt = {}) {
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  if (!items.length) return '';
  const merchant = receipt.merchant || '영수증';
  const rows = items.slice(0, 12).map(item => {
    const qty = Math.max(1, Math.round(Number(item?.qty) || 1));
    const price = Math.max(0, Math.round(Number(item?.price) || 0));
    const amount = price * qty;
    return `- ${item?.name || '품목'}${qty > 1 ? ` x${qty}` : ''}${amount ? ` ${amount.toLocaleString('ko-KR')}원` : ''}`;
  });
  const suffix = items.length > 12 ? `\n- 외 ${items.length - 12}개` : '';
  return `[${merchant} 영수증]\n${rows.join('\n')}${suffix}`;
}

function mergeReceiptMemoClient(current, receiptMemo) {
  const existing = String(current || '').trim();
  if (!existing) return receiptMemo;
  if (existing.includes(receiptMemo) || existing.includes('[쿠팡 영수증]')) return existing;
  return `${existing}\n\n${receiptMemo}`;
}

function isBlankOrCoupangAliasCategoryClient(value) {
  return !value || value === UNCATEGORIZED_CATEGORY_NAME || value === '생활용품';
}

function isGenericMerchantClient(value) {
  const text = String(value || '').trim().toLowerCase();
  return !text || ['쿠팡', '쿠팡이츠', '배달의민족', '배민', 'coupang', 'coupangeats', 'baemin'].some(name => text.includes(name));
}

function normalizeReceiptText(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
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
  return !!(
    tx?.excludedFromBudget ||
    tx?.excludeFromBudget ||
    isReimbursementExpected(tx) ||
    isTossKimTaewooSelfTransfer(tx)
  );
}

export function isReimbursementExpected(tx) {
  return !!(
    tx?.reimbursementExpected ||
    tx?.excludeReason === 'reimbursement_expected' ||
    (tx?.excludedFromBudget && !tx?.excludeReason)
  );
}

export function isNaverPayTopup(tx) {
  return isNaverPayTopupTx(tx);
}

export function needsPaymentRailReview(tx) {
  return isNaverPayTopup(tx) && tx?.paymentRailResolved !== true;
}

export function displayCategoryName(tx) {
  if (isReimbursementExpected(tx)) return REIMBURSEMENT_CATEGORY_NAME;
  return tx?.category || UNCATEGORIZED_CATEGORY_NAME;
}

function computeIsLateNight(date) {
  const hour = date?.getHours ? date.getHours() : new Date().getHours();
  return hour >= 22 || hour < 4;
}
