import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeWineBottleRecord,
  normalizeWineTastingRecord,
} from '../domain/wine/records.js';

test('wine bottle name and tasting date are the only required record identity', () => {
  assert.throws(() => normalizeWineBottleRecord({}), /와인 이름/);
  assert.throws(() => normalizeWineTastingRecord({ bottleId: 'b1' }), /날짜/);
  const tasting = normalizeWineTastingRecord({ bottleId: 'b1', tastedAt: '2026-07-16' });
  assert.equal(tasting.bottleId, 'b1');
  assert.equal(tasting.taewooScore, null);
  assert.ok(tasting.tastedAt instanceof Date);
});

test('wine ratings are optional, bounded, and rounded to half points', () => {
  const base = { bottleId: 'b1', tastedAt: '2026-07-16' };
  assert.equal(normalizeWineTastingRecord({ ...base, taewooScore: 4.24 }).taewooScore, 4);
  assert.equal(normalizeWineTastingRecord({ ...base, taewooScore: 4.26 }).taewooScore, 4.5);
  assert.equal(normalizeWineTastingRecord({ ...base, taewooScore: 8 }).taewooScore, null);
});
