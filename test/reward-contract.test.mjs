import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRewardSavingsSummary } from '../domain/rewards/savings.js';
import { loadFixture } from './helpers/fixtures.mjs';

const contract = await loadFixture('reward-contract.json', import.meta.url);

// 적립 규칙: 지난달 일 평균보다 적게 쓴 날 → 목표 금액 × 하루 적립률을 정액 적립.
test('성공한 날에는 목표 금액 × 하루 적립률이 쌓인다', () => {
  const now = new Date(contract.now);
  const transactions = [];
  // 지난달 하루 10,000원씩 → 지난달 일 평균이 기준이 된다.
  for (let day = 1; day <= contract.historyDays; day += 1) {
    const occurredAt = new Date(now);
    occurredAt.setDate(now.getDate() - day);
    transactions.push({ type: 'card_payment', category: '생활', amount: contract.historyDailySpend, occurredAt });
  }
  transactions.push({ type: 'card_payment', category: '생활', amount: contract.todaySpend, occurredAt: now });

  const summary = buildRewardSavingsSummary({
    transactions,
    now,
    pointRates: contract.pointRates,
  });
  const buckets = Object.fromEntries(summary.pointBuckets.map(bucket => [bucket.key, bucket]));

  assert.ok(summary.dailyBaseline > 0, '지난달 기록이 있으면 기준이 잡힌다');
  assert.equal(summary.todaySuccess, true, '오늘 2,000원은 기준보다 적다');
  for (const [key, expected] of Object.entries(contract.expectedDailyPoints)) {
    assert.equal(buckets[key].dailyPoints, expected, `${key}.dailyPoints`);
    assert.equal(buckets[key].todayPoints, expected, `${key}.todayPoints`);
  }
  // 이번 달 적립 = 하루 적립 × 성공한 날 수
  assert.equal(
    buckets.winePurchase.earnedMonthPoints,
    buckets.winePurchase.dailyPoints * summary.successDays,
  );
  assert.equal(summary.monthPointCap, undefined);
  assert.equal(summary.dailyPointCap, undefined);
});

test('기준보다 많이 쓴 날은 적립되지 않는다', () => {
  const now = new Date(contract.now);
  const transactions = [];
  for (let day = 1; day <= contract.historyDays; day += 1) {
    const occurredAt = new Date(now);
    occurredAt.setDate(now.getDate() - day);
    transactions.push({ type: 'card_payment', category: '생활', amount: contract.historyDailySpend, occurredAt });
  }
  // 오늘 기준보다 훨씬 많이 썼다.
  transactions.push({ type: 'card_payment', category: '생활', amount: 500000, occurredAt: now });

  const summary = buildRewardSavingsSummary({ transactions, now, pointRates: contract.pointRates });
  const wine = summary.pointBuckets.find(bucket => bucket.key === 'winePurchase');
  assert.equal(summary.todaySuccess, false);
  assert.equal(wine.todayPoints, 0);
});

test('지난달 기록이 없으면 기준이 없어 적립도 없다', () => {
  const summary = buildRewardSavingsSummary({ now: new Date(contract.now), transactions: [] });
  assert.equal(summary.baselineReady, false);
  assert.equal(summary.todaySuccess, false);
  assert.equal(summary.successDays, 0);
  assert.equal(summary.pointBuckets.every(bucket => bucket.todayPoints === 0), true);
});

test('보너스 카드·무지출 미션 관련 필드는 되살아나지 않는다', () => {
  const summary = buildRewardSavingsSummary({ now: new Date(contract.now), transactions: [] });
  assert.equal(summary.dailyReward, undefined);
  assert.equal(summary.ruleBonusPoints, undefined);
  assert.equal(summary.pointBuckets[0].todayBonusPoints, undefined);
});
