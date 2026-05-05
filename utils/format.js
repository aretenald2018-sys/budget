// ================================================================
// utils/format.js — 포매팅 헬퍼
// ================================================================

export function fmtKRW(n) {
  if (n == null || isNaN(n)) return '-';
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(n).toLocaleString('ko-KR') + '원';
}

export function fmtKRWShort(n) {
  if (n == null || isNaN(n)) return '-';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000) return sign + Math.floor(abs / 10000) + '만';
  return sign + abs.toLocaleString('ko-KR');
}

export function fmtDate(d) {
  if (!d) return '';
  const date = d.toDate ? d.toDate() : new Date(d);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
}

export function fmtDateTime(d) {
  if (!d) return '';
  const date = d.toDate ? d.toDate() : new Date(d);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}

export function fmtMonthKey(d) {
  const date = d ? new Date(d) : new Date();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${m}`;
}

export function monthRange(monthKey) {
  // monthKey '2026-04' → { start: Date(2026-04-01), end: Date(2026-04-30 23:59:59) }
  const [y, m] = monthKey.split('-').map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

export function relTime(d) {
  if (!d) return '';
  const date = d.toDate ? d.toDate() : new Date(d);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return fmtDate(date);
}
