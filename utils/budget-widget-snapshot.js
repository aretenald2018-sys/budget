import { isBudgetExcluded } from '../domain/transactions/budget.js';

export const BUDGET_WIDGET_SCHEMA_VERSION = 1;

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') return asDate(value.toDate());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayStart(value) {
  const date = asDate(value) || new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function monthKey(value) {
  const date = asDate(value) || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function amountForExpense(tx) {
  if (!tx || isBudgetExcluded(tx)) return 0;
  return tx.type === 'card_payment' || tx.type === 'transfer_out' ? Math.max(0, Number(tx.amount) || 0) : 0;
}

function sumExpenses(transactions, from, to) {
  return Math.round((Array.isArray(transactions) ? transactions : []).reduce((sum, tx) => {
    const occurredAt = asDate(tx?.occurredAt);
    return occurredAt && occurredAt >= from && occurredAt < to ? sum + amountForExpense(tx) : sum;
  }, 0));
}

function budgetTarget(categories, key) {
  return Math.round((Array.isArray(categories) ? categories : [])
    .filter(category => category?.kind === 'expense')
    .reduce((sum, category) => sum + (Number(category?.monthlyTargets?.[key] ?? category?.target) || 0), 0));
}

function signedPercent(current, previous) {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function latestWine({ tastings = [], bottles = [] } = {}) {
  const bottleById = new Map((Array.isArray(bottles) ? bottles : []).map(bottle => [bottle?.id, bottle]));
  const sorted = (Array.isArray(tastings) ? tastings : [])
    .map(tasting => ({ tasting, date: asDate(tasting?.tastedAt) }))
    .filter(row => row.date)
    .sort((left, right) => right.date - left.date);
  const row = sorted[0];
  if (!row) return { state: 'empty', name: '', note: '', rating: null, tastedAt: null, imageThumbnail: '' };
  const bottle = bottleById.get(row.tasting?.bottleId) || {};
  return {
    state: 'ready',
    name: [bottle.name, bottle.vintage].filter(Boolean).join(' · ') || '이름 없는 와인',
    note: String(row.tasting?.taewooSummary || row.tasting?.note || row.tasting?.nose || '').trim().slice(0, 160),
    rating: Number.isFinite(Number(row.tasting?.taewooScore)) ? Number(row.tasting.taewooScore) : null,
    tastedAt: row.date.toISOString(),
    imageThumbnail: String(bottle.imageThumbnail || bottle.imageUrl || '').trim().slice(0, 200000),
  };
}

export function buildBudgetWidgetSnapshot({
  transactions = [],
  categories = [],
  rewardSummary = null,
  bottles = [],
  tastings = [],
  now = new Date(),
} = {}) {
  const current = dayStart(now);
  const currentMonth = monthKey(current);
  const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
  const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  const monthSpent = sumExpenses(transactions, monthStart, nextMonth);
  const monthTarget = budgetTarget(categories, currentMonth);
  const twoWeekStart = new Date(current.getTime() - 13 * 86400000);
  const previousTwoWeekStart = new Date(current.getTime() - 27 * 86400000);
  const twoWeekSpent = sumExpenses(transactions, twoWeekStart, new Date(current.getTime() + 86400000));
  const previousTwoWeekSpent = sumExpenses(transactions, previousTwoWeekStart, twoWeekStart);
  const trend = Array.from({ length: 6 }, (_, index) => {
    const from = new Date(current.getTime() - (5 - index) * 7 * 86400000);
    const to = new Date(from.getTime() + 7 * 86400000);
    return {
      label: `${from.getMonth() + 1}/${from.getDate()}`,
      amount: sumExpenses(transactions, from, to),
    };
  });

  const buckets = Array.isArray(rewardSummary?.pointBuckets) ? rewardSummary.pointBuckets : [];
  const monthPoints = Math.round(buckets.reduce((sum, bucket) => sum + (Number(bucket?.monthPoints) || 0), 0));
  const todayPoints = Math.round(buckets.reduce((sum, bucket) => sum + (Number(bucket?.todayPoints) || 0), 0));
  const focusBucket = buckets.find(bucket => bucket?.key === 'winePurchase') || buckets[0] || null;

  return {
    schemaVersion: BUDGET_WIDGET_SCHEMA_VERSION,
    updatedAt: (asDate(now) || new Date()).toISOString(),
    state: 'ready',
    spending: {
      monthKey: currentMonth,
      monthSpent,
      monthTarget,
      progress: monthTarget > 0 ? Math.min(100, Math.round((monthSpent / monthTarget) * 100)) : 0,
      twoWeekSpent,
      twoWeekPrevious: previousTwoWeekSpent,
      twoWeekDeltaPct: signedPercent(twoWeekSpent, previousTwoWeekSpent),
      trend,
    },
    points: {
      balance: monthPoints,
      monthPoints,
      todayPoints,
      focusLabel: String(focusBucket?.label || '포인트').trim().slice(0, 60),
    },
    wine: latestWine({ bottles, tastings }),
  };
}
