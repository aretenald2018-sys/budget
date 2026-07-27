// ================================================================
// domain/rewards/savings.js - environment-independent reward calculation
// ================================================================

// ── 적립 규칙 ────────────────────────────────────────────────────
// 기준: 지난달 일 평균 소비액. 오늘 쓴 돈이 그보다 적으면 그 날은 '성공'이다.
// 적립: 성공한 날마다 항목별 목표 금액의 DAILY_RATE 만큼을 정액으로 쌓는다.
//       (아낀 금액에 비례해 쌓던 예전 방식과 다르다 — 성공/실패 판정이 먼저다)
// 항목별 하루 적립률은 설정에서 직접 조정한다.
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_RATE = 0.01;
const WIDGET_POINT_BUCKET_LIMIT = 4;
export const REWARD_WIDGET_SCHEMA_VERSION = 4;
const WIDGET_FUND_LIMIT = 4;
const REWARD_POINT_BUCKETS = [
  { key: 'winePurchase', label: '와인구매 포인트', fallbackRate: DEFAULT_DAILY_RATE, targetAmount: 120000, order: 10 },
  { key: 'premiumIngredients', label: '고급재료 포인트', fallbackRate: DEFAULT_DAILY_RATE, targetAmount: 80000, order: 20 },
  { key: 'travelFund', label: '여행충당 포인트', fallbackRate: DEFAULT_DAILY_RATE, targetAmount: 200000, order: 30 },
];

// 성공한 날 한 번에 쌓이는 포인트 = 목표 금액 × 하루 적립률.
export function dailyAccrualFor(targetAmount, rate) {
  return Math.max(0, Math.round(safeAmount(targetAmount) * normalizeRate(rate, 0)));
}

// 계산에 필요한 거래 조회 창의 시작. 기준이 '지난달'이므로 지난달 1일부터면 충분하다.
// (예전엔 lookbackDays 설정으로 180일씩 긁어왔는데, 이제 그만큼 필요하지 않다.)
export function rewardTxWindowStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
}

export function buildRewardSavingsSummary(options = {}) {
  const now = startOfDay(options.now || new Date());
  const enabled = options.enabled !== false;
  const categoryNames = new Set((options.categoryNames || []).filter(Boolean));
  const getCategoryName = typeof options.getCategoryName === 'function'
    ? options.getCategoryName
    : tx => tx?.category || '';
  const pointRates = normalizePointRates(options.pointRates, options.allocationRate);
  const pointItems = normalizePointItems(options.pointItems, pointRates);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const sourceTransactions = Array.isArray(options.transactions) ? options.transactions : [];
  const transactions = sourceTransactions
    .filter(tx => isRewardExpense(tx, categoryNames, getCategoryName));
  const pointUsageSpendByItem = rewardPointUsageSpendByItem(options.pointEntries, monthStart, addDays(now, 1));

  // 기준은 '지난달 일 평균 소비액' 하나다. 이번 달 소비는 기준을 흔들지 않는다.
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const dailyBaseline = enabled
    ? Math.round(previousMonthDailyAverage(transactions, prevMonthStart, monthStart))
    : 0;
  const baselineReady = dailyBaseline > 0;

  const todaySpend = sumTransactions(transactions, now, addDays(now, 1));
  const todaySaved = baselineReady ? Math.max(0, dailyBaseline - todaySpend) : 0;
  const todaySuccess = baselineReady && todaySpend < dailyBaseline;

  const monthSpendByDay = new Map();
  for (const tx of transactions) {
    const date = normalizeTxDate(tx?.occurredAt);
    if (!date || date < monthStart || date >= addDays(now, 1)) continue;
    const key = dateKey(date);
    monthSpendByDay.set(key, (monthSpendByDay.get(key) || 0) + safeAmount(tx?.amount));
  }

  // 이번 달 중 기준보다 적게 쓴 날의 수 = 적립이 일어난 날의 수.
  let monthSaved = 0;
  let successDays = 0;
  for (let cursor = new Date(monthStart); cursor <= now; cursor = addDays(cursor, 1)) {
    const spend = monthSpendByDay.get(dateKey(cursor)) || 0;
    if (!baselineReady) continue;
    monthSaved += Math.max(0, dailyBaseline - spend);
    if (spend < dailyBaseline) successDays += 1;
  }
  monthSaved = Math.round(monthSaved);

  const elapsedDays = Math.max(1, now.getDate());
  const daysInMonth = monthEnd.getDate();
  const pointBuckets = pointItemsWithUsageFallbacks(pointItems, pointUsageSpendByItem).map(bucket => {
    const rate = bucket.rate;
    const dailyPoints = dailyAccrualFor(bucket.targetAmount, rate);
    const todayPoints = todaySuccess ? dailyPoints : 0;
    const earnedMonthPoints = dailyPoints * successDays;
    const spentMonthPoints = pointUsageSpendByItem.get(bucket.id)?.amount || 0;
    const monthPoints = earnedMonthPoints - spentMonthPoints;
    // 남은 날도 지금까지와 같은 성공률이라면 이번 달에 얼마가 될지.
    const projectedMonthPoints = baselineReady
      ? Math.round(dailyPoints * (successDays / elapsedDays) * daysInMonth)
      : 0;
    return {
      key: bucket.id,
      label: bucket.label,
      rate,
      targetAmount: bucket.targetAmount,
      enabled: bucket.enabled,
      historyOnly: !!bucket.historyOnly,
      dailyPoints,
      todayPoints,
      earnedMonthPoints,
      spentMonthPoints,
      monthPoints,
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
    todaySuccess,
    successDays,
    todayPoints: wineBucket?.todayPoints || 0,
    monthSaved,
    monthPoints: wineBucket?.monthPoints || 0,
    projectedMonthPoints: wineBucket?.projectedMonthPoints || 0,
    allocationRate: wineBucket?.rate || 0,
    pointRates: pointRatesFromItems(pointItems),
    pointItems,
    pointBuckets,
    elapsedDays,
    daysInMonth,
  };
}

export function buildRewardWidgetSnapshot(summary = {}, updatedAt = new Date(), extra = {}) {
  const stsSource = extra.safeToSpend ?? summary.safeToSpend;
  const fundsSource = extra.funds ?? summary.funds;
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
  const pointBuckets = widgetSources.slice(0, WIDGET_POINT_BUCKET_LIMIT).map(bucket => ({
    key: String(bucket.key || bucket.id || ''),
    label: String(bucket.label || ''),
    rate: normalizeRate(bucket.rate, 0),
    targetAmount: safeAmount(bucket.targetAmount),
    dailyPoints: safeAmount(bucket.dailyPoints ?? dailyAccrualFor(bucket.targetAmount, bucket.rate)),
    todayPoints: safeAmount(bucket.todayPoints),
    earnedMonthPoints: safeAmount(bucket.earnedMonthPoints),
    spentMonthPoints: safeAmount(bucket.spentMonthPoints),
    monthPoints: signedAmount(bucket.monthPoints),
    projectedMonthPoints: safeAmount(bucket.projectedMonthPoints),
    historyOnly: !!bucket.historyOnly,
  }));
  return {
    schemaVersion: REWARD_WIDGET_SCHEMA_VERSION,
    updatedAt: isoTimestamp(updatedAt),
    baselineReady: !!summary.baselineReady,
    todaySaved: safeAmount(summary.todaySaved),
    todaySpend: safeAmount(summary.todaySpend),
    dailyBaseline: safeAmount(summary.dailyBaseline),
    todaySuccess: !!summary.todaySuccess,
    successDays: safeAmount(summary.successDays),
    pointBuckets,
    points: normalizeWidgetPointTotals(pointBuckets),
    safeToSpend: normalizeWidgetSafeToSpend(stsSource),
    funds: normalizeWidgetFunds(fundsSource),
  };
}

// 위젯 v3 히어로 보조: 버킷 전체를 합한 적립 포인트. 위젯이 4개 고정 행 대신
// "적립한 포인트" 한 덩어리를 먼저 보여줄 수 있게 한다.
function normalizeWidgetPointTotals(buckets = []) {
  const rows = Array.isArray(buckets) ? buckets : [];
  return {
    todayPoints: rows.reduce((sum, bucket) => sum + safeAmount(bucket.todayPoints), 0),
    monthPoints: rows.reduce((sum, bucket) => sum + signedAmount(bucket.monthPoints), 0),
    earnedMonthPoints: rows.reduce((sum, bucket) => sum + safeAmount(bucket.earnedMonthPoints), 0),
    spentMonthPoints: rows.reduce((sum, bucket) => sum + safeAmount(bucket.spentMonthPoints), 0),
    projectedMonthPoints: rows.reduce((sum, bucket) => sum + safeAmount(bucket.projectedMonthPoints), 0),
  };
}

// 위젯 v3 히어로: 지금 써도 되는 돈. 위젯이 이 블록을 항상 읽으므로 값이 없어도
// null 대신 0으로 채운 객체를 돌려줘 Java 쪽이 형태를 신뢰할 수 있게 한다.
function normalizeWidgetSafeToSpend(value) {
  const source = value && typeof value === 'object' ? value : {};
  const amount = signedAmount(source.amount);
  const perDay = safeAmount(source.perDay);
  const daysRemaining = safeAmount(source.daysRemaining);
  const week = spendableForNextDays({ perDay, daysRemaining }, 7);
  return {
    amount,
    perDay,
    daysRemaining,
    spentRatio: normalizeRate(source.spentRatio, 0),
    negative: source.negative != null ? !!source.negative : amount < 0,
    periodLabel: String(source.periodLabel || '').slice(0, 16),
    // 7일 환산: 남은 기간이 7일보다 짧으면 그만큼만 센다.
    weekDays: week.weekDays,
    weekAmount: week.weekAmount,
    ready: !!value && typeof value === 'object',
  };
}

// 남은 N일치 사용 가능액. 위젯 히어로가 2주 사이클의 perDay 를 그대로 쓰기 때문에
// 앱 홈 히어로와 절대 어긋나지 않는다.
export function spendableForNextDays(sts = {}, days = 7) {
  const perDay = Math.max(0, Math.round(Number(sts?.perDay) || 0));
  const daysRemaining = Math.max(0, Math.round(Number(sts?.daysRemaining) || 0));
  const span = Math.max(1, Math.round(Number(days) || 7));
  const weekDays = Math.max(0, Math.min(span, daysRemaining + 1));
  return { weekDays, weekAmount: perDay * weekDays };
}

// 종합 위젯 v3: 충당금 잔액(안심) 최대 4개.
function normalizeWidgetFunds(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, WIDGET_FUND_LIMIT).map(fund => ({
    emoji: String(fund?.emoji || '🧰').slice(0, 4),
    label: String(fund?.label || fund?.name || '').slice(0, 16),
    balance: signedAmount(fund?.balance),
    overdrawn: fund?.overdrawn != null ? !!fund.overdrawn : signedAmount(fund?.balance) < 0,
  }));
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

// 지난달 일 평균 소비액. 예전에는 180일 lookback + 주간 절사평균이었는데,
// "지난달보다 적게 썼나"라는 판정 기준으로는 지난달 한 달만 보는 게 맞다.
function previousMonthDailyAverage(transactions, prevMonthStart, prevMonthEnd) {
  const days = Math.max(1, Math.round((startOfDay(prevMonthEnd).getTime() - startOfDay(prevMonthStart).getTime()) / DAY_MS));
  return sumTransactions(transactions, prevMonthStart, prevMonthEnd) / days;
}

function sumTransactions(transactions, from, to) {
  return transactions.reduce((sum, tx) => {
    const date = normalizeTxDate(tx?.occurredAt);
    if (!date || date < from || date >= to) return sum;
    return sum + safeAmount(tx?.amount);
  }, 0);
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
  const legacyRate = normalizeDailyRate(legacyAllocationRate, DEFAULT_DAILY_RATE);
  return Object.fromEntries(REWARD_POINT_BUCKETS.map(bucket => {
    const fallback = bucket.key === 'winePurchase' ? legacyRate : bucket.fallbackRate;
    return [bucket.key, normalizeDailyRate(source[bucket.key], fallback)];
  }));
}

function normalizeRate(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const ratio = n > 1 ? n / 100 : n;
  return clamp(ratio, 0, 1);
}

// 하루 적립률은 '목표 금액의 몇 %를 매일 쌓을지'라 아주 작은 값이다.
// 예전 값(아낀 금액의 배분율, 기본 30%)이 그대로 남아 있으면 목표 금액의 30%가
// 매일 쌓여 하루 36,000P 가 되어버린다. 상한을 넘는 값은 옛 의미로 보고 기본값으로 되돌린다.
export const MAX_DAILY_RATE = 0.05;

export function normalizeDailyRate(value, fallback = DEFAULT_DAILY_RATE) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  const ratio = n > 1 ? n / 100 : n;
  if (ratio > MAX_DAILY_RATE) return fallback;
  return ratio;
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
    rate: normalizeDailyRate(item.rate ?? pointRates[id], fallbackRate),
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
