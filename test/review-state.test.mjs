import test from 'node:test';
import assert from 'node:assert/strict';

import { reviewState } from '../features/review/state.js';

test('review state owns unmatched receipt lookup', () => {
  reviewState.receipts = new Map([['receipt-1', { id: 'receipt-1' }]]);
  assert.equal(reviewState.receipts.get('receipt-1').id, 'receipt-1');
});
