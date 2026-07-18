import { displayCategoryName, isBudgetExcluded } from '../../domain/transactions/budget.js';
import { cycleRangeForDate } from '../../utils/cycles.js';
import { buildCanonicalWinePurchasePoints, kstMonthStartDate, toKstPseudoLocalDate } from './daybird-reward-points.js';
import { getAdminDb } from './firebase-admin.js';

const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_WEIGHTS = Object.freeze({ food: 25, health: 25, running: 20, spending: 20, wine: 10 });

export async function loadCanonicalBudgetDashboardSource(ownerUid, options = {}) {
  const db = options.db || getAdminDb();
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const base = db.doc(`users/${ownerUid}`);
  const from = new Date(now.getTime() - 380 * DAY_MS);
  const monthStart = kstMonthStartDate(now);
  const [transactions, categories, tastings, bottles, appSettingsSnapshot, dashboardSettingsSnapshot, pointEntries] = await Promise.all([
    base.collection('transactions').where('occurredAt', '>=', from).where('occurredAt', '<=', now).orderBy('occurredAt', 'desc').limit(5000).get(),
    base.collection('categories').get(),
    base.collection('wine_tastings').orderBy('tastedAt', 'desc').limit(100).get(),
    base.collection('wine_bottles').get(),
    base.collection('settings').doc('app').get(),
    base.collection('dashboard_settings').doc('config').get(),
    base.collection('reward_point_entries').where('usedAt', '>=', monthStart).where('usedAt', '<=', now).orderBy('usedAt', 'desc').limit(500).get(),
  ]);
  return buildCanonicalBudgetDashboardSource({
    transactions: documentsWithIds(transactions),
    categories: documentsWithIds(categories),
    tastings: documentsWithIds(tastings),
    bottles: documentsWithIds(bottles),
    appSettings: appSettingsSnapshot.exists ? appSettingsSnapshot.data() : {},
    dashboardSettings: dashboardSettingsSnapshot.exists ? dashboardSettingsSnapshot.data() : {},
    pointEntries: documentsWithIds(pointEntries),
    now,
  });
}

export function buildCanonicalBudgetDashboardSource({
  transactions = [], categories = [], tastings = [], bottles = [],
  appSettings = {}, dashboardSettings = {}, pointEntries = [], now = new Date(),
} = {}) {
  const rewardSettings = isObject(appSettings.rewardSavings) ? appSettings.rewardSavings : {};
  const points = buildCanonicalWinePurchasePoints({ transactions, categories, pointEntries, rewardSettings, now });
  return {
    spending: buildSpendingSnapshot({ transactions, categories, appSettings, now }),
    wine: buildWineSnapshot({ tastings, bottles }),
    points,
    weights: normalizeWeights(dashboardSettings.weights),
    sourceEnvironment: 'budget',
  };
}

export function buildSpendingSnapshot({ transactions = [], categories = [], appSettings = {}, now = new Date() } = {}) {
  const nowEpochMs = dateEpoch(now) || Date.now();
  const { year, monthIndex, day } = kstParts(nowEpochMs);
  const monthStart = Date.UTC(year, monthIndex, 1) - KST_OFFSET_MS;
  const nextMonthStart = Date.UTC(year, monthIndex + 1, 1) - KST_OFFSET_MS;
  const previousMonthStart = Date.UTC(year, monthIndex - 1, 1) - KST_OFFSET_MS;
  const previousMonthEnd = monthStart - 1;
  const previousMonthDayCount = kstParts(previousMonthEnd).day;
  const comparableDay = Math.min(day, previousMonthDayCount);
  const currentCutoff = Date.UTC(year, monthIndex, day + 1) - KST_OFFSET_MS;
  const previousCutoff = Date.UTC(year, monthIndex - 1, comparableDay + 1) - KST_OFFSET_MS;
  const categoryById = new Map(categories.map(category => [category.id, category]));
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const controlCategories = categories.filter(category => category.kind === 'expense' && category.budgetRhythm !== 'fixed');
  const isControl = transaction => {
    const category = categoryById.get(transaction.categoryId) || categories.find(row => row.name === displayCategoryName(transaction));
    return !category || category.budgetRhythm !== 'fixed';
  };
  const rows = transactions.map(transaction => {
    const epochMs = dateEpoch(transaction.occurredAt || transaction.date || transaction.createdAt);
    const expense = transactionExpense(transaction);
    return { epochMs, expense, controlExpense: isControl(transaction) ? expense : 0 };
  }).filter(row => row.epochMs != null);
  const sumRows = (from, to, key) => rows.filter(row => row.epochMs >= from && row.epochMs < to).reduce((sum, row) => sum + row[key], 0);
  const currentSpent = sumRows(monthStart, currentCutoff, 'expense');
  const previousSpent = sumRows(previousMonthStart, previousCutoff, 'expense');
  const currentCumulativeTrend = [];
  const previousCumulativeTrend = [];
  let currentCumulative = 0;
  let previousCumulative = 0;
  for (let date = 1; date <= day; date += 1) {
    const currentDayStart = Date.UTC(year, monthIndex, date) - KST_OFFSET_MS;
    currentCumulative += sumRows(currentDayStart, currentDayStart + DAY_MS, 'expense');
    if (date <= previousMonthDayCount) {
      const previousDayStart = Date.UTC(year, monthIndex - 1, date) - KST_OFFSET_MS;
      previousCumulative += sumRows(previousDayStart, previousDayStart + DAY_MS, 'expense');
    }
    currentCumulativeTrend.push(Math.round(currentCumulative));
    previousCumulativeTrend.push(Math.round(previousCumulative));
  }
  const todayKey = dateKeyAt(nowEpochMs);
  const cycle = biweeklyRange(nowEpochMs, appSettings.biweeklyStartDate);
  const target = controlCategories.reduce((sum, category) => sum + biweeklyTarget(category, monthKey), 0);
  const twoWeekSpent = rows.filter(row => row.controlExpense > 0 && dateKeyAt(row.epochMs) >= cycle.startDate && dateKeyAt(row.epochMs) <= todayKey)
    .reduce((sum, row) => sum + row.controlExpense, 0);
  const todaySpent = rows.filter(row => row.controlExpense > 0 && dateKeyAt(row.epochMs) === todayKey)
    .reduce((sum, row) => sum + row.controlExpense, 0);
  return {
    samePeriodDifference: Math.round(previousSpent - currentSpent),
    samePeriodChangePct: previousSpent > 0 ? round((currentSpent - previousSpent) / previousSpent * 100, 1) : null,
    previousSamePeriodSpent: Math.round(previousSpent),
    monthSpent: Math.round(currentSpent),
    comparisonDay: comparableDay,
    currentCumulativeTrend,
    previousCumulativeTrend,
    twoWeek: {
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      spent: Math.round(twoWeekSpent),
      target: Math.round(target),
      todaySpent: Math.round(todaySpent),
      todayTarget: target > 0 ? Math.round(target / 14) : 0,
    },
  };
}

export function buildWineSnapshot({ tastings = [], bottles = [] } = {}) {
  const bottleById = new Map(bottles.map(bottle => [bottle.id, bottle]));
  const latest = tastings.map(tasting => ({ ...tasting, epochMs: dateEpoch(tasting.tastedAt || tasting.createdAt) }))
    .filter(tasting => tasting.epochMs != null)
    .sort((left, right) => right.epochMs - left.epochMs)[0] || null;
  if (!latest) return null;
  const bottle = bottleById.get(latest.bottleId) || {};
  return {
    tastingId: latest.id || null,
    bottleId: latest.bottleId || null,
    tastedAtEpochMs: latest.epochMs,
    name: bottle.name || latest.wineName || '와인 기록',
    vintage: bottle.vintage || null,
    note: latest.taewooSummary || latest.note || '',
    rating: positive(latest.taewooScore),
    imageThumbnail: bottle.imageThumbnail || bottle.imageUrl || null,
  };
}

function transactionExpense(transaction) {
  if (!transaction || transaction.hidden || isBudgetExcluded(transaction)) return 0;
  if (!['card_payment', 'transfer_out'].includes(transaction.type)) return 0;
  return Math.max(0, number(transaction.amount));
}
function biweeklyTarget(category, monthKey) {
  const monthly = number(category.monthlyTargets?.[monthKey] ?? category.target);
  return category.budgetRhythm === 'front_loaded' ? Math.round(monthly) : Math.round(monthly / 2);
}
function biweeklyRange(nowEpochMs, anchorDate) {
  const canonicalDate = toKstPseudoLocalDate(new Date(nowEpochMs));
  const range = cycleRangeForDate(canonicalDate, anchorDate);
  return { startDate: localDateKey(range.start), endDate: localDateKey(range.end) };
}
function normalizeWeights(value) {
  const source = isObject(value) ? value : DEFAULT_WEIGHTS;
  const normalized = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map(key => [key, Math.max(0, Math.min(100, Math.round(number(source[key], DEFAULT_WEIGHTS[key]))))]));
  return Object.values(normalized).reduce((sum, weight) => sum + weight, 0) === 100 ? normalized : { ...DEFAULT_WEIGHTS };
}
function kstParts(epochMs) { const date = new Date(epochMs + KST_OFFSET_MS); return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth(), day: date.getUTCDate() }; }
function dateKeyAt(epochMs) { const { year, monthIndex, day } = kstParts(epochMs); return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function localDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function dateEpoch(value) { if (!value) return null; if (typeof value.toDate === 'function') return value.toDate().getTime(); const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date.getTime(); }
function documentsWithIds(snapshot) { return snapshot.docs.map(document => ({ id: document.id, ...document.data() })); }
function round(value, digits = 1) { const factor = 10 ** digits; return Math.round(number(value) * factor) / factor; }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function positive(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
