import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRewardSavingsSummary } from '../utils/reward-savings.js';
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
