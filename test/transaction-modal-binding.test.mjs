import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseTransactionAmount,
  replaceAbortableBinding,
} from '../features/transactions/editor/binding-state.js';

test('transaction modal amount parser keeps the existing positive won contract', () => {
  assert.equal(parseTransactionAmount('12,345원'), 12345);
  assert.equal(parseTransactionAmount('-2500'), 2500);
  assert.equal(parseTransactionAmount('금액 없음'), 0);
});

test('transaction modal rebinding aborts the prior detail listener set', () => {
  const bindings = new WeakMap();
  const root = {};
  const first = replaceAbortableBinding(bindings, root);
  assert.equal(first.aborted, false);

  const second = replaceAbortableBinding(bindings, root);
  assert.equal(first.aborted, true);
  assert.equal(second.aborted, false);
});
