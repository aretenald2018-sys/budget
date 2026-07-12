import test from 'node:test';
import assert from 'node:assert/strict';

import {
  averageScore,
  bottleCard,
  input,
  statusLabel,
  tastingCard,
  wineTile,
} from '../features/wine-cellar/view.js';

test('wine cellar view keeps score and status summaries stable', () => {
  assert.equal(averageScore([{ taewooScore: 4 }, { taewooScore: 5 }, {}]), '4.5');
  assert.equal(averageScore([]), '');
  assert.equal(statusLabel('opened'), '오픈함');
  assert.equal(statusLabel('finished'), '다 마심');
  assert.equal(statusLabel('cellared'), '보관 중');
});

test('wine cellar cards render tasting state and escape user content', () => {
  const bottle = { id: 'wine-1', name: '<피노>', status: 'cellared', vintage: '2020', region: '부르고뉴' };
  const tastings = [{ id: 'note-1', bottleId: 'wine-1', taewooSummary: '<좋음>', taewooScore: 5, tastedAt: new Date(2026, 6, 12) }];
  const tile = wineTile(bottle, tastings);
  const card = bottleCard(bottle, tastings);
  assert.match(tile, /&lt;피노&gt;/);
  assert.match(tile, /<i>★<\/i>/);
  assert.match(card, /&lt;좋음&gt;/);
  assert.match(tastingCard(tastings[0]), /5\/5/);
  assert.match(input('name', '이름', '<와인>'), /value="&lt;와인&gt;"/);
});
