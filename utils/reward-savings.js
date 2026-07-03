// ================================================================
// utils/reward-savings.js - reward-based saving calculation
// ================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 180;
const DEFAULT_ALLOCATION_RATE = 0.3;
const DEFAULT_BASELINE_METHOD = 'trimmed_weekly';
const REWARD_POINT_BUCKETS = [
  { key: 'winePurchase', label: '와인구매 포인트', fallbackRate: DEFAULT_ALLOCATION_RATE },
  { key: 'premiumIngredients', label: '고급재료 포인트', fallbackRate: 0 },
  { key: 'travelFund', label: '여행충당 포인트', fallbackRate: 0 },
];

export function buildRewardSavingsSummary(options = {}) {
  const now = startOfDay(options.now || new Date());
  const enabled = options.enabled !== false;
  const categoryNames = new Set((options.categoryNames || []).filter(Boolean));
  const getCategoryName = typeof options.getCategoryName === 'function'
    ? options.getCategoryName
    : tx => tx?.category || '';
  const pointRates = normalizePointRates(options.pointRates, options.allocationRate);
  const lookbackDays = Math.max(30, Math.round(Number(options.lookbackDays || DEFAULT_LOOKBACK_DAYS)));
  const baselineMethod = ['trimmed_weekly', 'simple_daily'].includes(options.baselineMethod)
    ? options.baselineMethod
    : DEFAULT_BASELINE_METHOD;

  const lookbackStart = addDays(now, -lookbackDays);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const transactions = (options.transactions || [])
    .filter(tx => isRewardExpense(tx, categoryNames, getCategoryName));

  const baselineTxs = transactions.filter(tx => {
    const date = normalizeTxDate(tx?.occurredAt);
    return date && date >= lookbackStart && date < now;
  });
  const dailyBaseline = enabled ? Math.round(computeDailyBaseline(baselineTxs, lookbackStart, now, baselineMethod)) : 0;
  const baselineReady = dailyBaseline > 0;

  const todaySpend = sumTransactions(transactions, now, addDays(now, 1));
  const todaySaved = baselineReady ? Math.max(0, dailyBaseline - todaySpend) : 0;

  const monthSpendByDay = new Map();
  for (const tx of transactions) {
    const date = normalizeTxDate(tx?.occurredAt);
    if (!date || date < monthStart || date >= addDays(now, 1)) continue;
    const key = dateKey(date);
    monthSpendByDay.set(key, (monthSpendByDay.get(key) || 0) + safeAmount(tx?.amount));
  }

  let monthSaved = 0;
  const savedByDay = [];
  for (let cursor = new Date(monthStart); cursor <= now; cursor = addDays(cursor, 1)) {
    const spend = monthSpendByDay.get(dateKey(cursor)) || 0;
    const saved = baselineReady ? Math.max(0, dailyBaseline - spend) : 0;
    monthSaved += saved;
    savedByDay.push(saved);
  }
  monthSaved = Math.round(monthSaved);

  const elapsedDays = Math.max(1, now.getDate());
  const daysInMonth = monthEnd.getDate();
  const pointBuckets = REWARD_POINT_BUCKETS.map(bucket => {
    const rate = pointRates[bucket.key];
    const todayPoints = pointsForSaved(todaySaved, rate);
    const monthPoints = savedByDay.reduce((sum, saved) => sum + pointsForSaved(saved, rate), 0);
    const projectedMonthPoints = baselineReady
      ? Math.round((monthPoints / elapsedDays) * daysInMonth)
      : 0;
    return {
      key: bucket.key,
      label: bucket.label,
      rate,
      todayPoints,
      monthPoints: Math.round(monthPoints),
      projectedMonthPoints,
    };
  });
  const wineBucket = pointBuckets.find(bucket => bucket.key === 'winePurchase') || pointBuckets[0];

  return {
    enabled,
    baselineReady,
    dailyBaseline,
    todaySpend: Math.round(todaySpend),
    todaySaved: Math.round(todaySaved),
    todayPoints: wineBucket?.todayPoints || 0,
    monthSaved,
    monthPoints: wineBucket?.monthPoints || 0,
    projectedMonthPoints: wineBucket?.projectedMonthPoints || 0,
    allocationRate: wineBucket?.rate || 0,
    pointRates,
    pointBuckets,
    lookbackDays,
    baselineMethod,
    elapsedDays,
    daysInMonth,
  };
}

export function buildRewardWidgetSnapshot(summary = {}, updatedAt = new Date()) {
  const sourceBuckets = Array.isArray(summary.pointBuckets) ? summary.pointBuckets : [];
  const pointBuckets = REWARD_POINT_BUCKETS.map(bucket => {
    const source = sourceBuckets.find(item => item?.key === bucket.key) || {};
    return {
      key: bucket.key,
      label: bucket.label,
      rate: normalizeRate(source.rate, 0),
      todayPoints: safeAmount(source.todayPoints),
      monthPoints: safeAmount(source.monthPoints),
      projectedMonthPoints: safeAmount(source.projectedMonthPoints),
    };
  });
  return {
    schemaVersion: 1,
    updatedAt: isoTimestamp(updatedAt),
    baselineReady: !!summary.baselineReady,
    todaySaved: safeAmount(summary.todaySaved),
    todaySpend: safeAmount(summary.todaySpend),
    dailyBaseline: safeAmount(summary.dailyBaseline),
    pointBuckets,
  };
}

function isRewardExpense(tx, categoryNames, getCategoryName) {
  if (!tx || tx.hidden) return false;
  if (!(tx.type === 'card_payment' || tx.type === 'transfer_out')) return false;
  const categoryName = getCategoryName(tx);
  return categoryNames.size === 0 || categoryNames.has(categoryName);
}

function computeDailyBaseline(transactions, start, end, method) {
  const days = Math.max(1, Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS));
  if (!transactions.length) return 0;
  if (method === 'simple_daily') return sumTransactions(transactions, start, end) / days;

  const weeklySums = [];
  for (let cursor = new Date(start); cursor < end; cursor = addDays(cursor, 7)) {
    const next = minDate(addDays(cursor, 7), end);
    const spanDays = Math.max(1, Math.round((next.getTime() - cursor.getTime()) / DAY_MS));
    const sum = sumTransactions(transactions, cursor, next);
    weeklySums.push((sum / spanDays) * 7);
  }

  const nonZeroWeeks = weeklySums.filter(value => value > 0);
  if (nonZeroWeeks.length >= 4) return trimmedMean(nonZeroWeeks) / 7;

  const total = sumTransactions(transactions, start, end);
  return total / days;
}

function sumTransactions(transactions, from, to) {
  return transactions.reduce((sum, tx) => {
    const date = normalizeTxDate(tx?.occurredAt);
    if (!date || date < from || date >= to) return sum;
    return sum + safeAmount(tx?.amount);
  }, 0);
}

function trimmedMean(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 5) return average(sorted);
  const trim = Math.floor(sorted.length * 0.1);
  return average(sorted.slice(trim, sorted.length - trim));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pointsForSaved(saved, allocationRate) {
  return Math.max(0, Math.round(saved * allocationRate));
}

function safeAmount(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeTxDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function minDate(a, b) {
  return a < b ? a : b;
}

function dateKey(value) {
  const date = startOfDay(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizePointRates(value = {}, legacyAllocationRate) {
  const source = value && typeof value === 'object' ? value : {};
  const legacyRate = normalizeRate(legacyAllocationRate, DEFAULT_ALLOCATION_RATE);
  return Object.fromEntries(REWARD_POINT_BUCKETS.map(bucket => {
    const fallback = bucket.key === 'winePurchase' ? legacyRate : bucket.fallbackRate;
    return [bucket.key, normalizeRate(source[bucket.key], fallback)];
  }));
}

function normalizeRate(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const ratio = n > 1 ? n / 100 : n;
  return clamp(ratio, 0, 1);
}
