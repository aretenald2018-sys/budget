import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUDGET_CYCLES,
  BUDGET_RHYTHMS,
  VIEW_MODES,
  budgetRhythmHint,
  buildBudgetBreakdown,
  cycleAmountFromMonthly,
  cycleAmountLabel,
  isPeriodMode,
  monthlyFromCycleAmount,
  periodDaysForMode,
  periodDivisorForMode,
  periodLabelForCycle,
  periodLabelForMode,
  variableBudgetForPeriod,
  viewModeForCycle,
} from '../domain/budget/model.js';

// 예산 적용 주기와 홈/리포트 보기 모드를 잇는 유일한 지점.
// 예전에는 완전히 분리돼 있어 설정에서 '매월'을 골라도 홈은 계속 2주를 보여줬다.
test('예산 적용 주기가 홈 보기 모드를 결정한다', () => {
  assert.equal(viewModeForCycle('monthly'), 'month');
  assert.equal(viewModeForCycle('biweekly'), 'cycle');
  assert.equal(viewModeForCycle('weekly'), 'week');
  assert.equal(viewModeForCycle(undefined), 'cycle');
  assert.equal(periodLabelForCycle('monthly'), '이번 달');
  assert.equal(periodLabelForCycle('biweekly'), '이번 2주');
  assert.equal(periodLabelForCycle('weekly'), '이번 1주');
});

test('선택지는 매주·격주·매월 세 가지이고 각각 설명이 붙는다', () => {
  assert.deepEqual(BUDGET_CYCLES.map(c => c.value), ['weekly', 'biweekly', 'monthly']);
  assert.ok(BUDGET_CYCLES.every(c => c.label && c.hint));
});

// 보기 모드 하나가 기간 창의 길이와 분모를 모두 결정한다. 계산 함수들이 예산 주기를
// 따로 받지 않아도 되는 근거이므로, 이 표가 어긋나면 화면마다 다른 숫자가 나온다.
test('보기 모드가 기간 길이와 분모를 결정한다', () => {
  assert.deepEqual(VIEW_MODES, ['week', 'cycle', 'month']);
  assert.deepEqual(VIEW_MODES.map(periodDaysForMode), [7, 14, 0]);
  assert.deepEqual(VIEW_MODES.map(periodDivisorForMode), [4, 2, 1]);
  assert.deepEqual(VIEW_MODES.map(periodLabelForMode), ['이번 1주', '이번 2주', '이번 달']);
  assert.deepEqual(VIEW_MODES.map(isPeriodMode), [true, true, false]);
  // 모르는 값은 기존 동작(2주)으로 떨어져야 한다 — 월 분기로 새면 예산이 두 배가 된다.
  assert.equal(periodDaysForMode('nope'), 14);
  assert.equal(periodDivisorForMode(undefined), 2);
  assert.equal(isPeriodMode('nope'), false);
});

test('금액 단위는 주기별로 환산되고 라벨도 같이 바뀐다', () => {
  assert.equal(cycleAmountLabel('weekly'), '1주 변동비 예산');
  assert.equal(cycleAmountLabel('biweekly'), '2주 변동비 예산');
  assert.equal(cycleAmountLabel('monthly'), '월 변동비 예산');
  assert.equal(monthlyFromCycleAmount(250_000, 'weekly'), 1_000_000);
  assert.equal(monthlyFromCycleAmount(500_000, 'biweekly'), 1_000_000);
  assert.equal(monthlyFromCycleAmount(1_000_000, 'monthly'), 1_000_000);
  assert.equal(cycleAmountFromMonthly(1_000_000, 'weekly'), 250_000);
  assert.equal(cycleAmountFromMonthly(1_000_000, 'biweekly'), 500_000);
});

test('금액 단위 환산은 왕복해도 같은 월 예산으로 돌아온다', () => {
  for (const cycle of BUDGET_CYCLES.map(c => c.value)) {
    assert.equal(monthlyFromCycleAmount(cycleAmountFromMonthly(1_000_000, cycle), cycle), 1_000_000);
    // 4로 나누어떨어지지 않는 금액은 반올림 오차가 남지만 원 단위를 넘지 않아야 한다.
    const drift = Math.abs(monthlyFromCycleAmount(cycleAmountFromMonthly(999_999, cycle), cycle) - 999_999);
    assert.ok(drift <= 2, `${cycle} 왕복 오차 ${drift}원`);
  }
});

// 이번 변경의 핵심 가드: 설정 화면에 25만을 적으면 홈 히어로도 25만이라고 말해야 한다.
// 입력 환산(÷4)과 기간 안분(÷4)이 서로 다른 분모를 쓰면 두 화면이 갈라진다.
test('설정 화면 입력 금액과 홈 기간 예산이 같은 숫자를 말한다', () => {
  for (const [cycle, mode, typed] of [
    ['weekly', 'week', 250_000],
    ['biweekly', 'cycle', 500_000],
    ['monthly', 'month', 1_000_000],
  ]) {
    const stored = monthlyFromCycleAmount(typed, cycle);
    assert.equal(variableBudgetForPeriod({ explicitMonthly: stored, mode }), typed);
  }
});

test('계산 내역은 홈 히어로 산식과 같은 결과를 낸다', () => {
  const bd = buildBudgetBreakdown({
    cycle: 'biweekly',
    budget: 520000,
    provisions: 25000,
    adjustments: 0,
    spent: 384600,
    fixedMonthly: 889000,
  });
  // 예산 − 충당금 + 재배분 − 지출
  assert.equal(bd.amount, 520000 - 25000 + 0 - 384600);
  assert.equal(bd.period, '이번 2주');
  assert.deepEqual(bd.rows.map(r => r.key), ['budget', 'provisions', 'adjustments', 'spent']);
  assert.deepEqual(bd.rows.map(r => r.sign), ['', '−', '+', '−']);
  assert.ok(bd.rows.every(r => r.hint));
  assert.equal(bd.fixedMonthly, 889000);
});

test('재배분이 음수면 부호도 뒤집힌다', () => {
  const bd = buildBudgetBreakdown({ budget: 100000, adjustments: -20000, spent: 10000 });
  assert.equal(bd.rows.find(r => r.key === 'adjustments').sign, '−');
  assert.equal(bd.amount, 100000 - 0 + -20000 - 10000);
});

test('비용 성격 3종이 계산에 미치는 영향을 설명한다', () => {
  assert.deepEqual(BUDGET_RHYTHMS.map(r => r.value), ['fixed', 'spread', 'front_loaded']);
  assert.match(budgetRhythmHint('fixed'), /제외/);
  assert.match(budgetRhythmHint('spread'), /절반/);
  assert.match(budgetRhythmHint('front_loaded'), /전액/);
  assert.equal(budgetRhythmHint('nope'), '');
});

// 설정 화면에 적은 변동비 예산이 곧 '써도 되는 돈'의 출발점이어야 한다.
// 예전에는 카테고리 목표의 합이 몰래 예산 노릇을 해서, 총액을 적어도 홈 숫자가
// 꿈쩍하지 않았다(그 차액이 정체불명의 '미배정'으로 표시됐다).
test('변동비 예산을 정하면 그 금액이 기간 예산이 된다', () => {
  assert.equal(
    variableBudgetForPeriod({ explicitMonthly: 1_040_000, fallbackPeriodTotal: 999, mode: 'cycle' }),
    520_000,
  );
  assert.equal(
    variableBudgetForPeriod({ explicitMonthly: 1_040_000, fallbackPeriodTotal: 999, mode: 'month' }),
    1_040_000,
  );
});

test('변동비 예산을 비워두면 카테고리 상한의 기간 합을 쓴다', () => {
  assert.equal(variableBudgetForPeriod({ explicitMonthly: 0, fallbackPeriodTotal: 470_000, mode: 'cycle' }), 470_000);
  assert.equal(variableBudgetForPeriod({ fallbackPeriodTotal: 470_000, mode: 'month' }), 470_000);
  assert.equal(variableBudgetForPeriod(), 0);
});

test('음수·쓰레기 입력은 0으로 떨어진다', () => {
  assert.equal(variableBudgetForPeriod({ explicitMonthly: -50_000, fallbackPeriodTotal: -1 }), 0);
  assert.equal(variableBudgetForPeriod({ explicitMonthly: 'abc', fallbackPeriodTotal: '12000' }), 12_000);
});
