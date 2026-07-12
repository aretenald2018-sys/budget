export function normalizeParty(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

export function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
