import test from 'node:test';
import assert from 'node:assert/strict';

import { settingsState } from '../features/settings/state.js';

test('settings state owns the managed home category selection', () => {
  settingsState.managedCategoryIds = ['category-1', 'category-2'];
  assert.deepEqual(settingsState.managedCategoryIds, ['category-1', 'category-2']);
});
