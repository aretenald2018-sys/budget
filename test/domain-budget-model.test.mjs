import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUDGET_CYCLES,
  BUDGET_RHYTHMS,
  budgetRhythmHint,
  buildBudgetBreakdown,
  periodLabelForCycle,
  variableBudgetForPeriod,
  viewModeForCycle,
} from '../domain/budget/model.js';

// 예산 적용 주기와 홈/리포트 보기 모드를 잇는 유일한 지점.
// 예전에는 완전히 분리돼 있어 설정에서 '매월'을 골라도 홈은 계속 2주를 보여줬다.
test('예산 적용 주기가 홈 보기 모드를 결정한다', () => {
  assert.equal(viewModeForCycle('monthly'), 'month');
  assert.equal(viewModeForCycle('biweekly'), 'cycle');
  assert.equal(viewModeForCycle(undefined), 'cycle');
  assert.equal(periodLabelForCycle('monthly'), '이번 달');
  assert.equal(periodLabelForCycle('biweekly'), '이번 2주');
});

test('선택지는 격주와 매월 두 가지이고 각각 설명이 붙는다', () => {
  assert.deepEqual(BUDGET_CYCLES.map(c => c.value), ['biweekly', 'monthly']);
  assert.ok(BUDGET_CYCLES.every(c => c.label && c.hint));
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
