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
    // 결제 내역 연동: 이 와인을 산 거래를 연결하면 셀러에서 실제 지출과
    // 와인구매 포인트 적립을 함께 볼 수 있다.
    purchaseTxId: String(bottle.purchaseTxId || '').trim() || null,
    pricePaid: normalizeWinePrice(bottle.pricePaid),
    purchasedAt: recordDate(bottle.purchasedAt),
    source: 'wine-cellar',
  };
}

function normalizeWinePrice(value) {
  const amount = Math.round(Math.abs(Number(String(value ?? '').replace(/[^0-9.-]/g, '')) || 0));
  return Number.isFinite(amount) && amount > 0 ? Math.min(99999999, amount) : null;
}

// 한 줄 요약 · 향 · 맛 · 페어링 · 노트는 입력 항목에서 내렸다. 이미 저장된 값은
// 지우지 않는다 — 정규화 결과에서 빼기만 하면 저장이 merge 라 원본이 그대로 남는다.
export const LEGACY_TASTING_NOTE_FIELDS = [
  { key: 'taewooSummary', label: '한 줄 요약' },
  { key: 'nose', label: '향' },
  { key: 'palate', label: '맛' },
  { key: 'pairing', label: '페어링' },
  { key: 'note', label: '노트' },
];

// 지금은 쓰지 않지만 이미 남아 있는 기록 — 카드/편집 화면에서 읽기 전용으로 보여준다.
export function legacyTastingNotes(tasting = {}) {
  return LEGACY_TASTING_NOTE_FIELDS
    .map(field => ({ ...field, value: String(tasting[field.key] || '').trim() }))
    .filter(field => field.value);
}

// 목록 정렬 키. Firestore orderBy 는 정렬 필드가 없는 문서를 결과에서 통째로
// 빼 버리므로(과거 데이터·부분 저장 문서가 조용히 사라진다) 목록은 전부 읽어
// 클라이언트에서 이 키로 정렬한다. 시각 필드가 하나도 없어도 0 으로 남긴다.
export function wineBottleSortKey(bottle = {}) {
  const date = recordDate(bottle.createdAt) || recordDate(bottle.purchasedAt) || recordDate(bottle.updatedAt);
  return date ? date.getTime() : 0;
}

export function wineTastingSortKey(tasting = {}) {
  const date = recordDate(tasting.tastedAt) || recordDate(tasting.createdAt) || recordDate(tasting.updatedAt);
  return date ? date.getTime() : 0;
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
    // 1차 노트: 잔에 따른 직후 · 2차 노트: 시간이 지난 뒤
    firstNote: String(note.firstNote || '').trim().slice(0, 1200),
    secondNote: String(note.secondNote || '').trim().slice(0, 1200),
  };
}
