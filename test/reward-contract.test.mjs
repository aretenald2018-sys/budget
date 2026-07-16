import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRewardSavingsSummary } from '../domain/rewards/savings.js';
import { loadFixture } from './helpers/fixtures.mjs';

const contract = await loadFixture('reward-contract.json', import.meta.url);

test('reward point buckets preserve the current baseline and projection contract', () => {
  const now = new Date(contract.now);
  const transactions = [];
  for (let day = 1; day <= contract.historyDays; day += 1) {
    const occurredAt = new Date(now);
    occurredAt.setDate(now.getDate() - day);
    transactions.push({
      type: 'card_payment',
      category: '생활',
      amount: contract.historyDailySpend,
      occurredAt,
    });
  }
  transactions.push({
    type: 'card_payment',
    category: '생활',
    amount: contract.todaySpend,
    occurredAt: now,
  });

  const summary = buildRewardSavingsSummary({
    transactions,
    now,
    lookbackDays: contract.historyDays,
    baselineMethod: 'simple_daily',
    pointRates: contract.pointRates,
  });
  const buckets = Object.fromEntries(summary.pointBuckets.map(bucket => [bucket.key, bucket]));
  for (const [key, expected] of Object.entries(contract.expectedTodayPoints)) {
    assert.equal(buckets[key].todayPoints, expected, `${key}.todayPoints`);
  }
  for (const [key, expected] of Object.entries(contract.expectedProjectedMonthPoints)) {
    assert.equal(buckets[key].projectedMonthPoints, expected, `${key}.projectedMonthPoints`);
  }
  assert.equal(summary.monthPointCap, undefined);
  assert.equal(summary.dailyPointCap, undefined);
});

test('daily reward focus can be selected before baseline history is ready', () => {
  const summary = buildRewardSavingsSummary({
    now: new Date(contract.now),
    transactions: [],
    dailyReward: {
      selectedDateKey: '2026-07-03',
      selectedRuleId: 'focusPoint',
      focusBucketKey: 'winePurchase',
    },
  });

  assert.equal(summary.baselineReady, false);
  assert.equal(summary.dailyReward.status, 'selected');
  assert.equal(summary.dailyReward.focusBucketKey, 'winePurchase');
});

test('daily reward focus adds the capped bonus to its selected point bucket', () => {
  const now = new Date('2026-07-16T12:00:00');
  const transactions = Array.from({ length: 30 }, (_, index) => {
    const occurredAt = new Date(now);
    occurredAt.setDate(now.getDate() - index - 1);
    return { type: 'card_payment', category: '생활', amount: 100000, occurredAt };
  });
  const summary = buildRewardSavingsSummary({
    now,
    transactions,
    categoryNames: ['생활'],
    pointItems: [{ id: 'winePurchase', label: '와인구매 포인트', rate: 0.05, targetAmount: 120000, enabled: true }],
    dailyReward: {
      selectedDateKey: '2026-07-16',
      selectedRuleId: 'focusPoint',
      focusBucketKey: 'winePurchase',
      bonusRate: 0.1,
      bonusCap: 5000,
    },
  });

  const winePurchase = summary.pointBuckets.find(bucket => bucket.key === 'winePurchase');
  assert.equal(summary.dailyReward.status, 'selected');
  assert.equal(summary.ruleBonusPoints, 5000);
  assert.equal(winePurchase.todayBonusPoints, 5000);
  assert.equal(winePurchase.todayPoints, winePurchase.todayBasePoints + 5000);
});
