// ================================================================
// utils/cycles.js — 앵커에서 N일씩 끊는 기간 창 (결정적)
//
// 창 길이는 7일(1주) 또는 14일(2주)이고, 만들어진 range 는 자기 길이를 `days` 로
// 함께 들고 다닌다. 진행도·잔여일 계산이 range 에서 길이를 읽으면 되므로 호출부가
// 창 길이를 두 번 말하지 않아도 되고, 둘이 어긋날 수도 없다.
// `days` 가 없는 range(테스트가 손으로 만든 {start,end} 등)는 14일로 본다.
// ================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

export function isoWeekInfo(input = new Date()) {
  const date = atLocalNoon(input);
  const day = (date.getDay() + 6) % 7;
  const thursday = new Date(date);
  thursday.setDate(date.getDate() - day + 3);
  const isoYear = thursday.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4, 12);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday - firstThursday) / (7 * DAY_MS));
  return { isoYear, week };
}

export function cycleKey(input = new Date()) {
  const { isoYear, week } = isoWeekInfo(input);
  const pairStart = week % 2 === 0 ? week : week - 1;
  const anchor = week % 2 === 0 ? 'A' : 'B';
  return `${isoYear}-W${String(Math.max(1, pairStart)).padStart(2, '0')}-${anchor}`;
}

// 앵커가 없을 때의 폴백. 2주 창은 기존대로 짝수주 페어의 앞주에서, 1주 창은
// 그 날짜가 실제로 속한 ISO 주에서 시작한다(페어링하면 최대 일주일이 밀린다).
export function cycleRange(keyOrDate = new Date(), cycleDays = 14) {
  const span = normalizeCycleDays(cycleDays);
  let isoYear;
  let week;
  if (typeof keyOrDate === 'string') {
    const match = keyOrDate.match(/^(\d{4})-W(\d{2})-/);
    isoYear = Number(match?.[1]) || isoWeekInfo().isoYear;
    week = Number(match?.[2]) || isoWeekInfo().week;
  } else if (span === 7) {
    ({ isoYear, week } = isoWeekInfo(keyOrDate));
  } else {
    const match = cycleKey(keyOrDate).match(/^(\d{4})-W(\d{2})-/);
    isoYear = Number(match[1]);
    week = Number(match[2]);
  }
  return rangeFrom(mondayOfIsoWeek(isoYear, week), span);
}

export function cycleRangeForDate(input = new Date(), anchorDate = '', cycleDays = 14) {
  const span = normalizeCycleDays(cycleDays);
  const anchor = parseLocalISODate(anchorDate);
  if (!anchor) return cycleRange(input, span);

  const date = atLocalNoon(input);
  const diffDays = utcDayNumber(date) - utcDayNumber(anchor);
  const cycleOffsetDays = Math.floor(diffDays / span) * span;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + cycleOffsetDays);
  return rangeFrom(start, span);
}

export function cycleProgress(keyOrDate = new Date(), now = new Date(), cycleDays = 14) {
  return cycleProgressForRange(cycleRange(keyOrDate, cycleDays), now);
}

export function cycleProgressForRange(range, now = new Date()) {
  const { start, end, days } = normalizeRange(range);
  const clamped = Math.min(Math.max(now.getTime(), start.getTime()), end.getTime());
  const dayN = Math.min(days, Math.max(1, Math.floor((clamped - start.getTime()) / DAY_MS) + 1));
  return {
    dayN,
    daysRemaining: Math.max(0, days - dayN),
    fraction: dayN / days,
  };
}

export function cycleLabel(keyOrDate = new Date(), now = new Date(), cycleDays = 14) {
  return cycleLabelForRange(cycleRange(keyOrDate, cycleDays), now);
}

export function cycleLabelForRange(range, now = new Date()) {
  const { dayN } = cycleProgressForRange(range, now);
  return `${cycleDateRangeText(range)} · ${dayN}일째`;
}

export function cycleDateRangeText(range) {
  const { start, end } = normalizeRange(range);
  return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`;
}

export function normalizeCycleAnchorDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function normalizeCycleDays(value) {
  return Number(value) === 7 ? 7 : 14;
}

function rangeFrom(startDate, span) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + span);
  end.setMilliseconds(-1);
  return { start, end, days: span };
}

function mondayOfIsoWeek(isoYear, week) {
  const jan4 = new Date(isoYear, 0, 4, 12);
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const start = new Date(week1Monday);
  start.setDate(week1Monday.getDate() + (week - 1) * 7);
  return start;
}

function atLocalNoon(input) {
  const date = input instanceof Date ? new Date(input) : new Date(input);
  date.setHours(12, 0, 0, 0);
  return date;
}

function parseLocalISODate(value) {
  const normalized = normalizeCycleAnchorDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function utcDayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function normalizeRange(range) {
  const days = normalizeCycleDays(range?.days);
  const fallback = cycleRange(new Date(), days);
  const start = range?.start instanceof Date && !Number.isNaN(range.start.getTime()) ? range.start : fallback.start;
  const end = range?.end instanceof Date && !Number.isNaN(range.end.getTime()) ? range.end : fallback.end;
  return { start, end, days };
}
