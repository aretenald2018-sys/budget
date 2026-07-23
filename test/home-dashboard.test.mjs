import test from 'node:test';
import assert from 'node:assert/strict';

import { homeDashboardHtml } from '../features/home/dashboard.js';
import { buildHomeModel } from '../features/home/model.js';

test('homeDashboardHtml renders all dashboard sections with default model', () => {
  const html = homeDashboardHtml({});
  for (const marker of [
    'hd-header', 'hd-hero', 'hd-hero-amount', 'hd-hero-chart', 'hd-hero-dot',
    'hd-kpis', 'hd-kpi-ic', 'hd-donut', 'hd-legend', 'hd-goal-grid',
    'hd-points', 'hd-point-row', 'hd-dev', 'hd-dev-add',
  ]) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
  assert.ok(html.includes('지금까지 쓴 돈'));
  assert.doesNotMatch(html, /onclick=/);
  assert.doesNotMatch(html, /undefined/);
});

test('homeDashboardHtml escapes user-provided strings', () => {
  const html = homeDashboardHtml({ user: { name: '<b>x</b>', greeting: 'hi' } });
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!html.includes('<b>x</b>'));
});

test('buildHomeModel derives hero, kpis, goals, points from data', () => {
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
    rewardSummary: { pointBuckets: [{ key: 'winePurchase', label: '와인구매 포인트', monthPoints: -3356 }] },
    devIdeas: [{ title: '개발 아이디어', status: 'done' }],
    monthTargetAll: 1050000,
  });
  // cycle halves spread targets: 생활비용 20만 + 와인 7.5만 = 27.5만 budget; spent 50만 → over
  assert.equal(model.hero.label, '지금까지 쓴 돈');
  assert.ok(model.hero.usageTone === 'danger');
  assert.equal(model.kpis[0].value, '500,000원');
  assert.equal(model.kpis[3].value, '1,050,000원');
  const wine = model.points.find(p => p.key === 'winePurchase');
  assert.equal(wine.direction, 'down');
  assert.ok(wine.value.startsWith('−'));
  const uncat = model.goals.find(g => g.name === '미분류');
  assert.equal(uncat.action, '설정하기');
  assert.ok(model.categories.items.length >= 1);
});

test('buildHomeModel is resilient to empty inputs', () => {
  const model = buildHomeModel({});
  assert.ok(model.hero && model.kpis.length === 4 && Array.isArray(model.goals));
  const html = homeDashboardHtml(model);
  assert.ok(html.includes('hd-hero'));
});
