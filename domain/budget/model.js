// ================================================================
// domain/budget/model.js — 예산 모델의 단일 설명 출처 (순수 함수)
//
// 이 앱의 돈은 네 층으로 나뉘는데 지금까지 어디에도 설명이 없었다.
//
//   전체 예산 (카테고리 목표의 합)
//     ├─ 고정비   월세·통신비처럼 매달 같은 금액. 이미 나갈 게 정해져 있어
//     │           '써도 되는 돈' 계산에서 아예 빠진다.
//     └─ 변동비   내가 조절할 수 있는 돈. 여기가 '써도 되는 돈'의 출발점.
//          − 충당금  비정기 지출(과태료·의류·경조사)에 대비해 매달 미리 떼어둠
//          ± 재배분  카테고리끼리, 또는 충당금에서 가져오거나 보낸 금액
//          − 쓴 돈
//          = 지금 써도 되는 돈
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
        hint: '카테고리 목표 중 고정비를 뺀 금액. 2주 기간이면 월 목표의 절반으로 잡아요.',
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
