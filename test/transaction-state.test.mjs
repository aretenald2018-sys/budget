import test from 'node:test';
import assert from 'node:assert/strict';

import { transactionState, resetTransactionViewState } from '../features/transactions/state.js';

test('transaction state reset preserves one scroll binding and clears filters', () => {
  Object.assign(transactionState, {
    type: 'transfer',
    category: '생활비용',
    day: 12,
    items: [{ id: 'tx-1' }],
    scrollBound: true,
  });

  resetTransactionViewState();

  assert.equal(transactionState.type, 'all');
  assert.equal(transactionState.category, 'all');
  assert.equal(transactionState.day, null);
  assert.deepEqual(transactionState.items, []);
  assert.equal(transactionState.scrollBound, true);
});
