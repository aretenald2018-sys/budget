function recordDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') return recordDate(value.toDate());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeWineBottleRecord(bottle = {}) {
  const name = String(bottle.name || '').trim().slice(0, 120);
  if (!name) throw new Error('와인 이름을 입력하세요.');
  const vintage = Number(bottle.vintage);
  return {
    name,
    vintage: Number.isInteger(vintage) && vintage >= 1800 && vintage <= 2200 ? vintage : null,
    region: String(bottle.region || '').trim().slice(0, 120),
    variety: String(bottle.variety || '').trim().slice(0, 120),
    imageUrl: String(bottle.imageUrl || '').trim() || null,
    imageThumbnail: String(bottle.imageThumbnail || '').trim() || null,
    status: ['cellared', 'opened', 'finished'].includes(bottle.status) ? bottle.status : 'cellared',
    source: 'wine-cellar',
  };
}

export function normalizeWineTastingRecord(note = {}) {
  const bottleId = String(note.bottleId || '').trim();
  const tastedAt = recordDate(note.tastedAt);
  if (!bottleId) throw new Error('마신 와인을 선택하세요.');
  if (!tastedAt) throw new Error('테이스팅 날짜를 입력하세요.');
  const rating = Number(note.taewooScore);
  return {
    bottleId,
    tastedAt,
    taewooScore: Number.isFinite(rating) && rating >= 0.5 && rating <= 5 ? Math.round(rating * 2) / 2 : null,
    taewooSummary: String(note.taewooSummary || '').trim().slice(0, 240),
    nose: String(note.nose || '').trim().slice(0, 240),
    palate: String(note.palate || '').trim().slice(0, 240),
    pairing: String(note.pairing || '').trim().slice(0, 160),
    note: String(note.note || '').trim().slice(0, 1200),
  };
}
