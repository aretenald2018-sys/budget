import test from 'node:test';
import assert from 'node:assert/strict';

import {
  budgetGoalGroups,
  currentRhythm,
  currentTarget,
  rhythmLabel,
  summarizeBudget,
} from '../features/settings/budget-goals/index.js';

const categories = [
  { id: 'rent', name: '월세', parent: '주거', target: 900000, budgetRhythm: 'fixed' },
  { id: 'food', name: '<식비>', parent: '생활', target: 300000, monthlyTargets: { '2026-07': 450000 } },
];

test('settings budget feature summarizes monthly overrides and rhythms', () => {
  assert.equal(currentTarget(categories[1], '2026-07'), 450000);
  assert.equal(currentRhythm(categories[1]), 'spread');
  assert.deepEqual(summarizeBudget(categories, '2026-07'), {
    total: 1350000,
    fixed: 900000,
    flexible: 450000,
    categoryCount: 2,
  });
  assert.equal(rhythmLabel('front_loaded'), '월초 집중');
});

test('settings budget feature renders editable grouped rows with escaped names', () => {
  const html = budgetGoalGroups(categories, '2026-07');
  assert.match(html, /data-category-id="rent"/);
  assert.match(html, /value="45"/);
  assert.match(html, /&lt;식비&gt;/);
  assert.doesNotMatch(html, /<식비>/);
});
