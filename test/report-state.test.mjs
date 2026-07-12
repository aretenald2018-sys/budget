import test from 'node:test';
import assert from 'node:assert/strict';

import { reportState } from '../features/report/state.js';

test('report state starts with the active report and home contracts', () => {
  assert.match(reportState.monthKey, /^\d{4}-\d{2}$/);
  assert.equal(reportState.viewMode, 'cycle');
  assert.equal(reportState.rootSelector, '#tab-report');
  assert.deepEqual(reportState.monthTxs, []);
  assert.deepEqual(reportState.cycleTxs, []);
});
