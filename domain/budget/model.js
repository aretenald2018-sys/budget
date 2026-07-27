// ================================================================
// domain/budget/model.js — 예산 모델의 단일 설명 출처 (순수 함수)
//
// 예산은 '변동비에만' 걸린다. 이 한 문장이 모델의 전부다.
//
//   고정비   월세·보험·통신처럼 매달 나갈 게 정해진 돈. 예산 밖이다.
//            금액은 기록하되 '써도 되는 돈' 계산에 들어가지 않는다.
//
//   변동비 예산   내가 한 달(또는 2주)에 쓰기로 정한 금액. 예산은 이것 하나다.
//     − 충당금   비정기 지출(과태료·의류·경조사)에 대비해 미리 떼어둠
//     ± 재배분   카테고리끼리, 또는 충당금에서 가져오거나 보낸 금액
//     − 쓴 돈
//     = 지금 써도 되는 돈
//
//   카테고리 상한   변동비 예산 '안에서' 항목별로 더 좁게 거는 선택적 한도.
//                   합이 예산과 같을 필요는 없다. 넘으면 알려주기만 한다.
//
// 이 파일은 그 관계를 문장/행 데이터로 만들어 설정 화면과 홈 히어로 설명이
// 같은 정의를 쓰게 한다(둘이 따로 놀면서 서로 다른 설명을 하던 문제).
// ================================================================

export const BUDGET_CYCLES = Object.freeze([
  { value: 'biweekly', label: '격주(2주)', hint: '내가 정한 날부터 14일씩 반복' },
  { value: 'monthly', label: '매월', hint: '달력 기준 1일~말일' },
]);

export function budgetCycleLabel(cycle) {
  return BUDGET_CYCLES.find(item => item.value === cycle)?.label || '격주(2주)';
}

// 예산 기간 설정 → 홈/리포트의 보기 모드. 두 개념을 하나로 묶는 유일한 지점.
export function viewModeForCycle(cycle) {
  return cycle === 'monthly' ? 'month' : 'cycle';
}

export function periodLabelForCycle(cycle) {
  return cycle === 'monthly' ? '이번 달' : '이번 2주';
}

// 예산 금액은 저장은 언제나 '월' 기준(budget.amount)이지만, 입력은 사용자가 고른
// 주기 단위로 받는다. 격주로 예산을 세는 사람에게 월 금액을 계산해서 넣으라고
// 요구하지 않기 위한 변환.
export function monthlyFromCycleAmount(amount, cycle) {
  const value = Math.max(0, Math.round(Number(amount) || 0));
  return cycle === 'monthly' ? value : value * 2;
}

export function cycleAmountFromMonthly(monthly, cycle) {
  const value = Math.max(0, Math.round(Number(monthly) || 0));
  return cycle === 'monthly' ? value : Math.round(value / 2);
}

export function cycleAmountLabel(cycle) {
  return cycle === 'monthly' ? '월 변동비 예산' : '2주 변동비 예산';
}

// '써도 되는 돈'의 출발점이 되는 기간 예산. 홈·설정·리포트가 모두 이걸 쓴다.
//
// 사용자가 변동비 예산을 직접 정했으면 그 금액이 예산이다 — 카테고리 상한을
// 얼마나 걸었든 상관없다(예전에는 카테고리 목표의 합이 몰래 예산 노릇을 해서,
// 설정 화면에 적은 총액과 홈에 뜨는 숫자가 서로 달랐다).
// 아직 정하지 않았다면 기존처럼 카테고리 상한의 기간 합을 예산으로 본다.
export function variableBudgetForPeriod({
  explicitMonthly = 0,
  fallbackPeriodTotal = 0,
  mode = 'cycle',
} = {}) {
  const explicit = Math.max(0, Math.round(Number(explicitMonthly) || 0));
  if (!explicit) return Math.max(0, Math.round(Number(fallbackPeriodTotal) || 0));
  return mode === 'cycle' ? Math.round(explicit / 2) : explicit;
}

// 실제 숫자를 넣어 만드는 계산 내역. 값이 없으면 설명만 나오는 뼈대로 쓴다.
export function buildBudgetBreakdown({
  cycle = 'biweekly',
  budget = 0,
  provisions = 0,
  adjustments = 0,
  spent = 0,
  fixedMonthly = 0,
} = {}) {
  const period = periodLabelForCycle(cycle);
  const amount = budget - provisions + adjustments - spent;
  return {
    period,
    amount,
    rows: [
      {
        key: 'budget',
        label: `${period} 변동비 예산`,
        value: budget,
        sign: '',
        hint: '설정에서 정한 변동비 예산. 고정비는 여기 들어가지 않아요.',
      },
      {
        key: 'provisions',
        label: '충당금 적립',
        value: provisions,
        sign: '−',
        hint: '비정기 지출에 대비해 미리 떼어두는 돈. 사라지는 게 아니라 주머니로 옮겨둡니다.',
      },
      {
        key: 'adjustments',
        label: '재배분',
        value: adjustments,
        sign: adjustments < 0 ? '−' : '+',
        hint: '다른 카테고리나 충당금에서 가져오거나 보낸 금액.',
      },
      {
        key: 'spent',
        label: `${period} 쓴 돈`,
        value: spent,
        sign: '−',
        hint: '이 기간에 변동비 카테고리에서 실제로 나간 금액.',
      },
    ],
    fixedMonthly,
    fixedHint: fixedMonthly > 0
      ? '고정비는 이미 나갈 게 정해진 돈이라 이 계산에 들어가지 않아요. 월 단위로 따로 봅니다.'
      : '고정비로 지정한 카테고리는 이 계산에서 빠지고 월 단위로 따로 봅니다.',
  };
}

// 카테고리의 budgetRhythm 이 실제로 무엇을 바꾸는지 — 설정 화면에서 그대로 노출한다.
export const BUDGET_RHYTHMS = Object.freeze([
  {
    value: 'fixed',
    label: '고정비',
    hint: "매달 같은 금액이 나가는 항목(월세·보험·통신). '써도 되는 돈'에서 제외하고 월 단위로만 봅니다.",
  },
  {
    value: 'spread',
    label: '변동비',
    hint: "기간에 걸쳐 고르게 쓰는 항목. 2주 기간이면 월 목표의 절반을 이 기간 예산으로 잡습니다.",
  },
  {
    value: 'front_loaded',
    label: '월초 집중',
    hint: '월초에 몰아서 쓰는 항목. 2주 기간에도 월 목표 전액을 예산으로 잡습니다.',
  },
]);

export function budgetRhythmHint(value) {
  return BUDGET_RHYTHMS.find(item => item.value === value)?.hint || '';
}
