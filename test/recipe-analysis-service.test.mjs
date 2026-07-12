import assert from 'node:assert/strict';
import test from 'node:test';

import { processPendingRecipeItems } from '../api/_lib/recipe-analysis.js';

test('recipe analysis runs with fake store and skips parsed items on replay', async () => {
  const item = {
    id: 'recipe-1',
    type: 'recipe',
    url: 'https://youtube.com/watch?v=fixture',
    title: 'YouTube 영상',
    recipeAnalysisStatus: '',
  };
  const patches = [];
  const store = {
    async listRecent() { return { size: 1, items: [{ ...item }] }; },
    async patch(id, patch) {
      patches.push({ id, patch });
      Object.assign(item, patch);
    },
    serverTimestamp() { return 'SERVER_TIME'; },
    increment(value) { return { increment: value }; },
  };
  let previewCalls = 0;
  const preview = async () => {
    previewCalls += 1;
    return {
      title: 'Fixture recipe',
      provider: 'fixture',
      ingredients: [{ name: '토마토', quantity: '1개' }],
      steps: ['썬다'],
    };
  };

  const first = await processPendingRecipeItems({ max: 2, lookback: 2, store, preview });
  const replay = await processPendingRecipeItems({ max: 2, lookback: 2, store, preview });

  assert.equal(first.parsed, 1);
  assert.equal(replay.candidates, 0);
  assert.equal(previewCalls, 1);
  assert.equal(item.recipeAnalysisStatus, 'parsed');
  assert.deepEqual(patches.map(row => row.patch.recipeAnalysisStatus), ['processing', 'parsed']);
});
