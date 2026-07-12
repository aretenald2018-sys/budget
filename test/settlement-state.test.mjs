import test from 'node:test';
import assert from 'node:assert/strict';

import { settlementState } from '../features/settlements/state.js';

test('settlement state owns the active direction filter', () => {
  settlementState.mode = 'all';
  assert.equal(settlementState.mode, 'all');
  settlementState.mode = 'in';
});
