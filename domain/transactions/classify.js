// ================================================================
// domain/transactions/classify.js — 사용자 규칙 기반 자동 분류 (순수 함수)
// 설정 08 자동 분류 화면의 규칙 평가. 배열 순서 = 우선순위(위가 먼저).
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-08
// ================================================================

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

// rule: { id, type:'keyword'|'amount', keyword, minAmount, maxAmount, categoryName, subcategory }
export function ruleMatches(rule = {}, tx = {}) {
  const amount = Math.abs(Number(tx.amount) || 0);
  if (rule.type === 'keyword') {
    const keyword = normalizeText(rule.keyword);
    if (!keyword) return false;
    const haystack = normalizeText(`${tx.merchant || ''} ${tx.counterparty || ''} ${tx.memo || ''}`);
    return haystack.includes(keyword);
  }
  if (rule.type === 'amount') {
    const min = Math.max(0, Number(rule.minAmount) || 0);
    const max = Math.max(0, Number(rule.maxAmount) || 0);
    if (!min && !max) return false;
    if (min && amount < min) return false;
    if (max && amount >= max) return false;
    return true;
  }
  return false;
}

// 첫 번째로 매칭되는 규칙을 반환(순서 = 우선순위). 없으면 null.
export function classifyByRules(tx = {}, rules = []) {
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (ruleMatches(rule, tx)) {
      return { ruleId: rule.id, categoryName: rule.categoryName, subcategory: rule.subcategory || '' };
    }
  }
  return null;
}

// 사람이 읽는 규칙 요약 (설정 08 리스트 행)
export function ruleSummary(rule = {}) {
  if (rule.type === 'keyword') return `거래명에 '${rule.keyword}' 포함`;
  const min = Math.max(0, Number(rule.minAmount) || 0);
  const max = Math.max(0, Number(rule.maxAmount) || 0);
  if (min && max) return `금액 ${min.toLocaleString('ko-KR')}~${max.toLocaleString('ko-KR')}원`;
  if (max) return `금액 ${max.toLocaleString('ko-KR')}원 미만`;
  return `금액 ${min.toLocaleString('ko-KR')}원 이상`;
}
