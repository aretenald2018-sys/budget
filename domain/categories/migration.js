// ================================================================
// domain/categories/migration.js — 카테고리 스키마 마이그레이션 판단 로직(순수 함수)
//
// data/repositories/master-data.js 의 _ensureBudgetCategorySchema 가 이 판단을
// 그대로 실행에 옮긴다. 여기 함수들은 Firestore를 몰라야 한다 — 그래야 node
// --test 로 직접 단위 테스트할 수 있다. (레포지토리 파일은 firebase-firestore.js를
// gstatic URL로 import해 Node에서 그대로 로드할 수 없다.)
//
// 배경: 예전엔 버전 마커를 마이그레이션 "완료 후"에만 찍었다. 그래서 삭제→
// 리시드→리맵 중 아무 데서나 실패하면 다음 loadCategories() 호출(로그인마다,
// 카테고리 저장 직후마다)이 파괴적 전체 재실행을 처음부터 반복했다 — 쿼터
// 소진 상황에서 부하를 더 키우는 자기증폭 버그. 이제는 파괴 단계 진입 "전"에
// stage:'migrating' + legacy 스냅샷을 먼저 남겨서, 재진입 시 삭제·리시드는
// 건너뛰고 리맵부터 재개한다.
// ================================================================

export const CATEGORY_MIGRATION_BACKOFF_MS = 60 * 60 * 1000; // 1시간

/**
 * 지금 어떤 동작을 할지 결정한다. Firestore를 전혀 만지지 않는 순수 판단.
 * @returns {'skip-done'|'skip-session-limit'|'skip-backoff'|'resume'|'start'}
 */
export function decideCategoryMigrationAction({
  meta = null,
  targetVersion,
  now = Date.now(),
  sessionAttempted = false,
  lastFailureAt = null,
  backoffMs = CATEGORY_MIGRATION_BACKOFF_MS,
} = {}) {
  const atTargetVersion = !!meta && meta.version === targetVersion;
  if (atTargetVersion && meta.stage === 'done') return 'skip-done';
  // 세션 내 재시도 1회 제한: 이번 페이지 수명 동안 이미 한 번 시도했으면
  // (성공했다면 위에서 이미 skip-done 이었을 것) 더 반복하지 않는다.
  if (sessionAttempted) return 'skip-session-limit';
  // 세션을 넘나드는 백오프: 최근 실패로부터 backoffMs 가 지나지 않았으면 쉰다.
  if (lastFailureAt != null && Number.isFinite(lastFailureAt) && now - lastFailureAt < backoffMs) {
    return 'skip-backoff';
  }
  // 버전은 이미 맞는데 완료가 안 됐다 = 파괴 단계(삭제·리시드) 이후 어딘가에서
  // 중단됐다. 삭제·리시드를 반복하지 않고 재개한다.
  if (atTargetVersion && meta.stage === 'migrating') return 'resume';
  return 'start';
}

// 재개 시 '삭제·리시드는 건너뛰고 부족분만 보충'에 쓰는 비교.
export function missingDefaultCategories(existingNames = [], defaultCategories = []) {
  const known = new Set((existingNames || []).filter(Boolean));
  return (defaultCategories || []).filter(cat => cat?.name && !known.has(cat.name));
}

// 예산 시작일 이후 거래를 새 카테고리 이름으로 재분류할 때 쓰는 키워드 규칙.
// 거래 자체(가맹점/메모/본문)에서 찾는다 — 구 카테고리 이름은 새 체계와
// 맞지 않을 수 있어서 신뢰하지 않는다.
const REMAP_RULES = [
  ['주거비용', ['주거', '월세', '관리비', '임대료']],
  ['보험비용', ['보험']],
  ['통신비용', ['통신', '휴대폰', '핸드폰', '인터넷', '유플러스', 'skt', 'kt']],
  ['교통비용', ['교통', '택시', '버스', '지하철', '티머니', '충전']],
  ['카페비용', ['카페', '커피', '스타벅스', '투썸', '이디야', '메가커피', '컴포즈']],
  ['교육비용', ['교육', '강의', '학원', '도서', '책', '클래스']],
  ['정신건강', ['상담', '정신건강', '심리', '명상']],
  ['헬스미용피부', ['헬스', '미용', '피부', '네일', '필라테스', '운동']],
  ['와인/야식', ['와인', '와인앤모어', '주류', '바틀샵', '야식', '치킨', '피자', '족발', '술와인']],
  ['대인관계1', ['대인관계', '모임', '친구', '술자리']],
  ['취미/여가/의류/쇼핑/기타', ['취미', '여가', '쇼핑', '의류', '게임', '기타', '충동쇼핑', '쇼핑의류']],
  ['생활비용', ['식비', '생활', '마트', '편의점', '배달', '음식', '쿠팡']],
];

function normalizeMatchText(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

export function mapTxToBudgetCategory(tx = {}) {
  const text = normalizeMatchText([tx.category, tx.merchant, tx.counterparty, tx.memo, tx.body].filter(Boolean).join(' '));
  const match = REMAP_RULES.find(([, keys]) => keys.some(key => text.includes(normalizeMatchText(key))));
  return match?.[0] || null;
}

// 구 카테고리 스냅샷(legacy)에 있던 이름이면 그대로 보존, 아니면 기존 값이나 null.
export function resolvePreviousCategory(tx = {}, previousNames) {
  const names = previousNames instanceof Set ? previousNames : new Set(previousNames || []);
  return names.has(tx.category) ? tx.category : (tx.category || null);
}

// writeBatch 는 최대 500 연산 — 여유를 두고 청크로 자른다.
export function chunkArray(items = [], size = 450) {
  const list = Array.isArray(items) ? items : [];
  const chunkSize = Math.max(1, Math.floor(size) || 1);
  const chunks = [];
  for (let i = 0; i < list.length; i += chunkSize) chunks.push(list.slice(i, i + chunkSize));
  return chunks;
}
