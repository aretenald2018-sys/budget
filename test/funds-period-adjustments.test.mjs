import test from 'node:test';
import assert from 'node:assert/strict';

import { filterPeriodAdjustments } from '../features/funds/state.js';
import { cycleRangeForDate } from '../utils/cycles.js';
import { localISODate } from '../features/funds/state.js';

const NOW = new Date(2026, 6, 24, 12);
const ANCHOR = '2026-07-14';

const biweekRange = cycleRangeForDate(NOW, ANCHOR, 14);   // 07-14 ~ 07-27
const weekRange = cycleRangeForDate(NOW, ANCHOR, 7);      // 07-21 ~ 07-27

// 2주 창에서 기록한 재배분. 저장 시점의 창 시작일이 키로 박힌다.
const adjustment = {
  id: 'a1',
  scope: 'cycle',
  cycleStartDate: localISODate(biweekRange.start),
  monthKey: '2026-07',
  occurredAt: new Date(2026, 6, 24, 9),
  amount: 50000,
  from: { kind: 'fund', id: 'f1' },
  to: { kind: 'category', label: '식비' },
};

test('픽스처가 두 창의 시작일이 다른 상황을 실제로 만든다', () => {
  assert.equal(localISODate(biweekRange.start), '2026-07-14');
  assert.equal(localISODate(weekRange.start), '2026-07-21');
});

test('기록한 그 창에서는 당연히 보인다', () => {
  const rows = filterPeriodAdjustments([adjustment], {
    mode: 'cycle',
    monthKey: '2026-07',
    cycleStartDate: localISODate(biweekRange.start),
    periodRange: biweekRange,
  });
  assert.deepEqual(rows.map(r => r.id), ['a1']);
});

// 이번 변경의 핵심 회귀 가드.
// cycleStartDate 정확 일치만 보면, 2주 → 1주로 바꾸는 순간 오늘 한 재배분이
// 홈 '써도 되는 돈'에서 사라진다(키가 07-14 인데 1주 창은 07-21 로 시작).
// 삭제된 건 아니지만 오늘 한 결정이 오늘 안 보이는 건 그 자체로 버그다.
test('주기 길이를 바꿔도 이 창 안에 기록된 재배분은 남는다', () => {
  const rows = filterPeriodAdjustments([adjustment], {
    mode: 'week',
    monthKey: '2026-07',
    cycleStartDate: localISODate(weekRange.start),
    periodRange: weekRange,
  });
  assert.deepEqual(rows.map(r => r.id), ['a1']);
});

test('창 밖에 기록된 재배분까지 끌어오지는 않는다', () => {
  const older = { ...adjustment, id: 'a2', occurredAt: new Date(2026, 6, 15, 9) };
  const rows = filterPeriodAdjustments([older], {
    mode: 'week',
    monthKey: '2026-07',
    cycleStartDate: localISODate(weekRange.start),
    periodRange: weekRange,
  });
  assert.deepEqual(rows.map(r => r.id), []);
});

test('Firestore Timestamp 형태의 occurredAt 도 읽는다', () => {
  const stamped = {
    ...adjustment,
    id: 'a3',
    occurredAt: { toDate: () => new Date(2026, 6, 24, 9) },
  };
  const rows = filterPeriodAdjustments([stamped], {
    mode: 'week',
    monthKey: '2026-07',
    cycleStartDate: localISODate(weekRange.start),
    periodRange: weekRange,
  });
  assert.deepEqual(rows.map(r => r.id), ['a3']);
});

test('월 모드는 예전처럼 monthKey 로만 거른다', () => {
  const rows = filterPeriodAdjustments(
    [adjustment, { ...adjustment, id: 'other', monthKey: '2026-06' }],
    { mode: 'month', monthKey: '2026-07', periodRange: biweekRange },
  );
  assert.deepEqual(rows.map(r => r.id), ['a1']);
});

// periodRange 를 안 넘기는 기존 호출부는 예전 동작(정확 일치)만 한다.
test('periodRange 가 없으면 시작일 정확 일치만 본다', () => {
  const rows = filterPeriodAdjustments([adjustment], {
    mode: 'week',
    monthKey: '2026-07',
    cycleStartDate: '2026-07-21',
  });
  assert.deepEqual(rows.map(r => r.id), []);
});
