import test from 'node:test';
import assert from 'node:assert/strict';

import { financeState, resetFinanceTransientState } from '../features/finance/state.js';

test('finance state keeps loaded data while resetting transient editors', () => {
  Object.assign(financeState, {
    activeGoalId: 'goal-1',
    scenarios: [{ id: 'scenario-1' }],
    editScenarioId: 'scenario-1',
    actualSheetOpen: true,
    assetImport: { status: 'review' },
    panel: 'asset',
  });

  resetFinanceTransientState();

  assert.equal(financeState.activeGoalId, 'goal-1');
  assert.deepEqual(financeState.scenarios, [{ id: 'scenario-1' }]);
  assert.equal(financeState.editScenarioId, null);
  assert.equal(financeState.actualSheetOpen, false);
  assert.equal(financeState.assetImport, null);
  assert.equal(financeState.panel, 'scenario');
});
