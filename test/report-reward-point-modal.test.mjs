import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRewardPointModalModel,
  focusRewardLabel,
  formatPointBalance,
  rewardPointDateInput,
} from '../features/report/reward-point-modal/state.js';

test('reward point modal state keeps selection, history-only items, and balances stable', () => {
  const snapshot = {
    rewardPointItems: [
      { id: 'winePurchase', label: '와인구매 포인트', order: 10 },
      { id: 'travelFund', label: '여행충당 포인트', order: 30 },
    ],
    rewardSummary: {
      pointBuckets: [
        { key: 'winePurchase', label: '와인구매 포인트', monthPoints: -2500 },
      ],
    },
    rewardPointEntries: [
      { id: 'entry-1', pointItemId: 'retiredPoint', pointItemLabel: '과거 포인트', amount: 1000 },
    ],
  };

  const model = buildRewardPointModalModel(snapshot, 'winePurchase');
  assert.equal(model.selectedId, 'winePurchase');
  assert.equal(model.selectedBucket.monthPoints, -2500);
  assert.deepEqual(model.pointItems.map(item => item.id), ['winePurchase', 'entry-1', 'travelFund']);
  assert.equal(formatPointBalance(model.selectedBucket.monthPoints), '-2,500P');
  assert.equal(focusRewardLabel(model.selectedItem.label), '와인구매');
});

test('reward point modal date input accepts Firestore-style dates', () => {
  assert.equal(rewardPointDateInput({ toDate: () => new Date(2026, 6, 12) }), '2026-07-12');
});
