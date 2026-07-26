// ================================================================
// domain/budget/period.js — 예산 기간(주기) 단일 모델
//
// 설정 탭 '전체 예산'과 홈 탭 '기간 설정'이 서로 다른 값을 쓰던 문제를 없애기 위해,
// 기간에 대한 판단은 전부 이 순수 모듈을 거친다.
//
// SSOT
// - `appSettings.budget.cycle`      : 지금 적용 중인 주기. 홈의 기간 = 이 값.
// - `appSettings.budget.cycleUnit`  : 월 모드에서 되돌아갈 주기 단위(기억용).
// - `appSettings.budget.customDays` : cycle==='custom'일 때 주기 일수.
// - `appSettings.biweeklyStartDate` : 주기 시작 앵커 날짜(2주/매주/직접 공용).
// ================================================================

// budget 스키마 버전. v1 = 기간 통합 이전(amount 기준이 '월'), v2 = 현재(amount 기준이 '한 주기').
export const BUDGET_SETTINGS_VERSION = 2;

export const BUDGET_CYCLES = ['monthly', 'biweekly', 'weekly', 'custom'];
// 'monthly'는 달력 월이라 단위가 아니다 — 월 모드에서 되돌아갈 수 있는 단위만.
export const BUDGET_CYCLE_UNITS = ['biweekly', 'weekly', 'custom'];

export const DEFAULT_BUDGET_CYCLE = 'biweekly';
export const DEFAULT_CUSTOM_DAYS = 14;
export const MIN_CUSTOM_DAYS = 2;
export const MAX_CUSTOM_DAYS = 90;

const FIXED_CYCLE_DAYS = { biweekly: 14, weekly: 7 };

// 월 목표를 주기 목표로 안분할 때 쓰는 기준 월 길이(4주).
// 2주 = 정확히 1/2이라 기존 '월 목표의 절반' 동작과 값이 같다.
export const CYCLE_PRORATION_BASE_DAYS = 28;

export function normalizeBudgetCycle(value, fallback = DEFAULT_BUDGET_CYCLE) {
  const cycle = String(value || '').toLowerCase();
  return BUDGET_CYCLES.includes(cycle) ? cycle : fallback;
}

export function normalizeCycleUnit(value, fallback = DEFAULT_BUDGET_CYCLE) {
  const unit = String(value || '').toLowerCase();
  if (BUDGET_CYCLE_UNITS.includes(unit)) return unit;
  return BUDGET_CYCLE_UNITS.includes(fallback) ? fallback : DEFAULT_BUDGET_CYCLE;
}

export function normalizeCustomDays(value, fallback = DEFAULT_CUSTOM_DAYS) {
  const days = Math.round(Number(value));
  if (!Number.isFinite(days)) return fallback;
  return Math.min(MAX_CUSTOM_DAYS, Math.max(MIN_CUSTOM_DAYS, days));
}

// 주기 단위 → 일수. 'custom'만 customDays를 쓴다.
export function cycleUnitDays(unit, customDays = DEFAULT_CUSTOM_DAYS) {
  const normalized = normalizeCycleUnit(unit);
  if (normalized === 'custom') return normalizeCustomDays(customDays);
  return FIXED_CYCLE_DAYS[normalized] || DEFAULT_CUSTOM_DAYS;
}

// 지금 적용 중인 주기의 일수. 월 모드는 달력 월이라 일수가 고정이 아니므로 0.
export function cycleDaysFor(budget = {}) {
  const cycle = normalizeBudgetCycle(budget.cycle);
  if (cycle === 'monthly') return 0;
  return cycleUnitDays(cycle, budget.customDays);
}

// 홈/리포트가 쓰는 보기 모드. 월 주기만 'month', 나머지는 전부 주기('cycle').
export function periodViewMode(budget = {}) {
  return normalizeBudgetCycle(budget.cycle) === 'monthly' ? 'month' : 'cycle';
}

// 보기 모드를 주기 값으로 되돌린다(홈 세그먼트 토글용).
export function cycleForViewMode(mode, budget = {}) {
  if (mode === 'month') return 'monthly';
  return normalizeCycleUnit(budget.cycleUnit, normalizeBudgetCycleUnitFrom(budget));
}

function normalizeBudgetCycleUnitFrom(budget) {
  const cycle = normalizeBudgetCycle(budget.cycle);
  return cycle === 'monthly' ? DEFAULT_BUDGET_CYCLE : cycle;
}

// 주기 단위 라벨: '2주' | '1주' | '10일'
export function cycleUnitLabel(unit, customDays = DEFAULT_CUSTOM_DAYS) {
  const normalized = normalizeCycleUnit(unit);
  if (normalized === 'biweekly') return '2주';
  if (normalized === 'weekly') return '1주';
  const days = normalizeCustomDays(customDays);
  if (days % 7 === 0) return `${days / 7}주`;
  return `${days}일`;
}

// 설정 라디오/요약행 라벨: '매월' | '2주마다' | ...
export function cycleOptionLabel(cycle, customDays = DEFAULT_CUSTOM_DAYS) {
  const normalized = normalizeBudgetCycle(cycle);
  if (normalized === 'monthly') return '매월';
  if (normalized === 'custom') return `직접 설정 · ${cycleUnitLabel('custom', customDays)}마다`;
  return `${cycleUnitLabel(normalized)}마다`;
}

// 화면 공용 기간 라벨: '이번 2주' | '이번 달'
export function periodLabelFor(budget = {}, mode = periodViewMode(budget)) {
  if (mode === 'month') return '이번 달';
  const unit = normalizeBudgetCycle(budget.cycle) === 'monthly'
    ? normalizeCycleUnit(budget.cycleUnit)
    : normalizeBudgetCycle(budget.cycle);
  return `이번 ${cycleUnitLabel(unit, budget.customDays)}`;
}

// 월 금액 → 주기 금액. 기준은 4주(28일)라 2주는 정확히 절반이다.
export function prorateMonthlyToCycle(monthlyAmount, cycleDays = DEFAULT_CUSTOM_DAYS) {
  const monthly = Number(monthlyAmount) || 0;
  const days = Math.max(1, Math.round(Number(cycleDays) || DEFAULT_CUSTOM_DAYS));
  return Math.round(monthly * days / CYCLE_PRORATION_BASE_DAYS);
}

// ---------- v1 → v2 마이그레이션 ----------
//
// v1에서 `amount`가 어느 기간의 금액이었는지는 그때의 `cycle`이 정했다:
//   'weekly'  → 1주 금액 (구 weeklyBudgetFor가 amount를 그대로 반환)
//   그 외     → 월 금액 (설정 히어로가 '이번 달 예산'으로 표시)
// v2에서 `amount`는 항상 '지금 주기 한 번'의 금액이다. 기준 기간이 달라지는
// 경우에만 안분한다 — 명시적으로 고른 주기(monthly/weekly)는 기준이 그대로라 손대지 않는다.
//
// | v1 cycle   | v1 amount 기준 | v2 cycle           | 안분        |
// |------------|----------------|--------------------|-------------|
// | 'monthly'  | 월             | monthly            | 없음        |
// | 'weekly'   | 1주            | weekly             | 없음        |
// | 'custom'   | 월             | custom(기본 14일)  | 월 → 주기   |
// | 없음       | 월             | biweekly(신규 기본)| 월 → 2주    |
//
// 순수 함수 — 저장은 호출부(data/repositories/settings.js)가 한 번만 수행한다.
export function migrateLegacyBudget(rawBudget = {}, options = {}) {
  const src = rawBudget && typeof rawBudget === 'object' ? rawBudget : {};
  if (Number(src.schemaVersion) >= BUDGET_SETTINGS_VERSION) return { changed: false };

  const legacyCycle = ['monthly', 'weekly', 'custom'].includes(String(src.cycle || '').toLowerCase())
    ? String(src.cycle).toLowerCase()
    : '';
  const nextCycle = legacyCycle || DEFAULT_BUDGET_CYCLE;
  const customDays = normalizeCustomDays(src.customDays);
  const amount = Math.max(0, Math.round(Number(src.amount) || 0));

  // 'weekly'는 v1에서도 1주 금액이었고 v2 주기도 1주라 기준이 같다.
  // 'monthly'는 양쪽 다 월이라 같다. 나머지만 월 → 주기로 안분한다.
  const basisChanged = nextCycle !== 'monthly' && nextCycle !== 'weekly';
  const nextAmount = basisChanged
    ? prorateMonthlyToCycle(amount, cycleUnitDays(nextCycle, customDays))
    : amount;

  return {
    changed: true,
    prorated: basisChanged && nextAmount !== amount,
    budget: {
      amount: nextAmount,
      cycle: nextCycle,
      cycleUnit: nextCycle === 'monthly' ? DEFAULT_BUDGET_CYCLE : nextCycle,
      customDays,
      rollover: String(src.rollover || '').toLowerCase(),
      schemaVersion: BUDGET_SETTINGS_VERSION,
    },
    // v1의 '직접 설정 시작일'은 v2에서 홈과 공유하는 주기 앵커로 옮긴다(기존 앵커가 없을 때만).
    biweeklyStartDate: String(options.biweeklyStartDate || '').trim() || String(src.customStartDate || '').trim(),
  };
}

// 설정 저장/렌더가 함께 쓰는 정규화된 기간 뷰.
export function resolveBudgetPeriod(budget = {}) {
  const cycle = normalizeBudgetCycle(budget.cycle);
  const unit = cycle === 'monthly' ? normalizeCycleUnit(budget.cycleUnit) : cycle;
  const customDays = normalizeCustomDays(budget.customDays);
  const mode = cycle === 'monthly' ? 'month' : 'cycle';
  return {
    cycle,
    cycleUnit: unit,
    customDays,
    mode,
    // 월 모드에서도 세그먼트/모달이 '이번 2주' 칩을 그려야 해서 단위 일수는 항상 준다.
    cycleDays: cycleUnitDays(unit, customDays),
    unitLabel: cycleUnitLabel(unit, customDays),
    periodLabel: mode === 'month' ? '이번 달' : `이번 ${cycleUnitLabel(unit, customDays)}`,
  };
}
