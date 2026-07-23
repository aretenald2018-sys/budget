// ================================================================
// domain/funds/provision.js - environment-independent sinking-fund math
//
// 충당금(sinking fund): 비정기 지출(과태료, 의류·장비, 등록비 등)을
// 매월 미리 적립해 두는 예산 내 주머니. 적립은 크론 없이 지연 계산.
// ================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
export const FUND_EXCLUDE_REASON = 'fund_covered';
export const FUND_DRAW_TX_TYPES = ['card_payment', 'transfer_out'];

export function monthKeyOf(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${m}`;
}

export function normalizeMonthKey(value, fallbackDate = new Date()) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKeyOf(fallbackDate);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return monthKeyOf(fallbackDate);
  return `${match[1]}-${match[2]}`;
}

export function normalizeProvisionFund(fund = {}, index = 0) {
  const name = String(fund.name || '').trim().slice(0, 24) || `충당금 ${index + 1}`;
  const emoji = String(fund.emoji || '').trim().slice(0, 4) || '🧰';
  const monthlyProvision = clampAmount(fund.monthlyProvision);
  const openingBalance = clampSignedAmount(fund.openingBalance);
  return {
    id: fund.id || null,
    name,
    emoji,
    order: Number.isFinite(Number(fund.order)) ? Number(fund.order) : (index + 1) * 10,
    monthlyProvision,
    startMonthKey: normalizeMonthKey(fund.startMonthKey),
    openingBalance,
    active: fund.active !== false && fund.active !== 'false',
  };
}

// 시작월부터 현재월까지(양쪽 포함) 매월 1일에 월 적립액 전액 적립.
export function accruedProvision(fund = {}, now = new Date()) {
  const normalized = normalizeProvisionFund(fund);
  const months = monthsInclusive(normalized.startMonthKey, monthKeyOf(now));
  return normalized.openingBalance + normalized.monthlyProvision * Math.max(0, months);
}

// 잔액 = 적립액 − 인출(연결 거래) + 유입 조정 − 유출 조정. 음수 허용(초과 인출).
export function fundBalance(fund = {}, drawTxs = [], adjustments = [], now = new Date()) {
  const fundId = fund.id || null;
  const drawn = (Array.isArray(drawTxs) ? drawTxs : [])
    .filter(tx => tx && !tx.hidden && FUND_DRAW_TX_TYPES.includes(tx.type))
    .filter(tx => !fundId || tx.fundId === fundId)
    .reduce((sum, tx) => sum + clampAmount(tx.amount), 0);
  const adjusted = netAdjustmentFor({ kind: 'fund', id: fundId }, adjustments);
  return accruedProvision(fund, now) - drawn + adjusted;
}

export function buildFundStatus(fund = {}, drawTxs = [], adjustments = [], now = new Date()) {
  const normalized = normalizeProvisionFund(fund);
  const accrued = accruedProvision(fund, now);
  const balance = fundBalance(fund, drawTxs, adjustments, now);
  return {
    ...normalized,
    id: fund.id || null,
    accrued,
    drawn: accrued + netAdjustmentFor({ kind: 'fund', id: fund.id || null }, adjustments) - balance,
    balance,
    overdrawn: balance < 0,
  };
}

// 히어로 산식: 지금 써도 되는 돈 = 예산 − 충당금 적립분 + 재배분 순유입 − 지출
// budgetTotal(B)/spentTotal(S)은 features 계층(targetFor/usedFor)에서 계산해 전달.
export function buildSafeToSpendSummary(options = {}) {
  const {
    budgetTotal = 0,
    spentTotal = 0,
    funds = [],
    adjustments = [],
    mode = 'cycle',
    monthKey = monthKeyOf(options.now || new Date()),
    cycleRange = null,
    controlCategoryNames = [],
    now = new Date(),
  } = options;

  const activeFunds = (Array.isArray(funds) ? funds : [])
    .map(fund => normalizeProvisionFund(fund))
    .filter(fund => fund.active)
    .filter(fund => monthsInclusive(fund.startMonthKey, monthKeyOf(now)) > 0);
  const monthlyProvisionTotal = activeFunds.reduce((sum, fund) => sum + fund.monthlyProvision, 0);
  const provisions = mode === 'cycle'
    ? activeFunds.reduce((sum, fund) => sum + Math.round(fund.monthlyProvision / 2), 0)
    : monthlyProvisionTotal;

  const controlNames = new Set(controlCategoryNames);
  const adjustmentsNet = (Array.isArray(adjustments) ? adjustments : []).reduce((sum, adj) => {
    const amount = clampAmount(adj?.amount);
    if (!amount) return sum;
    let net = sum;
    if (adj?.to?.kind === 'category' && controlNames.has(adj.to.label)) net += amount;
    if (adj?.from?.kind === 'category' && controlNames.has(adj.from.label)) net -= amount;
    return net;
  }, 0);

  const budget = Math.round(Number(budgetTotal) || 0);
  const spent = Math.round(Number(spentTotal) || 0);
  const amount = budget - provisions + adjustmentsNet - spent;
  const daysRemaining = remainingDays({ mode, monthKey, cycleRange, now });
  const available = budget - provisions + adjustmentsNet;

  return {
    amount,
    budget,
    provisions,
    monthlyProvisionTotal,
    adjustments: adjustmentsNet,
    spent,
    available,
    negative: amount < 0,
    spentRatio: available > 0 ? Math.min(1, Math.max(0, spent / available)) : (spent > 0 ? 1 : 0),
    daysRemaining,
    perDay: Math.floor(Math.max(0, amount) / (daysRemaining + 1)),
  };
}

export function validateAdjustment(adjustment = {}) {
  const amount = clampAmount(adjustment.amount);
  if (amount < 1) return { valid: false, reason: '금액을 입력하세요.' };
  const from = adjustment.from || {};
  const to = adjustment.to || {};
  if (!to.kind || (to.kind !== 'category' && to.kind !== 'fund')) {
    return { valid: false, reason: '받는 곳을 선택하세요.' };
  }
  if (!from.kind || !['category', 'fund', 'external'].includes(from.kind)) {
    return { valid: false, reason: '가져올 곳을 선택하세요.' };
  }
  if (from.kind === to.kind && from.id && to.id && from.id === to.id) {
    return { valid: false, reason: '같은 항목으로는 재배분할 수 없습니다.' };
  }
  return { valid: true, reason: '' };
}

export function netAdjustmentFor(target = {}, adjustments = []) {
  const kind = target.kind || 'category';
  const id = target.id || null;
  const label = target.label || null;
  // id 우선 매칭, 한쪽이라도 id가 없으면 label 폴백(카테고리명은 집계 키라 유일).
  const matches = side => side
    && side.kind === kind
    && ((id && side.id === id) || (label && side.label === label && (!id || !side.id)));
  return (Array.isArray(adjustments) ? adjustments : []).reduce((sum, adj) => {
    const amount = clampAmount(adj?.amount);
    if (!amount) return sum;
    let net = sum;
    if (matches(adj?.to)) net += amount;
    if (matches(adj?.from)) net -= amount;
    return net;
  }, 0);
}

function monthsInclusive(fromMonthKey, toMonthKey) {
  const from = parseMonthKey(fromMonthKey);
  const to = parseMonthKey(toMonthKey);
  if (!from || !to) return 0;
  return (to.year - from.year) * 12 + (to.month - from.month) + 1;
}

function parseMonthKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

function remainingDays({ mode, monthKey, cycleRange, now }) {
  const current = now instanceof Date ? now : new Date(now);
  if (mode === 'cycle' && cycleRange?.start instanceof Date && cycleRange?.end instanceof Date) {
    const clamped = Math.min(Math.max(current.getTime(), cycleRange.start.getTime()), cycleRange.end.getTime());
    const dayN = Math.min(14, Math.max(1, Math.floor((clamped - cycleRange.start.getTime()) / DAY_MS) + 1));
    return Math.max(0, 14 - dayN);
  }
  const parsed = parseMonthKey(monthKey) || { year: current.getFullYear(), month: current.getMonth() + 1 };
  const daysInMonth = new Date(parsed.year, parsed.month, 0).getDate();
  const sameMonth = current.getFullYear() === parsed.year && current.getMonth() + 1 === parsed.month;
  if (!sameMonth) return current < new Date(parsed.year, parsed.month - 1, 1) ? daysInMonth - 1 : 0;
  return Math.max(0, daysInMonth - current.getDate());
}

function clampAmount(value) {
  const n = Math.round(Number(value) || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function clampSignedAmount(value) {
  const n = Math.round(Number(value) || 0);
  return Number.isFinite(n) ? n : 0;
}
