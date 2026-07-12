// ================================================================
// domain/rewards/savings.js - environment-independent reward calculation
// ================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 180;
const DEFAULT_ALLOCATION_RATE = 0.3;
const DEFAULT_BASELINE_METHOD = 'trimmed_weekly';
const WIDGET_POINT_BUCKET_LIMIT = 4;
const REWARD_POINT_BUCKETS = [
  { key: 'winePurchase', label: '와인구매 포인트', fallbackRate: DEFAULT_ALLOCATION_RATE, targetAmount: 120000, order: 10 },
  { key: 'premiumIngredients', label: '고급재료 포인트', fallbackRate: 0, targetAmount: 80000, order: 20 },
  { key: 'travelFund', label: '여행충당 포인트', fallbackRate: 0, targetAmount: 200000, order: 30 },
];
const DEFAULT_DAILY_REWARD = {
  enabled: true,
  selectedDateKey: '',
  selectedRuleId: '',
  focusBucketKey: '',
  bonusRate: 0.1,
  bonusCap: 5000,
  freezeCount: 1,
  streakDays: 0,
  tierLabel: '브론즈 1단계',
};

export function buildRewardSavingsSummary(options = {}) {
  const now = startOfDay(options.now || new Date());
  const enabled = options.enabled !== false;
  const categoryNames = new Set((options.categoryNames || []).filter(Boolean));
  const getCategoryName = typeof options.getCategoryName === 'function'
    ? options.getCategoryName
    : tx => tx?.category || '';
  const pointRates = normalizePointRates(options.pointRates, options.allocationRate);
  const pointItems = normalizePointItems(options.pointItems, pointRates);
  const dailyRewardSettings = normalizeDailyRewardSettings(options.dailyReward);
  const lookbackDays = Math.max(30, Math.round(Number(options.lookbackDays || DEFAULT_LOOKBACK_DAYS)));
  const baselineMethod = ['trimmed_weekly', 'simple_daily'].includes(options.baselineMethod)
    ? options.baselineMethod
    : DEFAULT_BASELINE_METHOD;

  const lookbackStart = addDays(now, -lookbackDays);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const sourceTransactions = Array.isArray(options.transactions) ? options.transactions : [];
  const transactions = sourceTransactions
    .filter(tx => isRewardExpense(tx, categoryNames, getCategoryName));
  const pointUsageSpendByItem = rewardPointUsageSpendByItem(options.pointEntries, monthStart, addDays(now, 1));

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
  let pointBuckets = pointItemsWithUsageFallbacks(pointItems, pointUsageSpendByItem).map(bucket => {
    const rate = bucket.rate;
    const todayPoints = pointsForSaved(todaySaved, rate);
    const earnedMonthPoints = Math.round(savedByDay.reduce((sum, saved) => sum + pointsForSaved(saved, rate), 0));
    const spentMonthPoints = pointUsageSpendByItem.get(bucket.id)?.amount || 0;
    const monthPoints = earnedMonthPoints - spentMonthPoints;
    const projectedMonthPoints = baselineReady
      ? Math.round(todayPoints * daysInMonth)
      : 0;
    return {
      key: bucket.id,
      label: bucket.label,
      rate,
      targetAmount: bucket.targetAmount,
      enabled: bucket.enabled,
      historyOnly: !!bucket.historyOnly,
      todayBasePoints: todayPoints,
      todayBonusPoints: 0,
      todayPoints,
      earnedMonthPoints,
      spentMonthPoints,
      monthPoints,
      projectedMonthPoints,
    };
  });
  let dailyReward = buildDailyRewardState(dailyRewardSettings, {
    now,
    baselineReady,
    todaySaved,
    pointBuckets: pointBuckets.filter(bucket => !bucket.historyOnly),
  });
  const ruleBonusPoints = dailyReward.status === 'selected'
    ? Math.min(pointsForSaved(todaySaved, dailyReward.bonusRate), dailyReward.bonusCap)
    : 0;
  if (ruleBonusPoints > 0 && dailyReward.focusBucketKey) {
    pointBuckets = pointBuckets.map(bucket => {
      if (bucket.key !== dailyReward.focusBucketKey) return bucket;
      return {
        ...bucket,
        todayBonusPoints: ruleBonusPoints,
        todayPoints: bucket.todayBasePoints + ruleBonusPoints,
        earnedMonthPoints: bucket.earnedMonthPoints + ruleBonusPoints,
        monthPoints: bucket.monthPoints + ruleBonusPoints,
        projectedMonthPoints: bucket.projectedMonthPoints + ruleBonusPoints,
      };
    });
  }
  dailyReward = {
    ...dailyReward,
    ruleBonusPoints,
    bonusText: ruleBonusPoints ? `오늘 카드 +${formatNumber(ruleBonusPoints)}P` : '오늘 카드 대기',
  };
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
    pointRates: pointRatesFromItems(pointItems),
    pointItems,
    pointBuckets,
    dailyReward,
    ruleBonusPoints,
    lookbackDays,
    baselineMethod,
    elapsedDays,
    daysInMonth,
  };
}

export function buildRewardWidgetSnapshot(summary = {}, updatedAt = new Date()) {
  const sourceBuckets = Array.isArray(summary.pointBuckets) ? summary.pointBuckets : [];
  const fallbackItems = normalizePointItems(summary.pointItems, summary.pointRates || {});
  const widgetSources = sourceBuckets.length
    ? sourceBuckets
    : fallbackItems.filter(item => item.enabled).map(item => ({
        key: item.id,
        label: item.label,
        rate: item.rate,
        targetAmount: item.targetAmount,
      }));
  const pointBuckets = widgetSources.slice(0, WIDGET_POINT_BUCKET_LIMIT).map(bucket => {
    const todayBonusPoints = safeAmount(bucket.todayBonusPoints);
    const todayPoints = safeAmount(bucket.todayPoints);
    const todayBasePoints = safeAmount(bucket.todayBasePoints ?? Math.max(0, todayPoints - todayBonusPoints));
    return {
      key: String(bucket.key || bucket.id || ''),
      label: String(bucket.label || ''),
      rate: normalizeRate(bucket.rate, 0),
      targetAmount: safeAmount(bucket.targetAmount),
      todayBasePoints,
      todayBonusPoints,
      todayPoints,
      earnedMonthPoints: safeAmount(bucket.earnedMonthPoints),
      spentMonthPoints: safeAmount(bucket.spentMonthPoints),
      monthPoints: signedAmount(bucket.monthPoints),
      projectedMonthPoints: safeAmount(bucket.projectedMonthPoints),
      historyOnly: !!bucket.historyOnly,
    };
  });
  return {
    schemaVersion: 2,
    updatedAt: isoTimestamp(updatedAt),
    baselineReady: !!summary.baselineReady,
    todaySaved: safeAmount(summary.todaySaved),
    todaySpend: safeAmount(summary.todaySpend),
    dailyBaseline: safeAmount(summary.dailyBaseline),
    ruleBonusPoints: safeAmount(summary.ruleBonusPoints),
    dailyReward: normalizeWidgetDailyReward(summary.dailyReward, summary.ruleBonusPoints),
    pointBuckets,
  };
}

function isRewardExpense(tx, categoryNames, getCategoryName) {
  if (!tx || tx.hidden) return false;
  if (!(tx.type === 'card_payment' || tx.type === 'transfer_out')) return false;
  const categoryName = getCategoryName(tx);
  return categoryNames.size === 0 || categoryNames.has(categoryName);
}

function rewardPointUsageSpendByItem(entries, from, to) {
  const spendByItem = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || entry.hidden) continue;
    const date = normalizeTxDate(entry?.usedAt);
    if (!date || date < from || date >= to) continue;
    const usage = normalizeRewardPointUsage(entry);
    if (!usage) continue;
    const current = spendByItem.get(usage.pointItemId) || { amount: 0, label: usage.pointItemLabel };
    spendByItem.set(usage.pointItemId, {
      amount: current.amount + usage.amount,
      label: current.label || usage.pointItemLabel,
    });
  }
  return spendByItem;
}

function normalizeRewardPointUsage(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const pointItemId = normalizePointItemId(entry.pointItemId || entry.itemId || entry.key);
  const amount = safeAmount(entry.amount);
  if (!pointItemId || amount <= 0) return null;
  const pointItemLabel = String(entry.pointItemLabel || entry.label || pointItemId).trim().slice(0, 32) || pointItemId;
  return { pointItemId, pointItemLabel, amount };
}

function pointItemsWithUsageFallbacks(pointItems, pointUsageSpendByItem) {
  const used = new Set();
  const rows = [];
  for (const item of pointItems) {
    const usage = pointUsageSpendByItem.get(item.id);
    if (!item.enabled && !usage) continue;
    used.add(item.id);
    rows.push({
      ...item,
      rate: item.enabled ? item.rate : 0,
      enabled: item.enabled,
      historyOnly: !item.enabled,
    });
  }
  for (const [id, usage] of pointUsageSpendByItem.entries()) {
    if (used.has(id)) continue;
    rows.push({
      id,
      label: usage.label || id,
      rate: 0,
      targetAmount: 0,
      enabled: true,
      historyOnly: true,
      order: 100000 + rows.length * 10,
    });
  }
  return rows;
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

function normalizeDailyRewardSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: source.enabled !== false && source.enabled !== 'false',
    selectedDateKey: normalizeDateKey(source.selectedDateKey),
    selectedRuleId: String(source.selectedRuleId || '').trim().slice(0, 32),
    focusBucketKey: normalizePointItemId(source.focusBucketKey),
    bonusRate: normalizeRate(source.bonusRate, DEFAULT_DAILY_REWARD.bonusRate),
    bonusCap: normalizeTargetAmount(source.bonusCap, DEFAULT_DAILY_REWARD.bonusCap),
    freezeCount: clampInteger(source.freezeCount, 0, 12, DEFAULT_DAILY_REWARD.freezeCount),
    streakDays: clampInteger(source.streakDays, 0, 999, DEFAULT_DAILY_REWARD.streakDays),
    tierLabel: String(source.tierLabel || DEFAULT_DAILY_REWARD.tierLabel).trim().slice(0, 24),
  };
}

function buildDailyRewardState(settings, context) {
  const pointBuckets = Array.isArray(context.pointBuckets) ? context.pointBuckets : [];
  const todayKey = dateKey(context.now);
  const configuredFocusBucket = pointBuckets.find(bucket => bucket.key === settings.focusBucketKey) || null;
  const focusBucket = configuredFocusBucket || pointBuckets[0] || null;
  const selectedToday = settings.selectedDateKey === todayKey
    && settings.selectedRuleId === 'focusPoint'
    && !!configuredFocusBucket;
  const status = !settings.enabled
    ? 'disabled'
    : (!context.baselineReady ? 'waiting' : (selectedToday ? 'selected' : 'unselected'));
  const focusLabel = focusBucket ? focusRewardLabel(focusBucket.label) : '';
  return {
    enabled: settings.enabled,
    status,
    todayDateKey: todayKey,
    selectedDateKey: settings.selectedDateKey,
    selectedRuleId: selectedToday ? 'focusPoint' : settings.selectedRuleId,
    focusBucketKey: focusBucket?.key || settings.focusBucketKey,
    label: focusLabel ? `${focusLabel} 집중` : '오늘 카드',
    bonusRate: settings.bonusRate,
    bonusCap: settings.bonusCap,
    freezeCount: settings.freezeCount,
    streakDays: settings.streakDays,
    tierLabel: settings.tierLabel,
    freezeText: `쉬어가기권 ${settings.freezeCount}장`,
    streakText: settings.streakDays ? `연속 적립 ${settings.streakDays}일` : '연속 적립 시작',
    helperText: '내가 고른 포인트 항목에 오늘 절약분 보너스를 더해요.',
    nextStepText: buildNextStepText(focusBucket),
    options: pointBuckets.map(bucket => ({
      key: bucket.key,
      label: `${focusRewardLabel(bucket.label)} 집중`,
      helperText: `오늘 절약분 +${formatRatePct(settings.bonusRate)}%`,
    })),
  };
}

function normalizeWidgetDailyReward(value = {}, fallbackBonusPoints = 0) {
  const source = value && typeof value === 'object' ? value : {};
  const status = String(source.status || '').trim();
  return {
    status: ['disabled', 'waiting', 'unselected', 'selected'].includes(status) ? status : '',
    label: String(source.label || '').trim().slice(0, 40),
    focusBucketKey: String(source.focusBucketKey || '').trim().slice(0, 48),
    selectedDateKey: normalizeDateKey(source.selectedDateKey),
    ruleBonusPoints: safeAmount(source.ruleBonusPoints ?? fallbackBonusPoints),
    bonusText: String(source.bonusText || '').trim().slice(0, 40),
    nextStepText: String(source.nextStepText || '').trim().slice(0, 60),
    freezeText: String(source.freezeText || '').trim().slice(0, 32),
    streakText: String(source.streakText || '').trim().slice(0, 32),
    tierLabel: String(source.tierLabel || '').trim().slice(0, 24),
  };
}

function focusRewardLabel(label) {
  const text = String(label || '').replace(/\s*포인트\s*$/, '').trim();
  return text || '포인트';
}

function buildNextStepText(bucket) {
  if (!bucket || !bucket.targetAmount) return '';
  const remain = Math.max(0, safeAmount(bucket.targetAmount) - signedAmount(bucket.monthPoints));
  return remain ? `${focusRewardLabel(bucket.label)}까지 ${formatNumber(remain)}P` : `${focusRewardLabel(bucket.label)} 목표 도착`;
}

function normalizeDateKey(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function clampInteger(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function formatNumber(value) {
  return safeAmount(value).toLocaleString('ko-KR');
}

function formatRatePct(value) {
  const pct = normalizeRate(value, 0) * 100;
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
}

function safeAmount(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function signedAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
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

function normalizePointItems(value, pointRates = {}) {
  const source = Array.isArray(value)
    ? value
    : REWARD_POINT_BUCKETS.map(bucket => ({
        id: bucket.key,
        label: bucket.label,
        rate: pointRates[bucket.key] ?? bucket.fallbackRate,
        targetAmount: bucket.targetAmount,
        enabled: true,
        order: bucket.order,
      }));
  const used = new Set();
  return source
    .map((item, index) => normalizePointItem(item, index, pointRates, used))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

function normalizePointItem(item = {}, index = 0, pointRates = {}, used = new Set()) {
  const fallback = REWARD_POINT_BUCKETS[index] || {};
  const id = uniquePointItemId(normalizePointItemId(item.id || item.key || fallback.key || `customPoint${index + 1}`), used);
  const label = String(item.label || fallback.label || `포인트 ${index + 1}`).trim().slice(0, 32) || `포인트 ${index + 1}`;
  const fallbackRate = pointRates[id] ?? pointRates[fallback.key] ?? fallback.fallbackRate ?? 0;
  return {
    id,
    label,
    rate: normalizeRate(item.rate ?? pointRates[id], fallbackRate),
    targetAmount: normalizeTargetAmount(item.targetAmount, fallback.targetAmount ?? 100000),
    enabled: item.enabled !== false && item.enabled !== 'false',
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : (index + 1) * 10,
  };
}

function normalizePointItemId(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48);
  return normalized || 'customPoint';
}

function uniquePointItemId(base, used) {
  let id = base || 'customPoint';
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function normalizeTargetAmount(value, fallback = 100000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return safeAmount(fallback);
  return Math.min(999999999, safeAmount(n));
}

function pointRatesFromItems(items = []) {
  return Object.fromEntries((Array.isArray(items) ? items : []).map(item => [item.id, item.rate]));
}
