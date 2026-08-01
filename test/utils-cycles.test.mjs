import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cycleDateRangeText,
  cycleProgressForRange,
  cycleRange,
  cycleRangeForDate,
  normalizeCycleDays,
} from '../utils/cycles.js';

const at = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0, 0);
const ymd = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

test('앵커에서 창 길이만큼 끊는다', () => {
  const week = cycleRangeForDate(at(2026, 7, 24), '2026-07-21', 7);
  assert.equal(ymd(week.start), '2026-07-21');
  assert.equal(ymd(week.end), '2026-07-27');
  assert.equal(week.days, 7);

  const biweek = cycleRangeForDate(at(2026, 7, 24), '2026-07-14', 14);
  assert.equal(ymd(biweek.start), '2026-07-14');
  assert.equal(ymd(biweek.end), '2026-07-27');
  assert.equal(biweek.days, 14);
});

test('끝 경계는 마지막 날 23:59:59.999 이다', () => {
  const { end } = cycleRangeForDate(at(2026, 7, 24), '2026-07-21', 7);
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
  assert.equal(end.getMilliseconds(), 999);
});

// 2주 창을 1주로 바꿔도 경계가 어긋나지 않는 근거. 14 = 7×2 라서 같은 앵커면
// 모든 2주 시작일이 1주 시작일이기도 하다 — 전환해도 오늘이 엉뚱한 창에 빠지지 않는다.
test('같은 앵커에서 2주 경계는 언제나 1주 경계이기도 하다', () => {
  const anchor = '2026-07-14';
  for (let offset = 0; offset < 60; offset += 1) {
    const day = at(2026, 7, 14);
    day.setDate(day.getDate() + offset);
    const biweek = cycleRangeForDate(day, anchor, 14);
    const weekAtBiweekStart = cycleRangeForDate(biweek.start, anchor, 7);
    assert.equal(ymd(weekAtBiweekStart.start), ymd(biweek.start), `offset ${offset}`);
    // 그리고 오늘은 언제나 자기 창 안에 있다.
    const week = cycleRangeForDate(day, anchor, 7);
    assert.ok(day >= week.start && day <= week.end, `offset ${offset} 창 밖`);
  }
});

test('진행도는 range 가 들고 있는 창 길이를 쓴다', () => {
  const week = cycleRangeForDate(at(2026, 7, 24), '2026-07-21', 7);
  const progress = cycleProgressForRange(week, at(2026, 7, 24));
  assert.equal(progress.dayN, 4);              // 21·22·23·24 → 4일째
  assert.equal(progress.daysRemaining, 3);     // 7 − 4
  assert.equal(progress.fraction, 4 / 7);

  const last = cycleProgressForRange(week, at(2026, 7, 27));
  assert.equal(last.dayN, 7);
  assert.equal(last.daysRemaining, 0);
});

// days 를 안 들고 다니는 range(테스트가 손으로 만든 것, 옛 저장값)는 2주로 본다.
// 이 폴백이 없으면 기존 호출부가 조용히 다른 잔여일을 계산한다.
test('창 길이가 없는 range 는 2주로 떨어진다', () => {
  const progress = cycleProgressForRange({ start: at(2026, 7, 14), end: at(2026, 7, 27) }, at(2026, 7, 24));
  assert.equal(progress.dayN, 11);
  assert.equal(progress.daysRemaining, 3);
  assert.equal(normalizeCycleDays(undefined), 14);
  assert.equal(normalizeCycleDays(7), 7);
  assert.equal(normalizeCycleDays('7'), 7);
  assert.equal(normalizeCycleDays(30), 14);
});

// 앵커를 아직 안 정한 사용자의 폴백. 1주는 짝수주 페어링 없이 그 날짜의 ISO 주에서 시작한다
// (페어링하면 최대 일주일 밀린 창을 보게 된다).
test('앵커가 없으면 1주 창은 이번 ISO 주 월요일에서 시작한다', () => {
  const friday = at(2026, 7, 24);              // 2026-07-24 는 금요일
  const week = cycleRange(friday, 7);
  assert.equal(week.days, 7);
  assert.equal(week.start.getDay(), 1);        // 월요일
  assert.ok(friday >= week.start && friday <= week.end);

  const biweek = cycleRange(friday, 14);
  assert.equal(biweek.days, 14);
  assert.equal(biweek.start.getDay(), 1);
});

test('범위 표기는 시작–끝 날짜를 그대로 읽는다', () => {
  assert.equal(cycleDateRangeText(cycleRangeForDate(at(2026, 7, 24), '2026-07-21', 7)), '7/21–7/27');
  assert.equal(cycleDateRangeText(cycleRangeForDate(at(2026, 7, 24), '2026-07-14', 14)), '7/14–7/27');
});
