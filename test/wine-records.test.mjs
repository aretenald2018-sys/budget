import assert from 'node:assert/strict';
import test from 'node:test';

import {
  legacyTastingNotes,
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

test('tasting notes are written as 1차/2차 notes only', () => {
  const record = normalizeWineTastingRecord({
    bottleId: 'b1',
    tastedAt: '2026-07-16',
    firstNote: '체리, 말린 허브',
    secondNote: '30분 뒤 탄닌이 풀렸다',
  });
  assert.equal(record.firstNote, '체리, 말린 허브');
  assert.equal(record.secondNote, '30분 뒤 탄닌이 풀렸다');
});

test('retired note fields are never rewritten so stored values survive a merge save', () => {
  const record = normalizeWineTastingRecord({
    bottleId: 'b1',
    tastedAt: '2026-07-16',
    taewooSummary: '한 줄',
    nose: '향',
    palate: '맛',
    pairing: '페어링',
    note: '노트',
  });
  for (const key of ['taewooSummary', 'nose', 'palate', 'pairing', 'note']) {
    assert.ok(!(key in record), `${key} must not be written back`);
  }
});

test('legacy tasting notes stay readable for records that already have them', () => {
  assert.deepEqual(legacyTastingNotes({ nose: '체리', pairing: '  ' }), [
    { key: 'nose', label: '향', value: '체리' },
  ]);
  assert.deepEqual(legacyTastingNotes({ firstNote: '새 노트' }), []);
});
