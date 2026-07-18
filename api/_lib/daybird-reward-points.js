import { REWARD_WIDGET_SCHEMA_VERSION, buildRewardSavingsSummary } from '../../domain/rewards/savings.js';
import { displayCategoryName, isBudgetExcluded } from '../../domain/transactions/budget.js';
import { getAdminDb, getAdminMessaging } from './firebase-admin.js';

const DEFAULT_LOOKBACK_DAYS = 180;
const MAX_REWARD_TRANSACTIONS = 3000;
const MAX_POINT_ENTRIES = 500;
const KST_OFFSET_MINUTES = 9 * 60;
const MINUTE_MS = 60 * 1000;

export function buildCanonicalWinePurchasePoints({
  transactions = [],
  categories = [],
  pointEntries = [],
  rewardSettings = {},
  now = new Date(),
} = {}) {
  const canonicalNow = toKstPseudoLocalDate(now);
  const canonicalTransactions = transactions.map(transaction => ({
    ...transaction,
    occurredAt: toKstPseudoLocalDate(transaction?.occurredAt),
  }));
  const canonicalPointEntries = pointEntries.map(entry => ({
    ...entry,
    usedAt: toKstPseudoLocalDate(entry?.usedAt),
  }));
  const controlCategoryNames = categories
    .filter(category => category?.kind === 'expense' && category?.budgetRhythm !== 'fixed')
    .map(category => category.name)
    .filter(Boolean);
  const summary = buildRewardSavingsSummary({
    transactions: canonicalTransactions.filter(transaction => !isBudgetExcluded(transaction)),
    pointEntries: canonicalPointEntries,
    categoryNames: controlCategoryNames,
    getCategoryName: displayCategoryName,
    now: canonicalNow,
    ...(rewardSettings && typeof rewardSettings === 'object' ? rewardSettings : {}),
  });
  const winePurchase = summary.pointBuckets.find(bucket => bucket.key === 'winePurchase');
  if (!winePurchase) {
    return {
      state: 'missing',
      label: '와인구매 포인트',
      source: 'budget-canonical',
      schemaVersion: REWARD_WIDGET_SCHEMA_VERSION,
    };
  }
  return {
    state: 'ready',
    key: 'winePurchase',
    label: winePurchase.label || '와인구매 포인트',
    balance: winePurchase.monthPoints,
    monthPoints: winePurchase.monthPoints,
    earnedMonthPoints: winePurchase.earnedMonthPoints,
    spentMonthPoints: winePurchase.spentMonthPoints,
    todayPoints: winePurchase.todayPoints,
    historyOnly: !!winePurchase.historyOnly,
    source: 'budget-canonical',
    schemaVersion: REWARD_WIDGET_SCHEMA_VERSION,
  };
}

export async function loadCanonicalWinePurchasePoints(ownerUid, options = {}) {
  const db = options.db || getAdminDb();
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const base = db.doc(`users/${ownerUid}`);
  const settingsSnapshot = await base.collection('settings').doc('app').get();
  const rewardSettings = settingsSnapshot.exists ? settingsSnapshot.data()?.rewardSavings || {} : {};
  const lookbackDays = Math.max(30, Math.round(Number(rewardSettings.lookbackDays) || DEFAULT_LOOKBACK_DAYS));
  const lookbackStart = kstDayStartDate(now, -lookbackDays - 10);
  const monthStart = kstMonthStartDate(now);

  const [transactionsSnapshot, categoriesSnapshot, pointEntriesSnapshot] = await Promise.all([
    base.collection('transactions')
      .where('occurredAt', '>=', lookbackStart)
      .where('occurredAt', '<=', now)
      .orderBy('occurredAt', 'desc')
      .limit(MAX_REWARD_TRANSACTIONS)
      .get(),
    base.collection('categories').get(),
    base.collection('reward_point_entries')
      .where('usedAt', '>=', monthStart)
      .where('usedAt', '<=', now)
      .orderBy('usedAt', 'desc')
      .limit(MAX_POINT_ENTRIES)
      .get(),
  ]);

  return buildCanonicalWinePurchasePoints({
    transactions: documentsWithIds(transactionsSnapshot),
    categories: documentsWithIds(categoriesSnapshot),
    pointEntries: documentsWithIds(pointEntriesSnapshot),
    rewardSettings,
    now,
  });
}

export function toKstPseudoLocalDate(value, localTimezoneOffsetMinutes) {
  const instant = dateValue(value);
  if (!instant) return null;
  const environmentOffset = Number.isFinite(localTimezoneOffsetMinutes)
    ? Number(localTimezoneOffsetMinutes)
    : instant.getTimezoneOffset();
  return new Date(instant.getTime() + (KST_OFFSET_MINUTES + environmentOffset) * MINUTE_MS);
}

export function kstMonthStartDate(value) {
  const instant = dateValue(value);
  if (!instant) throw new TypeError('KST month start requires a valid date');
  const kst = new Date(instant.getTime() + KST_OFFSET_MINUTES * MINUTE_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - KST_OFFSET_MINUTES * MINUTE_MS);
}

function kstDayStartDate(value, offsetDays = 0) {
  const instant = dateValue(value);
  if (!instant) throw new TypeError('KST day start requires a valid date');
  const kst = new Date(instant.getTime() + KST_OFFSET_MINUTES * MINUTE_MS);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + offsetDays)
      - KST_OFFSET_MINUTES * MINUTE_MS,
  );
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function persistCanonicalDashboardPoints(ownerUid, canonicalPoints, options = {}) {
  const db = options.db || getAdminDb();
  const updatedAtEpochMs = Number(options.updatedAtEpochMs) || Date.now();
  const tomatoDevSnapshot = options.tomatoDevSnapshot;
  const budgetSource = options.budgetSource;
  if (tomatoDevSnapshot?.sourceEnvironment !== 'tomatodev' || Number(tomatoDevSnapshot?.schemaVersion) !== 1) {
    throw new Error('Validated TomatoDev DayBird snapshot is required before dashboard persistence');
  }
  if (budgetSource?.sourceEnvironment !== 'budget' || !isPlainObject(budgetSource.spending)
    || !Object.prototype.hasOwnProperty.call(budgetSource, 'wine') || !isPlainObject(budgetSource.weights)) {
    throw new Error('Canonical Budget spending, wine, and weights are required before dashboard persistence');
  }
  const latestRef = db.doc(`users/${ownerUid}/dashboard/latest`);
  const sourceRef = db.doc(`users/${ownerUid}/dashboard_sources/budget`);
  const tomatoDevSourceRef = db.doc(`users/${ownerUid}/dashboard_sources/tomatodev`);

  let revision = null;
  await db.runTransaction(async transaction => {
    const latest = await transaction.get(latestRef);
    const current = latest.exists ? latest.data() || {} : {};
    revision = Math.max(1, (Number(current.revision) || 0) + 1);
    const running = {
      ...tomatoDevSnapshot.running,
      recent: tomatoDevSnapshot.running.recent,
      records: tomatoDevSnapshot.running.recent,
    };
    const next = {
      schemaVersion: 1,
      revision,
      generatedAtEpochMs: updatedAtEpochMs,
      timezone: 'Asia/Seoul',
      ownerId: String(options.tomatoOwnerId || current.ownerId || ''),
      budgetUid: ownerUid,
      sourceEnvironment: 'tomatodev',
      weights: budgetSource.weights,
      spending: budgetSource.spending,
      wine: budgetSource.wine ?? null,
      points: canonicalPoints,
      season: tomatoDevSnapshot.season,
      seasonGoals: tomatoDevSnapshot.seasonGoals,
      nutrition: tomatoDevSnapshot.nutrition,
      running,
      tomatoDevSnapshotMetadata: {
        schemaVersion: 1,
        sourceEnvironment: 'tomatodev',
        generatedAt: tomatoDevSnapshot.generatedAt,
        reason: tomatoDevSnapshot.reason,
        state: tomatoDevSnapshot.state,
      },
      budgetPointsMetadata: {
        source: 'budget-canonical',
        schemaVersion: canonicalPoints.schemaVersion || REWARD_WIDGET_SCHEMA_VERSION,
        updatedAtEpochMs,
      },
    };
    for (const key of ['strength', 'streak', 'nextPlan']) {
      if (tomatoDevSnapshot[key] !== undefined) next[key] = tomatoDevSnapshot[key];
    }
    transaction.set(latestRef, next);
    transaction.set(sourceRef, {
      spending: budgetSource.spending,
      wine: budgetSource.wine ?? null,
      points: canonicalPoints,
      pointsUpdatedAtEpochMs: updatedAtEpochMs,
      revision,
    });
    transaction.set(tomatoDevSourceRef, {
      ...tomatoDevSnapshot,
      mergedAtEpochMs: updatedAtEpochMs,
      revision,
    });
  });

  return { points: canonicalPoints, revision, sourceEnvironment: 'tomatodev' };
}

export async function notifyCanonicalDashboardUpdate(ownerUid, revision, options = {}) {
  const db = options.db || getAdminDb();
  const devices = await db.collection(`users/${ownerUid}/daybird_devices`)
    .where('active', '==', true)
    .get();
  const tokens = devices.docs
    .map(document => String(document.data()?.fcmToken || '').trim())
    .filter(Boolean)
    .slice(0, 500);
  if (!tokens.length) return { sent: 0 };
  const messaging = options.messaging || getAdminMessaging();
  const response = await messaging.sendEachForMulticast({
    tokens,
    data: {
      ownerUid,
      revision: String(Number(revision) || 0),
      type: 'dashboard_snapshot',
      sourceEnvironment: 'tomatodev',
    },
    android: { priority: 'high' },
  });
  return { sent: Number(response.successCount) || 0, failed: Number(response.failureCount) || 0 };
}

function documentsWithIds(snapshot) {
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
