export function normalizeRewardPointModalId(value) {
  return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
}

export function rewardPointEntryDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function rewardPointDateInput(value) {
  const date = rewardPointEntryDate(value) || new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function rewardPointDateLabel(value) {
  const date = rewardPointEntryDate(value);
  if (!date) return '날짜 미정';
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function formatPointBalance(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? '-' : '';
  return `${sign}${Math.abs(amount).toLocaleString('ko-KR')}P`;
}

export function focusRewardLabel(label) {
  const text = String(label || '').replace(/\s*포인트\s*$/, '').trim();
  return text || '포인트';
}

export function rewardPointModalItems(snapshot = {}) {
  const items = [];
  const used = new Set();
  const append = item => {
    const id = normalizeRewardPointModalId(item?.id || item?.key || item?.pointItemId);
    if (!id || used.has(id)) return;
    used.add(id);
    items.push({
      id,
      label: String(item?.label || item?.pointItemLabel || id).trim().slice(0, 32) || id,
      order: Number(item?.order) || (items.length + 1) * 10,
    });
  };
  (snapshot.rewardPointItems || []).forEach(append);
  (snapshot.rewardSummary?.pointBuckets || []).forEach(append);
  (snapshot.rewardPointEntries || []).forEach(append);
  return items.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'ko'));
}

export function buildRewardPointModalModel(snapshot = {}, pointItemId, currentPointItemId = '') {
  const pointItems = rewardPointModalItems(snapshot);
  const selectedId = normalizeRewardPointModalId(pointItemId)
    || normalizeRewardPointModalId(currentPointItemId)
    || pointItems[0]?.id
    || '';
  const selectedBucket = (snapshot.rewardSummary?.pointBuckets || []).find(bucket => bucket.key === selectedId) || null;
  const selectedItem = pointItems.find(item => item.id === selectedId) || selectedBucket || pointItems[0] || null;
  const usageEntries = Array.isArray(snapshot.rewardPointEntries) ? snapshot.rewardPointEntries : [];
  return { pointItems, selectedId, selectedBucket, selectedItem, usageEntries };
}

export function findRewardPointEntry(snapshot = {}, entryId) {
  return (snapshot.rewardPointEntries || []).find(item => String(item?.id) === String(entryId)) || null;
}
