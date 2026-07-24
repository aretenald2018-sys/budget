import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMissionProgress, buildDefaultMissions } from '../domain/rewards/missions.js';

const now = new Date(2026, 6, 22, 12, 0); // 2026-07-22 수요일
const period = { start: '2026-07-20', end: '2026-07-26' };
const tx = (dateStr, amount, category, extra = {}) => ({
  type: 'card_payment',
  occurredAt: new Date(dateStr),
  amount,
  category,
  ...extra,
});

test('no_spend_days mission counts zero-spend days up to now', () => {
  const mission = { type: 'no_spend_days', params: { targetDays: 3 }, period };
  // 20일·21일 지출, 22일 무지출 → 경과 3일 중 무지출 1일
  const progress = buildMissionProgress(mission, [
    tx('2026-07-20T10:00', 5000, '카페'),
    tx('2026-07-21T10:00', 3000, '카페'),
  ], now);
  assert.equal(progress.currentText, '1/3');
  assert.equal(progress.pct, 33);
  assert.equal(progress.done, false);
});

test('category_cap mission tracks spend against the cap', () => {
  const mission = { type: 'category_cap', params: { categoryName: '카페비용', capAmount: 30000 }, period };
  const progress = buildMissionProgress(mission, [
    tx('2026-07-20T10:00', 15000, '카페비용'),
    tx('2026-07-21T10:00', 20000, '교통비용'), // 다른 카테고리 무시
  ], now);
  assert.equal(progress.pct, 50);
  assert.equal(progress.failed, false);
  const over = buildMissionProgress(mission, [tx('2026-07-20T10:00', 40000, '카페비용')], now);
  assert.equal(over.failed, true);
});

test('budget_pace mission compares spend to elapsed-days budget', () => {
  const mission = { type: 'budget_pace', params: { maxPct: 90, capAmount: 70000 }, period };
  // 경과 3일 → 페이스 예산 30,000원. 지출 15,000원 = 50% → 통과 중.
  const ok = buildMissionProgress(mission, [tx('2026-07-20T10:00', 15000, '카페')], now);
  assert.equal(ok.failed, false);
  const over = buildMissionProgress(mission, [tx('2026-07-20T10:00', 40000, '카페')], now);
  assert.equal(over.failed, true);
});

test('buildDefaultMissions seeds this-week missions scaled by difficulty', () => {
  const missions = buildDefaultMissions(now, { difficulty: 'high', weeklyBudget: 70000, topCategoryName: '카페비용' });
  assert.equal(missions.length, 3);
  assert.equal(missions[0].period.start, '2026-07-20');
  assert.equal(missions[0].period.end, '2026-07-26');
  assert.equal(missions[0].params.targetDays, 4);
  assert.equal(missions[1].params.categoryName, '카페비용');
  assert.equal(missions[2].params.capAmount, 70000);
});
