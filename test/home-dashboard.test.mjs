import test from 'node:test';
import assert from 'node:assert/strict';

import { homeDashboardHtml } from '../features/home/dashboard.js';
import { buildHomeModel } from '../features/home/model.js';

// 데이터가 있는 모델은 모든 섹션을 그린다.
const POPULATED_MODEL = {
  user: { name: '태우', greeting: '좋은 하루예요!', avatarInitial: '태' },
  period: { label: '7월 15일 – 7월 28일', cycleLabel: '이번 2주' },
  hero: {
    lens: 'sts',
    sts: { amountText: '−191,323', negative: true, badgeText: '예산을 191,323원 초과했어요', badgeTone: 'danger' },
    spentView: { amountText: '941,323', overLabel: '예산 초과', overText: '+191,323원 초과', overTone: 'danger' },
    usageText: '125.5% 사용', usageTone: 'danger', fillPercent: 100,
    trend: [8, 11, 10, 15, 13, 19, 22, 26, 23, 21], trendBudget: 750000, trendSpent: 941323,
    tooltip: '지금 여기',
  },
  kpis: [
    { key: 'income', label: '수입', value: '344,267원', sub: '이번 2주', tone: 'info', icon: 'income', action: { tab: 'tx' } },
    { key: 'funds', label: '충당금', value: '없음', sub: '만들기 →', tone: 'brand', icon: 'shield', action: { settingsScreen: 'settings-funds-modal' } },
  ],
  funds: { items: [], monthlyText: '' },
  categories: { total: '941,323원', items: [{ id: 1, label: '교통', percent: 29, amount: '274,300원' }] },
  goals: [{ name: '생활유지비', fraction: '44만 / 20만', percent: 220, iconKey: 'home' }],
  points: [{ key: 'wine', label: '와인구매', value: '−3,356P', direction: 'down', color: '#E86A6A' }],
};

test('homeDashboardHtml renders all dashboard sections with a populated model', () => {
  const html = homeDashboardHtml(POPULATED_MODEL);
  for (const marker of [
    // '써도 되는 돈' 렌즈는 꺾은선 대신 와인병으로 남은 예산을 보여준다.
    'hd-header', 'hd-hero', 'hd-hero-amount', 'hd-hero-bottle', 'hd-bottle-svg',
    'hd-lens', 'hd-kpis', 'hd-kpi-ic', 'hd-donut', 'hd-legend', 'hd-funds',
    'hd-goal-grid', 'hd-goal-ic', 'hd-points', 'hd-point-row',
  ]) {
    assert.ok(html.includes(marker), `missing ${marker}`);
  }
  // A(Safe-to-Spend) is the default hero lens
  assert.ok(html.includes('지금 써도 되는 돈'));
  assert.ok(html.includes('data-report-action="hero-lens"'));
  // 개편: 히어로의 2주/달 세그먼트·'분석 보기' 버튼은 제거됨(기간 전환은 날짜 pill 모달로 일원화)
  assert.doesNotMatch(html, /data-report-action="set-report-mode"/);
  assert.doesNotMatch(html, /hd-analyze/);
  // 히어로 라벨 옆 계산 방식 (i) 아이콘
  assert.ok(html.includes('data-report-action="hero-info"'));
  assert.doesNotMatch(html, /onclick=/);
  assert.doesNotMatch(html, /undefined/);
  // Dev Ideas removed from home
  assert.doesNotMatch(html, /Dev Ideas|dev-idea|hd-dev/);

  // 이 모델은 125.5% 사용(예산 초과)이라 병이 비어 있어야 한다.
  assert.match(html, /hd-bottle-cap">다 비웠어요</);
  // 절반쯤 썼으면 남은 비율을 글자로도 말한다.
  const halfHtml = homeDashboardHtml({ ...POPULATED_MODEL, hero: { ...POPULATED_MODEL.hero, fillPercent: 40 } });
  assert.match(halfHtml, /hd-bottle-cap">60% 남음</);
  assert.doesNotMatch(html, /hd-hero-chart/);
  const spentHtml = homeDashboardHtml({ ...POPULATED_MODEL, hero: { ...POPULATED_MODEL.hero, lens: 'spent' } });
  assert.ok(spentHtml.includes('hd-hero-chart'), '쓴 돈 렌즈는 누적 곡선을 그린다');
});

// 예산이 없으면 가득 찬 병을 보여주면 안 된다 — 쓸 돈이 있다는 거짓말이 된다.
test('예산이 없으면 병을 채우지 않는다', () => {
  const html = homeDashboardHtml({});
  assert.ok(html.includes('hd-hero-bottle'));
  assert.match(html, /예산 미설정/);
  assert.doesNotMatch(html, /% 남음/);
});

// 신규 사용자(데이터 0)에게 지어낸 수치를 보여주지 않는다.
test('빈 모델은 목업 수치·가짜 곡선을 렌더하지 않는다', () => {
  const html = homeDashboardHtml({});
  assert.doesNotMatch(html, /191,323|941,323|344,267|1,050,000/);
  assert.doesNotMatch(html, /태우/);
  assert.doesNotMatch(html, /hd-hero-chart/);
  assert.doesNotMatch(html, /hd-point-row/);
  assert.doesNotMatch(html, /hd-legend-row/);
  assert.ok(html.includes('hd-hero'));
  assert.ok(html.includes('hd-fund-empty'));
  assert.ok(html.includes('아직 목표가 없어요'));
  assert.ok(html.includes('아직 포인트 내역이 없어요'));
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
  // 미분류는 '목표를 세울' 대상이 아니라 '정리할' 대상 — 거래 드릴로 보낸다.
  const uncat = model.goals.find(g => g.name === '미분류');
  assert.equal(uncat.action.label, '정리하기');
  assert.equal(uncat.action.reportAction, 'open-category');
  assert.equal(uncat.action.categoryName, '미분류');
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
