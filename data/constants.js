export const BUDGET_SCHEMA_VERSION = '2026-2q-v1';
export const BUDGET_MONTH_KEY = '2026-05';
export const BUDGET_START_DATE = new Date(2026, 4, 1, 0, 0, 0, 0);

export const UNCATEGORIZED_CATEGORY_NAME = '미분류';
export const REIMBURSEMENT_CATEGORY_NAME = '환급예정금액';

// 지출 카테고리가 속하는 목표 그룹(홈 '나의 목표' 카드 단위).
// 시드 카테고리는 이 셋 중 하나 + 미분류를 쓰지만, 사용자가 새 그룹을 만들 수
// 있으므로 화면은 이 목록이 아니라 실제 카테고리 데이터에서 그룹을 유도한다.
// 이 상수는 "추천 그룹" 목록(카테고리 편집 모달의 선택지)일 뿐이다.
export const SUGGESTED_CATEGORY_GROUPS = Object.freeze([
  '생활유지비',
  '자아유지비',
  '변동비',
]);

export const DEFAULT_BUDGET_RHYTHMS = Object.freeze({
  '주거비용': 'fixed',
  '보험비용': 'fixed',
  '통신비용': 'fixed',
  '교통비용': 'fixed',
});
