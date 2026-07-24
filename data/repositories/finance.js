import {
  addDoc,
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
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { firestoreDb as _db, scope as _scope } from '../core/firebase.js';
import { fixtureActive, fixtureListFinanceGoals } from '../core/fixtures.js';
import { ASSET_TRACKS } from '../../utils/market-data.js';

let _financeMigrationUid = null;
let _financeMigrationPromise = null;
let _financeScenarioPresetUid = null;
let _financeScenarioPresetPromise = null;

const FINANCE_MIGRATION_VERSION = 'tomatofarm-finance-2026-05-02-v1';
const FINANCE_SCENARIO_PRESET_VERSION = 'tomatofarm-finance-scenarios-2026-05-04-v1';
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
// ================================================================
// finance direction — long-term goals and snapshots
// ================================================================
export async function listFinanceGoals(opts = {}) {
  if (fixtureActive()) return fixtureListFinanceGoals(opts);
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
