import test from 'node:test';
import assert from 'node:assert/strict';

import { homeDashboardHtml } from '../features/home/dashboard.js';
import { buildHomeModel } from '../features/home/model.js';

test('homeDashboardHtml renders all dashboard sections with default model', () => {
  const html = homeDashboardHtml({});
  for (const marker of [
    'hd-header', 'hd-hero', 'hd-hero-amount', 'hd-hero-chart', 'hd-hero-dot',
    'hd-lens', 'hd-kpis', 'hd-kpi-ic', 'hd-donut', 'hd-legend', 'hd-funds',
    'hd-goal-grid', 'hd-goal-ic', 'hd-points', 'hd-point-row',
  ]) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
  // A(Safe-to-Spend) is the default hero lens
  assert.ok(html.includes('지금 써도 되는 돈'));
  assert.ok(html.includes('data-report-action="hero-lens"'));
  // 기간 전환은 오해를 주던 드롭다운형 버튼 대신 2주/달 세그먼트 토글로 제공
  assert.ok(html.includes('data-report-action="set-report-mode"'));
  assert.ok(html.includes('data-mode="cycle"') && html.includes('data-mode="month"'));
  assert.doesNotMatch(html, /onclick=/);
  assert.doesNotMatch(html, /undefined/);
  // Dev Ideas removed from home
  assert.doesNotMatch(html, /Dev Ideas|dev-idea|hd-dev/);
});

test('hero spent lens renders 지금까지 쓴 돈 as secondary view', () => {
  const html = homeDashboardHtml({ hero: { lens: 'spent' } });
  assert.ok(html.includes('지금까지 쓴 돈'));
  assert.ok(!html.includes('hd-hero-label">지금 써도 되는 돈'));
});

test('homeDashboardHtml escapes user-provided strings', () => {
  const html = homeDashboardHtml({ user: { name: '<b>x</b>', greeting: 'hi' } });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!html.includes('<b>x</b>'));
});

test('buildHomeModel derives STS hero, fund KPI, goals, points from data', () => {
  const cat = (name, parent, manwon, rhythm = 'spread') => ({
    name, parent, kind: 'expense', budgetRhythm: rhythm,
    monthlyTargets: { '2026-07': manwon * 10000 }, target: manwon * 10000,
  });
  const control = [cat('생활비용', '생활유지비', 40), cat('와인/야식', '변동비', 15)];
  const budgetCategories = [...control, cat('미분류', '미분류', 0)];
  const byCat = [{ name: '생활비용', expense: 440000 }, { name: '와인/야식', expense: 60000 }];
  const model = buildHomeModel({
    user: { email: 'taewoo@example.com' },
    cycleRange: { start: new Date(2026, 6, 15), end: new Date(2026, 6, 28) },
    mode: 'cycle', monthKey: '2026-07',
    controlCategories: control, budgetCategories, byCat, byCatMonth: byCat,
    cycleTxs: [{ type: 'transfer_in', amount: 500000, occurredAt: new Date(2026, 6, 16) }],
    monthTxs: [], periodAdjustments: [],
    safeToSpend: { amount: -225000, perDay: 0, daysRemaining: 5, provisions: 50000 },
    fundModels: [
      { id: 'f1', name: '돌발비용', emoji: '⚡', balance: 180000, monthlyProvision: 50000, overdrawn: false, active: true },
    ],
    rewardSummary: { pointBuckets: [{ key: 'winePurchase', label: '와인구매 포인트', monthPoints: -3356 }] },
    monthTargetAll: 1050000,
  });
  // hero: STS default lens, negative → danger badge with 초과 문구
  assert.equal(model.hero.lens, 'sts');
  assert.ok(model.hero.sts.negative);
  assert.ok(model.hero.sts.badgeText.includes('초과'));
  assert.ok(model.hero.spentLine.includes('충당금'));
  // KPI: 충당금 replaces 저축률
  const fundKpi = model.kpis.find(k => k.key === 'funds');
  // KPI 칩은 4열 폭에 맞춰 축약 표기(줄바꿈/잘림 방지)
  assert.equal(fundKpi.value, '18만원');
  assert.ok(!model.kpis.some(k => k.key === 'savings'));
  // funds section
  assert.equal(model.funds.items.length, 1);
  assert.equal(model.funds.items[0].name, '돌발비용');
  // goals: overspent 생활유지비 → realloc target = most-overspent child
  const living = model.goals.find(g => g.name === '생활유지비');
  assert.ok(living.percent > 100);
  assert.equal(living.realloc?.label, '생활비용');
  const uncat = model.goals.find(g => g.name === '미분류');
  assert.equal(uncat.action, '설정하기');
  // points preserved (불변 조건)
  const wine = model.points.find(p => p.key === 'winePurchase');
  assert.equal(wine.direction, 'down');
});

test('buildHomeModel is resilient to empty inputs', () => {
  const model = buildHomeModel({});
  assert.ok(model.hero && model.kpis.length === 4 && Array.isArray(model.goals));
  assert.equal(model.funds.items.length, 0);
  const html = homeDashboardHtml(model);
  assert.ok(html.includes('hd-hero'));
  assert.ok(html.includes('hd-fund-empty'));
});
