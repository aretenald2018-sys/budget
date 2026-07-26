// ================================================================
// utils/cycles.js — deterministic budget-cycle helpers
//
// 주기 길이는 설정(`budget.cycle`)이 정한다. 기본값 14일(2주)이고,
// 매주(7일)·직접 설정(N일)도 같은 계산식을 쓴다.
// ================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CYCLE_DAYS = 14;

function normalizeCycleDays(value) {
  const days = Math.round(Number(value));
  return Number.isFinite(days) && days >= 1 ? days : DEFAULT_CYCLE_DAYS;
}

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

export function cycleRange(keyOrDate = new Date(), days = DEFAULT_CYCLE_DAYS) {
  const span = normalizeCycleDays(days);
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
  return rangeFrom(start, span);
}

// 앵커(시작일)가 있으면 그 날짜를 기준으로 주기를 반복한다.
// 앵커가 없으면 ISO 주 기반 기본 주기 시작(월요일)을 앵커로 삼는다.
export function cycleRangeForDate(input = new Date(), anchorDate = '', days = DEFAULT_CYCLE_DAYS) {
  const span = normalizeCycleDays(days);
  const anchor = parseLocalISODate(anchorDate) || cycleRange(input, span).start;

  const date = atLocalNoon(input);
  const diffDays = utcDayNumber(date) - utcDayNumber(anchor);
  const cycleOffsetDays = Math.floor(diffDays / span) * span;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() + cycleOffsetDays);
  start.setHours(0, 0, 0, 0);
  return rangeFrom(start, span);
}

export function cycleProgress(keyOrDate = new Date(), now = new Date(), days = DEFAULT_CYCLE_DAYS) {
  return cycleProgressForRange(cycleRange(keyOrDate, days), now);
}

// 진행도의 분모는 범위 길이에서 뽑는다 — 2주 고정이 아니라 설정된 주기를 그대로 따른다.
export function cycleProgressForRange(range, now = new Date()) {
  const { start, end } = normalizeRange(range);
  const span = cycleDaysOfRange({ start, end });
  const clamped = Math.min(Math.max(now.getTime(), start.getTime()), end.getTime());
  const dayN = Math.min(span, Math.max(1, Math.floor((clamped - start.getTime()) / DAY_MS) + 1));
  return {
    dayN,
    totalDays: span,
    daysRemaining: Math.max(0, span - dayN),
    fraction: dayN / span,
  };
}

export function cycleDaysOfRange(range) {
  const { start, end } = normalizeRange(range);
  const span = Math.round((end.getTime() + 1 - start.getTime()) / DAY_MS);
  return Number.isFinite(span) && span >= 1 ? span : DEFAULT_CYCLE_DAYS;
}

function rangeFrom(start, days) {
  const end = new Date(start);
  end.setDate(start.getDate() + days);
  end.setMilliseconds(-1);
  return { start, end };
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
