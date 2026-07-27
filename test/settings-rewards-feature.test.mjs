import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_REWARD_SAVINGS_SETTINGS,
  formatRewardRatePct,
  normalizeRewardSettings,
  rewardPointItemFields,
  rewardOption,
} from '../features/settings/rewards/index.js';

test('settings reward feature preserves percent-style rate inputs', () => {
  // rate 는 하루 적립률(퍼센트 입력도 허용). 오늘 카드 설정은 제거됐다.
  const parsed = normalizeRewardSettings({
    allocationRate: 2,
    pointRates: { premiumIngredients: 3 },
  });

  assert.equal(parsed.allocationRate, 0.02);
  assert.equal(parsed.pointRates.winePurchase, 0.02);
  assert.equal(parsed.pointRates.premiumIngredients, 0.03);
  assert.equal(parsed.dailyReward, undefined);
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
