// ================================================================
// utils/cycles.js — deterministic biweekly cycle helpers
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

export function cycleRange(keyOrDate = new Date()) {
  const key = typeof keyOrDate === 'string' ? keyOrDate : cycleKey(keyOrDate);
  const match = key.match(/^(\d{4})-W(\d{2})-/);
  const isoYear = Number(match?.[1]) || isoWeekInfo().isoYear;
  const week = Number(match?.[2]) || isoWeekInfo().week;
  const jan4 = new Date(isoYear, 0, 4, 12);
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const start = new Date(week1Monday);
  start.setDate(week1Monday.getDate() + (week - 1) * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 14);
  end.setMilliseconds(-1);
  return { start, end };
}

export function cycleRangeForDate(input = new Date(), anchorDate = '') {
  const anchor = parseLocalISODate(anchorDate);
  if (!anchor) return cycleRange(input);

  const date = atLocalNoon(input);
  const diffDays = utcDayNumber(date) - utcDayNumber(anchor);
  const cycleOffsetDays = Math.floor(diffDays / 14) * 14;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + cycleOffsetDays);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 14);
  end.setMilliseconds(-1);
  return { start, end };
}

export function cycleProgress(keyOrDate = new Date(), now = new Date()) {
  return cycleProgressForRange(cycleRange(keyOrDate), now);
}

export function cycleProgressForRange(range, now = new Date()) {
  const { start, end } = normalizeRange(range);
  const clamped = Math.min(Math.max(now.getTime(), start.getTime()), end.getTime());
  const dayN = Math.min(14, Math.max(1, Math.floor((clamped - start.getTime()) / DAY_MS) + 1));
  return {
    dayN,
    daysRemaining: Math.max(0, 14 - dayN),
    fraction: dayN / 14,
  };
}

export function cycleLabel(keyOrDate = new Date(), now = new Date()) {
  return cycleLabelForRange(cycleRange(keyOrDate), now);
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
  const fallback = cycleRange(new Date());
  const start = range?.start instanceof Date && !Number.isNaN(range.start.getTime()) ? range.start : fallback.start;
  const end = range?.end instanceof Date && !Number.isNaN(range.end.getTime()) ? range.end : fallback.end;
  return { start, end };
}
