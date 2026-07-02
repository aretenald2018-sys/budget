// ================================================================
// utils/reward-savings.js - reward-based saving calculation
// ================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 180;
const DEFAULT_ALLOCATION_RATE = 0.3;
const DEFAULT_DAILY_POINT_CAP = 10000;
const DEFAULT_MONTH_POINT_CAP = 120000;

export function buildRewardSavingsSummary(options = {}) {
  const now = startOfDay(options.now || new Date());
  const categoryNames = new Set((options.categoryNames || []).filter(Boolean));
  const getCategoryName = typeof options.getCategoryName === 'function'
    ? options.getCategoryName
    : tx => tx?.category || '';
  const allocationRate = clamp(Number(options.allocationRate ?? DEFAULT_ALLOCATION_RATE), 0, 1);
  const dailyPointCap = Math.max(0, Math.round(Number(options.dailyPointCap ?? DEFAULT_DAILY_POINT_CAP) || 0));
  const monthPointCap = Math.max(0, Math.round(Number(options.monthPointCap ?? DEFAULT_MONTH_POINT_CAP) || 0));
  const lookbackDays = Math.max(30, Math.round(Number(options.lookbackDays || DEFAULT_LOOKBACK_DAYS)));

  const lookbackStart = addDays(now, -lookbackDays);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const transactions = (options.transactions || [])
    .filter(tx => isRewardExpense(tx, categoryNames, getCategoryName));

  const baselineTxs = transactions.filter(tx => {
    const date = normalizeTxDate(tx?.occurredAt);
    return date && date >= lookbackStart && date < now;
  });
  const dailyBaseline = Math.round(computeDailyBaseline(baselineTxs, lookbackStart, now));
  const baselineReady = dailyBaseline > 0;

  const todaySpend = sumTransactions(transactions, now, addDays(now, 1));
  const todaySaved = baselineReady ? Math.max(0, dailyBaseline - todaySpend) : 0;
  const todayPoints = pointsForSaved(todaySaved, allocationRate, dailyPointCap);

  const monthSpendByDay = new Map();
  for (const tx of transactions) {
    const date = normalizeTxDate(tx?.occurredAt);
    if (!date || date < monthStart || date >= addDays(now, 1)) continue;
    const key = dateKey(date);
    monthSpendByDay.set(key, (monthSpendByDay.get(key) || 0) + safeAmount(tx?.amount));
  }

  let monthSaved = 0;
  let monthPoints = 0;
  for (let cursor = new Date(monthStart); cursor <= now; cursor = addDays(cursor, 1)) {
    const spend = monthSpendByDay.get(dateKey(cursor)) || 0;
    const saved = baselineReady ? Math.max(0, dailyBaseline - spend) : 0;
    monthSaved += saved;
    monthPoints += pointsForSaved(saved, allocationRate, dailyPointCap);
  }
  monthPoints = Math.min(monthPointCap, Math.round(monthPoints));
  monthSaved = Math.round(monthSaved);

  const elapsedDays = Math.max(1, now.getDate());
  const daysInMonth = monthEnd.getDate();
  const projectedMonthPoints = baselineReady
    ? Math.min(monthPointCap, Math.round((monthPoints / elapsedDays) * daysInMonth))
    : 0;

  return {
    baselineReady,
    dailyBaseline,
    todaySpend: Math.round(todaySpend),
    todaySaved: Math.round(todaySaved),
    todayPoints,
    monthSaved,
    monthPoints,
    projectedMonthPoints,
    allocationRate,
    dailyPointCap,
    monthPointCap,
    elapsedDays,
    daysInMonth,
  };
}

function isRewardExpense(tx, categoryNames, getCategoryName) {
  if (!tx || tx.hidden) return false;
  if (!(tx.type === 'card_payment' || tx.type === 'transfer_out')) return false;
  const categoryName = getCategoryName(tx);
  return categoryNames.size === 0 || categoryNames.has(categoryName);
}

function computeDailyBaseline(transactions, start, end) {
  const days = Math.max(1, Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS));
  if (!transactions.length) return 0;

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

function pointsForSaved(saved, allocationRate, dailyPointCap) {
  return Math.min(dailyPointCap, Math.max(0, Math.round(saved * allocationRate)));
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

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
