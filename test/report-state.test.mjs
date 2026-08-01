import test from 'node:test';
import assert from 'node:assert/strict';

import { reportState } from '../features/report/state.js';

test('report state starts with the active report and home contracts', () => {
  assert.match(reportState.monthKey, /^\d{4}-\d{2}$/);
  // 모듈 로드 시각으로 잡힌 달은 '아직 사용자가 고른 값이 아니다'로 표시돼 있어야
  // render-report 가 첫 렌더에서 실제 기준 시각으로 다시 맞출 수 있다.
  assert.equal(reportState.monthKeyUserSet, false);
  assert.equal(reportState.viewMode, 'cycle');
  assert.equal(reportState.rootSelector, '#tab-report');
  assert.deepEqual(reportState.monthTxs, []);
  assert.deepEqual(reportState.cycleTxs, []);
});
