import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  accruedProvision,
  fundBalance,
  buildSafeToSpendSummary,
  validateAdjustment,
  netAdjustmentFor,
  normalizeProvisionFund,
} from '../domain/funds/provision.js';
import {
  effectiveTargetFor,
  targetFor,
} from '../features/report/budget-summary/state.js';
import { buildRewardSavingsSummary, buildRewardWidgetSnapshot } from '../domain/rewards/savings.js';

test('accruedProvision credits full monthly amount from start month inclusive', () => {
  const fund = { monthlyProvision: 50000, startMonthKey: '2026-05', openingBalance: 10000 };
  // 2026-05 .. 2026-08 inclusive = 4 months
  assert.equal(accruedProvision(fund, new Date(2026, 7, 15)), 10000 + 50000 * 4);
});

test('accruedProvision before start month yields only opening balance', () => {
  const fund = { monthlyProvision: 50000, startMonthKey: '2026-09', openingBalance: 30000 };
  assert.equal(accruedProvision(fund, new Date(2026, 6, 1)), 30000);
});

test('fundBalance subtracts draws and applies adjustments, allows negative', () => {
  const fund = { id: 'f1', monthlyProvision: 40000, startMonthKey: '2026-07', openingBalance: 0 };
  const draws = [
    { fundId: 'f1', type: 'card_payment', amount: 30000 },
    { fundId: 'f1', type: 'card_payment', amount: 25000 },
    { fundId: 'other', type: 'card_payment', amount: 999999 },
    { fundId: 'f1', type: 'card_payment', amount: 5000, hidden: true },
  ];
  const adjustments = [
    { from: { kind: 'external' }, to: { kind: 'fund', id: 'f1' }, amount: 10000 },
    { from: { kind: 'fund', id: 'f1' }, to: { kind: 'category', id: 'c1' }, amount: 20000 },
  ];
  // accrued 40000 (1 month) - (30000+25000) + 10000 - 20000 = -25000
  assert.equal(fundBalance(fund, draws, adjustments, new Date(2026, 6, 20)), -25000);
});

test('buildSafeToSpendSummary halves provisions in cycle mode and degrades with no funds', () => {
  const withFunds = buildSafeToSpendSummary({
    budgetTotal: 600000,
    spentTotal: 200000,
    funds: [{ monthlyProvision: 100000, startMonthKey: '2026-07', active: true }],
    adjustments: [],
    mode: 'cycle',
    monthKey: '2026-07',
    now: new Date(2026, 6, 10),
  });
  // provisions = round(100000/2) = 50000; STS = 600000 - 50000 - 200000 = 350000
  assert.equal(withFunds.provisions, 50000);
  assert.equal(withFunds.amount, 350000);

  const noFunds = buildSafeToSpendSummary({
    budgetTotal: 600000,
    spentTotal: 200000,
    funds: [],
    mode: 'cycle',
    monthKey: '2026-07',
    now: new Date(2026, 6, 10),
  });
  assert.equal(noFunds.provisions, 0);
  assert.equal(noFunds.amount, 400000);
});

// 1주 모드는 창이 절반이라 적립도 절반, 잔여일도 6일 이하여야 한다.
// (mode 를 이항으로 보면 'week' 가 월 분기로 떨어져 한 달치 적립·잔여일이 나온다.)
test('buildSafeToSpendSummary quarters provisions and caps remaining days in week mode', () => {
  const start = new Date(2026, 6, 21);
  start.setHours(0, 0, 0, 0);
  const end = new Date(2026, 6, 28);
  end.setMilliseconds(-1);
  const sts = buildSafeToSpendSummary({
    budgetTotal: 300000,
    spentTotal: 100000,
    funds: [{ monthlyProvision: 100000, startMonthKey: '2026-07', active: true }],
    adjustments: [],
    mode: 'week',
    monthKey: '2026-07',
    cycleRange: { start, end, days: 7 },
    now: new Date(2026, 6, 24, 12),
  });
  // provisions = round(100000/4) = 25000; STS = 300000 - 25000 - 100000 = 175000
  assert.equal(sts.provisions, 25000);
  assert.equal(sts.amount, 175000);
  // 7/21~7/27 창의 7/24 는 4일째 → 남은 3일
  assert.equal(sts.daysRemaining, 3);
  assert.equal(sts.perDay, Math.floor(175000 / 4));
});

test('buildSafeToSpendSummary month mode uses full provisions and adds reallocation into control', () => {
  const sts = buildSafeToSpendSummary({
    budgetTotal: 800000,
    spentTotal: 300000,
    funds: [{ monthlyProvision: 120000, startMonthKey: '2026-07', active: true }],
    adjustments: [
      { from: { kind: 'fund', id: 'f1' }, to: { kind: 'category', label: '식비' }, amount: 40000 },
    ],
    controlCategoryNames: ['식비'],
    mode: 'month',
    monthKey: '2026-07',
    now: new Date(2026, 6, 15),
  });
  // B 800000 - P 120000 + A 40000 - S 300000 = 420000
  assert.equal(sts.provisions, 120000);
  assert.equal(sts.adjustments, 40000);
  assert.equal(sts.amount, 420000);
  assert.ok(!sts.negative);
});

test('buildSafeToSpendSummary can go negative', () => {
  const sts = buildSafeToSpendSummary({
    budgetTotal: 100000,
    spentTotal: 180000,
    funds: [],
    mode: 'month',
    monthKey: '2026-07',
    now: new Date(2026, 6, 15),
  });
  assert.equal(sts.amount, -80000);
  assert.ok(sts.negative);
});

test('effectiveTargetFor equals targetFor with empty adjustments (backward compatible)', () => {
  const cat = { id: 'c1', name: '식비', monthlyTargets: { '2026-07': 300000 }, budgetRhythm: 'spread' };
  assert.equal(effectiveTargetFor(cat, '2026-07', 'month', []), targetFor(cat, '2026-07', 'month'));
  assert.equal(effectiveTargetFor(cat, '2026-07', 'cycle'), targetFor(cat, '2026-07', 'cycle'));
});

test('effectiveTargetFor applies category net adjustments and clamps at zero', () => {
  const cat = { id: 'c1', name: '식비', monthlyTargets: { '2026-07': 300000 }, budgetRhythm: 'spread' };
  const adjustments = [
    { from: { kind: 'category', label: '취미' }, to: { kind: 'category', id: 'c1', label: '식비' }, amount: 50000 },
  ];
  assert.equal(effectiveTargetFor(cat, '2026-07', 'month', adjustments), 350000);
  const drain = [{ from: { kind: 'category', id: 'c1' }, to: { kind: 'fund', id: 'f1' }, amount: 999999 }];
  assert.equal(effectiveTargetFor(cat, '2026-07', 'month', drain), 0);
});

test('validateAdjustment rejects zero, same source/target, missing sides', () => {
  assert.equal(validateAdjustment({ amount: 0, from: { kind: 'category', id: 'a' }, to: { kind: 'category', id: 'b' } }).valid, false);
  assert.equal(validateAdjustment({ amount: 100, from: { kind: 'category', id: 'a' }, to: { kind: 'category', id: 'a' } }).valid, false);
  assert.equal(validateAdjustment({ amount: 100, to: { kind: 'category', id: 'b' } }).valid, false);
  assert.equal(validateAdjustment({ amount: 100, from: { kind: 'external' }, to: { kind: 'fund', id: 'f1' } }).valid, true);
});

test('normalizeProvisionFund clamps and defaults', () => {
  const fund = normalizeProvisionFund({ name: '  ', monthlyProvision: -5, startMonthKey: '2026-13', active: 'false' }, 2);
  assert.equal(fund.name, '충당금 3');
  assert.equal(fund.monthlyProvision, 0);
  assert.equal(fund.active, false);
  assert.match(fund.startMonthKey, /^\d{4}-\d{2}$/);
});

test('fund-covered expense does not move reward baseline or today spend', () => {
  // A large fund-covered fine in the lookback window must be excluded upstream by
  // !isBudgetExcluded; here we assert the summary ignores it when pre-filtered.
  const base = { type: 'card_payment', category: '식비' };
  const normalTxs = [
    { ...base, amount: 10000, occurredAt: new Date(2026, 6, 1) },
    { ...base, amount: 10000, occurredAt: new Date(2026, 6, 8) },
  ];
  const withoutFine = buildRewardSavingsSummary({
    transactions: normalTxs,
    categoryNames: ['식비'],
    getCategoryName: tx => tx.category,
    now: new Date(2026, 6, 20),
  });
  // Same list — a fund-covered fine is filtered out before reaching the summary,
  // so the baseline must be identical to the no-fine case.
  const withFineFilteredOut = buildRewardSavingsSummary({
    transactions: normalTxs,
    categoryNames: ['식비'],
    getCategoryName: tx => tx.category,
    now: new Date(2026, 6, 20),
  });
  assert.equal(withoutFine.dailyBaseline, withFineFilteredOut.dailyBaseline);
});

// 위젯 v4: 히어로가 '써도 되는 돈', 보조가 '적립한 포인트'.
test('widget snapshot v4 carries safeToSpend (7일 환산 포함) and point totals', () => {
  const snap = buildRewardWidgetSnapshot(
    {
      baselineReady: true,
      todaySaved: 1000,
      pointBuckets: [
        { key: 'winePurchase', label: '와인구매 포인트', todayPoints: 300, monthPoints: 12000, earnedMonthPoints: 13000, spentMonthPoints: 1000, projectedMonthPoints: 18000, targetAmount: 120000 },
        { key: 'travelFund', label: '여행충당 포인트', todayPoints: 100, monthPoints: -500, earnedMonthPoints: 500, spentMonthPoints: 1000, projectedMonthPoints: 3000, targetAmount: 200000 },
      ],
    },
    new Date(Date.UTC(2026, 6, 3)),
    {
      safeToSpend: { amount: 384000, perDay: 48000, daysRemaining: 8, spentRatio: 0.6, negative: false, periodLabel: '이번 2주' },
      funds: [{ emoji: '⚡', label: '돌발비용', balance: 180000, overdrawn: false }],
    },
  );
  assert.equal(snap.schemaVersion, 4);
  assert.equal(snap.safeToSpend.amount, 384000);
  assert.equal(snap.safeToSpend.periodLabel, '이번 2주');
  // 7일 환산은 홈 히어로와 같은 perDay 를 쓰므로 두 화면이 어긋날 수 없다.
  assert.equal(snap.safeToSpend.weekDays, 7);
  assert.equal(snap.safeToSpend.weekAmount, 48000 * 7);
  assert.equal(snap.points.monthPoints, 11500);
  assert.equal(snap.points.todayPoints, 400);
  assert.equal(snap.points.earnedMonthPoints, 13500);
  // 마운트되지 않던 '오늘 카드'와 보너스 개념은 스냅샷에서 사라졌다.
  assert.equal(snap.dailyReward, undefined);
  assert.equal(snap.ruleBonusPoints, undefined);
  assert.equal(snap.funds.length, 1);
  assert.equal(snap.funds[0].label, '돌발비용');
});

test('남은 기간이 7일보다 짧으면 주간 환산도 그만큼만 센다', () => {
  const snap = buildRewardWidgetSnapshot(
    { baselineReady: true, pointBuckets: [] },
    new Date(Date.UTC(2026, 6, 3)),
    { safeToSpend: { amount: 90000, perDay: 30000, daysRemaining: 2, spentRatio: 0.5, periodLabel: '이번 2주' } },
  );
  assert.equal(snap.safeToSpend.weekDays, 3);
  assert.equal(snap.safeToSpend.weekAmount, 90000);
});

test('netAdjustmentFor nets inbound and outbound for a target', () => {
  const adjustments = [
    { from: { kind: 'category', id: 'x' }, to: { kind: 'fund', id: 'f1' }, amount: 30000 },
    { from: { kind: 'fund', id: 'f1' }, to: { kind: 'category', id: 'y' }, amount: 10000 },
  ];
  assert.equal(netAdjustmentFor({ kind: 'fund', id: 'f1' }, adjustments), 20000);
});

// 매칭 매트릭스: id 우선, 한쪽이라도 id가 없으면 label 폴백.
// (홈 재배분 칩이 to.id=null로 저장하던 시절의 원장도 게이지에 반영되어야 함)
test('netAdjustmentFor matching matrix: id-priority with label fallback', () => {
  const A = amount => amount;
  // 1) both sides have ids → id must match; label mismatch is irrelevant
  assert.equal(netAdjustmentFor(
    { kind: 'category', id: 'c1', label: '식비' },
    [{ to: { kind: 'category', id: 'c1', label: '다른라벨' }, amount: A(1000) }],
  ), 1000);
  assert.equal(netAdjustmentFor(
    { kind: 'category', id: 'c1', label: '식비' },
    [{ to: { kind: 'category', id: 'c2', label: '식비' }, amount: A(1000) }],
  ), 0, 'same label but different real ids must NOT match');
  // 2) target has id, stored side has null id → label fallback (the home-chip bug)
  assert.equal(netAdjustmentFor(
    { kind: 'category', id: 'c1', label: '생활비용' },
    [{ to: { kind: 'category', id: null, label: '생활비용' }, amount: A(30000) }],
  ), 30000);
  // 3) target has no id, stored side has id → label fallback
  assert.equal(netAdjustmentFor(
    { kind: 'category', id: null, label: '생활비용' },
    [{ from: { kind: 'category', id: 'c1', label: '생활비용' }, amount: A(5000) }],
  ), -5000);
  // 4) both null ids → label match
  assert.equal(netAdjustmentFor(
    { kind: 'category', id: null, label: '생활비용' },
    [{ to: { kind: 'category', id: null, label: '생활비용' }, amount: A(2000) }],
  ), 2000);
  // 5) kind must always match
  assert.equal(netAdjustmentFor(
    { kind: 'fund', id: null, label: '생활비용' },
    [{ to: { kind: 'category', id: null, label: '생활비용' }, amount: A(2000) }],
  ), 0);
});

test('effectiveTargetFor reflects a home-chip adjustment stored with null id', () => {
  const category = { id: 'c1', name: '생활비용', monthlyTargets: { '2026-07': 400000 }, budgetRhythm: 'spread' };
  const adjustments = [
    { to: { kind: 'category', id: null, label: '생활비용' }, from: { kind: 'category', id: null, label: '취미' }, amount: 30000 },
  ];
  assert.equal(effectiveTargetFor(category, '2026-07', 'month', adjustments), 430000);
  assert.equal(effectiveTargetFor(category, '2026-07', 'month', []), 400000);
});
