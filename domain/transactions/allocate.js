// ================================================================
// domain/transactions/allocate.js — 카테고리 예산 자동 배분 (순수 함수)
// 설정 02 카테고리 목표의 "자동 배분". 전체 예산을 자동 관리 카테고리에
// 최근 사용 비중(없으면 기존 목표 비중, 그것도 없으면 균등)으로 나눈다.
// ================================================================

// categories: [{ id, weight }] — weight는 최근 사용액 또는 기존 목표액.
// 반환: { [categoryId]: 배분액(원, 1000원 단위 내림, 잔차는 첫 항목에 가산) }
export function allocateBudget(totalAmount, categories = []) {
  const total = Math.max(0, Math.round(Number(totalAmount) || 0));
  const rows = (Array.isArray(categories) ? categories : [])
    .map(cat => ({ id: String(cat.id || ''), weight: Math.max(0, Number(cat.weight) || 0) }))
    .filter(cat => cat.id);
  if (!total || !rows.length) return {};
  const weightSum = rows.reduce((sum, cat) => sum + cat.weight, 0);
  const result = {};
  let assigned = 0;
  for (const cat of rows) {
    const share = weightSum > 0 ? cat.weight / weightSum : 1 / rows.length;
    const amount = Math.floor((total * share) / 1000) * 1000;
    result[cat.id] = amount;
    assigned += amount;
  }
  // 잔차는 가중치가 가장 큰 항목에 가산해 합계를 맞춘다.
  const first = rows.slice().sort((a, b) => b.weight - a.weight)[0];
  result[first.id] += total - assigned;
  return result;
}
