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
import {
  aggregateByCategory,
  aggregateMonthlyTotals,
  applyReceiptToTransaction,
  applySharedPayment,
  deleteRewardPointEntry,
  deleteSharedPaymentRule,
  deleteTransaction,
  displayCategoryName,
  findSimilarTransaction,
  getReceipt,
  getTransaction,
  isBudgetExcluded,
  isNaverPayTopup,
  isReimbursementExpected,
  linkRawMessageToTransaction,
  listPendingRawMessages,
  listRewardPointEntries,
  listSettlements,
  listSharedPaymentRules,
  listTransactions,
  listUnmatchedReceipts,
  markRawMessageSkipped,
  needsPaymentRailReview,
  saveReceipt,
  saveRewardPointEntry,
  saveSettlement,
  saveSharedPaymentRule,
  saveTransaction,
  updateReceipt,
  updateTransaction,
} from './data/repositories/transactions.js';
import {
  deleteDevIdea,
  deleteMindbankEntry,
  deletePact,
  getUrge,
  listDevIdeas,
  listMindbankEntries,
  listPacts,
  listUrges,
  saveDevIdea,
  saveMindbankEntry,
  savePact,
  saveUrge,
  updateDevIdea,
  updatePact,
  updateUrge,
} from './data/repositories/behavior.js';
import { getAppSettings, saveAppSettings } from './data/repositories/settings.js';
import { normalizeDate as normalizeTxDate } from './data/shared/normalize.js';
import { INITIAL_WINES } from './wine-data.js';
import { ASSET_TRACKS } from './utils/market-data.js';

let _financeMigrationUid = null;
let _financeMigrationPromise = null;
let _financeScenarioPresetUid = null;
let _financeScenarioPresetPromise = null;

export { DEV_IDEA_STATUS, REIMBURSEMENT_CATEGORY_NAME, UNCATEGORIZED_CATEGORY_NAME };
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
  aggregateByCategory,
  aggregateMonthlyTotals,
  applyReceiptToTransaction,
  applySharedPayment,
  deleteAccount,
  deleteCategory,
  deleteCategorySubcategory,
  deleteDevIdea,
  deleteMindbankEntry,
  deletePact,
  deleteRewardPointEntry,
  deleteSharedPaymentRule,
  deleteTransaction,
  displayCategoryName,
  findSimilarTransaction,
  getAccountById,
  getAccounts,
  getCategories,
  getCategoryById,
  getCategoryByName,
  getAppSettings,
  getReceipt,
  getTransaction,
  getUrge,
  isBudgetExcluded,
  isNaverPayTopup,
  isReimbursementExpected,
  linkRawMessageToTransaction,
  listPendingRawMessages,
  listDevIdeas,
  listMindbankEntries,
  listPacts,
  listRewardPointEntries,
  listSettlements,
  listSharedPaymentRules,
  listTransactions,
  listUnmatchedReceipts,
  listUrges,
  markRawMessageSkipped,
  needsPaymentRailReview,
  saveAccount,
  saveCategory,
  saveCategoryBudgetRhythm,
  saveCategoryMonthlyTarget,
  saveCategorySubcategory,
  saveDevIdea,
  saveMindbankEntry,
  savePact,
  saveReceipt,
  saveRewardPointEntry,
  saveSettlement,
  saveSharedPaymentRule,
  saveTransaction,
  saveUrge,
  saveAppSettings,
  updateDevIdea,
  updatePact,
  updateReceipt,
  updateTransaction,
  updateUrge,
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
