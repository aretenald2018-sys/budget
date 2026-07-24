import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyByRules, ruleMatches, ruleSummary } from '../domain/transactions/classify.js';

const rules = [
  { id: 'r1', type: 'keyword', keyword: '스타벅스', categoryName: '카페비용' },
  { id: 'r2', type: 'amount', minAmount: 0, maxAmount: 10000, categoryName: '간식' },
];

test('classifyByRules picks the first matching rule (list order = priority)', () => {
  // 5,000원 스타벅스 → 두 규칙 모두 매칭되지만 순서상 카페비용이 이긴다.
  const hit = classifyByRules({ merchant: '스타벅스 강남점', amount: 5000 }, rules);
  assert.equal(hit.ruleId, 'r1');
  assert.equal(hit.categoryName, '카페비용');
  // 순서를 뒤집으면 금액 규칙이 이긴다.
  const flipped = classifyByRules({ merchant: '스타벅스 강남점', amount: 5000 }, [rules[1], rules[0]]);
  assert.equal(flipped.categoryName, '간식');
});

test('ruleMatches handles keyword normalization and amount bounds', () => {
  assert.equal(ruleMatches(rules[0], { merchant: '스타 벅스' }), true); // 공백 무시
  assert.equal(ruleMatches(rules[0], { memo: '어제 스타벅스에서' }), true);
  assert.equal(ruleMatches(rules[1], { amount: 9999 }), true);
  assert.equal(ruleMatches(rules[1], { amount: 10000 }), false); // max는 미만
  assert.equal(classifyByRules({ merchant: '이마트', amount: 50000 }, rules), null);
});

test('ruleSummary renders readable rule labels', () => {
  assert.equal(ruleSummary(rules[0]), "거래명에 '스타벅스' 포함");
  assert.equal(ruleSummary(rules[1]), '금액 10,000원 미만');
  assert.equal(ruleSummary({ type: 'amount', minAmount: 50000 }), '금액 50,000원 이상');
});
