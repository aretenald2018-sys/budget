import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_REWARD_SAVINGS_SETTINGS,
  formatRewardRatePct,
  normalizeRewardSettings,
  rewardPointItemFields,
  rewardOption,
} from '../features/settings/rewards/index.js';

test('settings reward feature preserves legacy allocation and point-rate inputs', () => {
  const legacy = normalizeRewardSettings({
    allocationRate: 25,
    pointRates: { premiumIngredients: 15 },
    dailyReward: { bonusRate: 20, freezeCount: 99 },
  });

  assert.equal(legacy.allocationRate, 0.25);
  assert.equal(legacy.pointRates.winePurchase, 0.25);
  assert.equal(legacy.pointRates.premiumIngredients, 0.15);
  assert.equal(legacy.dailyReward.bonusRate, 0.2);
  assert.equal(legacy.dailyReward.freezeCount, 12);
  assert.equal(formatRewardRatePct(0.125), '12.5');
});

test('settings reward feature normalizes duplicate IDs and renders safe controls', () => {
  const settings = normalizeRewardSettings({
    pointItems: [
      { id: 'wine<script>', label: '<와인>', rate: 0.3, targetAmount: 120000 },
      { id: 'wine<script>', label: '두 번째', rate: 0.1, targetAmount: 30000 },
    ],
  });

  assert.deepEqual(settings.pointItems.map(item => item.id), ['winescript', 'winescript2']);
  const html = rewardPointItemFields(settings.pointItems);
  assert.match(html, /data-reward-point-id="winescript"/);
  assert.match(html, /&lt;와인&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(rewardOption(180, '최근 6개월', 180), /selected/);
  assert.equal(DEFAULT_REWARD_SAVINGS_SETTINGS.pointItems.length, 3);
});
