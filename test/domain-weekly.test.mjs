import test from 'node:test';
import assert from 'node:assert/strict';

import { weekRange, buildWeeklyReport, weeklyBudgetFor } from '../domain/transactions/weekly.js';

const tx = (dateStr, amount, category, extra = {}) => ({
  type: 'card_payment',
  occurredAt: new Date(dateStr),
  amount,
  category,
  ...extra,
});

test('weekRange returns Monday-start week and supports offsets', () => {
  const range = weekRange(new Date(2026, 6, 22)); // 2026-07-22 수요일
  assert.equal(range.start.getDate(), 20);
  assert.equal(range.end.getDate(), 26);
  assert.equal(range.label, '7월 20일 – 7월 26일');
  const prev = weekRange(new Date(2026, 6, 22), { offsetWeeks: -1 });
  assert.equal(prev.start.getDate(), 13);
});

test('buildWeeklyReport aggregates totals, delta, no-spend days and highlights', () => {
  const range = weekRange(new Date(2026, 6, 22));
  const txs = [
    tx('2026-07-20T10:00', 10000, '카페'),
    tx('2026-07-20T12:00', 5000, '카페', { merchant: '스타벅스' }),
    tx('2026-07-21T09:00', 20000, '교통', { merchant: '스타벅스' }),
    tx('2026-07-21T10:00', 3000, '카페', { excludedFromBudget: true }), // 예산 제외 → 무시
  ];
  const prevTxs = [
    tx('2026-07-14T10:00', 30000, '교통'),
    tx('2026-07-15T10:00', 5000, '쇼핑'),
  ];
  const report = buildWeeklyReport({
    txs,
    prevTxs,
    weeklyBudget: 100000,
    range,
  });
  assert.equal(report.total, 35000);
  assert.equal(report.prevTotal, 35000);
  assert.equal(report.delta, 0);
  assert.equal(report.budgetProgress, 35);
  assert.equal(report.byCategory[0].name, '교통');
  assert.equal(report.byCategory[0].pct, 57);
  // 증가: 카페 +15000, 감소: 교통 -10000, 쇼핑 -5000
  assert.equal(report.highlights.topIncrease.name, '카페');
  assert.equal(report.highlights.topIncrease.delta, 15000);
  assert.equal(report.highlights.topDecrease.name, '교통');
  assert.equal(report.highlights.recurringCount, 1); // 스타벅스 2회
});

test('weeklyBudgetFor prorates monthly budget and passes weekly through', () => {
  const range = weekRange(new Date(2026, 6, 22)); // 7월 = 31일
  assert.equal(weeklyBudgetFor({ budgetAmount: 310000, cycle: 'monthly', range }), 70000);
  assert.equal(weeklyBudgetFor({ budgetAmount: 200000, cycle: 'weekly', range }), 200000);
  assert.equal(weeklyBudgetFor({ budgetAmount: 0, cycle: 'monthly', range }), 0);
});
