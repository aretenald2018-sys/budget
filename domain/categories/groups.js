// ================================================================
// domain/categories/groups.js — 지출 카테고리의 목표 그룹 유도(순수 함수)
//
// 그룹 = 홈 '나의 목표' 카드 한 장의 단위이자 카테고리의 `parent` 필드.
// 예전에는 홈이 ['생활유지비','자아유지비','변동비','미분류'] 를 하드코딩해
// 사용자가 만든 그룹의 카테고리가 홈에서 통째로 사라졌다. 그룹은 항상 실제
// 카테고리 데이터에서 유도한다. 미분류는 언제나 마지막.
// ================================================================

export const DEFAULT_UNCATEGORIZED_GROUP = '미분류';

// 카테고리 한 건이 속한 그룹 이름. parent 가 비면 자기 이름이 곧 그룹이다
// (기존 buildGoals/집계 코드와 동일한 규칙).
export function groupNameOf(category) {
  const parent = String(category?.parent || '').trim();
  return parent || String(category?.name || '').trim();
}

// 지출 카테고리 목록 → 화면 순서대로 정렬된 그룹 이름 배열.
// 정렬 기준: 그룹 안 최소 parentOrder → 최초 등장 순서. 미분류는 항상 끝.
export function categoryGroupsFrom(categories = [], options = {}) {
  const uncategorized = options.uncategorizedName || DEFAULT_UNCATEGORIZED_GROUP;
  const seen = new Map();
  (Array.isArray(categories) ? categories : [])
    .filter(category => category?.kind !== 'income')
    .forEach((category, index) => {
      const name = groupNameOf(category);
      if (!name) return;
      const order = Number(category.parentOrder);
      const current = seen.get(name);
      const parentOrder = Number.isFinite(order) ? order : 99;
      if (!current) seen.set(name, { name, parentOrder, index });
      else if (parentOrder < current.parentOrder) current.parentOrder = parentOrder;
    });
  return [...seen.values()]
    .sort((a, b) => {
      const aLast = a.name === uncategorized;
      const bLast = b.name === uncategorized;
      if (aLast !== bLast) return aLast ? 1 : -1;
      return a.parentOrder - b.parentOrder || a.index - b.index;
    })
    .map(group => group.name);
}

// 카테고리 편집 모달의 그룹 선택지. 데이터에 있는 그룹 + 추천 그룹 합집합.
export function groupOptionsFrom(categories = [], options = {}) {
  const uncategorized = options.uncategorizedName || DEFAULT_UNCATEGORIZED_GROUP;
  const suggested = Array.isArray(options.suggested) ? options.suggested : [];
  const fromData = categoryGroupsFrom(categories, { uncategorizedName: uncategorized });
  const merged = [];
  for (const name of [...fromData, ...suggested, uncategorized]) {
    if (name && !merged.includes(name)) merged.push(name);
  }
  // 미분류는 선택지에서도 마지막.
  return [...merged.filter(name => name !== uncategorized), uncategorized];
}

// 새 그룹에 부여할 parentOrder. 기존 그룹 최대값+1, 단 미분류(99)보다 앞.
export function nextGroupOrder(categories = [], options = {}) {
  const uncategorized = options.uncategorizedName || DEFAULT_UNCATEGORIZED_GROUP;
  const orders = (Array.isArray(categories) ? categories : [])
    .filter(category => category?.kind !== 'income' && groupNameOf(category) !== uncategorized)
    .map(category => Number(category.parentOrder))
    .filter(Number.isFinite);
  const max = orders.length ? Math.max(...orders) : 0;
  return Math.min(98, Math.max(1, max + 1));
}

// 이미 있는 그룹이면 그 그룹의 parentOrder 를 그대로 물려받는다.
export function groupOrderFor(categories = [], groupName = '', options = {}) {
  const uncategorized = options.uncategorizedName || DEFAULT_UNCATEGORIZED_GROUP;
  const name = String(groupName || '').trim();
  if (!name) return nextGroupOrder(categories, options);
  if (name === uncategorized) return 99;
  const orders = (Array.isArray(categories) ? categories : [])
    .filter(category => category?.kind !== 'income' && groupNameOf(category) === name)
    .map(category => Number(category.parentOrder))
    .filter(Number.isFinite);
  if (!orders.length) return nextGroupOrder(categories, options);
  return Math.min(...orders);
}
