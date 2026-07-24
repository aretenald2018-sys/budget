import test from 'node:test';
import assert from 'node:assert/strict';

import { homeDashboardHtml } from '../features/home/dashboard.js';
import { buildHomeModel } from '../features/home/model.js';
import { buildFundCardModels } from '../features/funds/state.js';
import { fundDetailModalHtml, reallocationModalHtml } from '../features/funds/view.js';
import { buildRewardPointModalModel } from '../features/report/reward-point-modal/state.js';
import { rewardPointModalHtml } from '../features/report/reward-point-modal/view.js';
import { goalDetailModalHtml } from '../features/home/goal-modal.js';

const cat = (name, parent, manwon, rhythm = 'spread') => ({
  name, parent, kind: 'expense', budgetRhythm: rhythm,
  monthlyTargets: { '2026-07': manwon * 10000 }, target: manwon * 10000,
});
const control = [cat('생활비용', '생활유지비', 40), cat('와인/야식', '변동비', 15)];
const budgetCategories = [...control, cat('미분류', '미분류', 0)];
const byCatCycle = [{ name: '생활비용', expense: 220000 }, { name: '와인/야식', expense: 30000 }];
const byCatMonth = [{ name: '생활비용', expense: 440000 }, { name: '와인/야식', expense: 60000 }];
const day = (y, m, d) => new Date(y, m - 1, d);
const monthTxs = [
  { type: 'card_payment', amount: 120000, occurredAt: day(2026, 7, 3) },
  { type: 'card_payment', amount: 200000, occurredAt: day(2026, 7, 20) },
  { type: 'transfer_in', amount: 500000, occurredAt: day(2026, 7, 1) },
];
const cycleTxs = [
  { type: 'card_payment', amount: 60000, occurredAt: day(2026, 7, 16) },
  { type: 'transfer_in', amount: 500000, occurredAt: day(2026, 7, 16) },
];

function model(mode) {
  return buildHomeModel({
    user: { email: 'taewoo@example.com' },
    cycleRange: { start: day(2026, 7, 15), end: day(2026, 7, 28) },
    mode, monthKey: '2026-07',
    controlCategories: control, budgetCategories,
    byCat: mode === 'cycle' ? byCatCycle : byCatMonth, byCatMonth,
    cycleTxs, monthTxs, periodAdjustments: [],
    safeToSpend: { amount: 120000, perDay: 10000, daysRemaining: 8, provisions: 50000 },
    fundModels: [{ id: 'f1', name: '돌발비용', emoji: '⚡', balance: 180000, monthlyProvision: 50000, overdrawn: false, active: true }],
    rewardSummary: { pointBuckets: [{ key: 'winePurchase', label: '와인구매 포인트', monthPoints: -3356 }] },
    monthTargetAll: 1050000,
  });
}

test('toggle 2주↔달 changes hero amount, labels, and trend chart', () => {
  const cycle = model('cycle');
  const month = model('month');

  // period labels flip appropriately (no raw monthKey leaking)
  assert.equal(cycle.period.cycleLabel, '이번 2주');
  assert.equal(month.period.cycleLabel, '이번 달');
  assert.doesNotMatch(month.period.cycleLabel, /2026-07/);
  assert.equal(month.period.label, '2026년 7월');
  assert.notEqual(cycle.period.label, month.period.label);

  // spent (히어로 하단 내역) differs because byCat differs across modes
  assert.notEqual(cycle.hero.spentLine, month.hero.spentLine);

  // trend chart actually reflects the mode's transactions (not identical fallback)
  assert.notDeepEqual(cycle.hero.trend, month.hero.trend);
  // month trend must be driven by monthTxs → last cumulative bucket = sum of month card spend
  const monthCum = month.hero.trend[month.hero.trend.length - 1];
  assert.equal(monthCum, 320000);
});

test('points card title follows the active period', () => {
  assert.ok(homeDashboardHtml(model('cycle')).includes('이번 2주 포인트'));
  assert.ok(homeDashboardHtml(model('month')).includes('이번 달 포인트'));
});

test('previously-inert header/pill buttons now carry actions', () => {
  const html = homeDashboardHtml(model('cycle'));
  // 개편: search → 검색 오버레이 스텁(open-search), bell → 검토 탭, 아바타 → 설정 탭
  assert.match(html, /aria-label="검색"[^>]*data-report-action="open-search"/);
  assert.match(html, /aria-label="검토 알림[^"]*"[^>]*data-report-action="switch-tab" data-tab="review"/);
  assert.match(html, /class="hd-avatar-wrap"[^>]*data-report-action="switch-tab" data-tab="settings"/);
  // 포인트 헤더는 hd-more 패턴으로 통일, 첫 버킷 상세를 연다 (오해 유발 셰브론 제거)
  assert.match(html, /hd-points[^]*hd-more[^>]*data-reward-point-action="open" data-reward-point-id="winePurchase"/);
  assert.doesNotMatch(html, /기준액 대비/);
});

test('KPI cards are tappable with per-card destinations', () => {
  const html = homeDashboardHtml(model('cycle'));
  // 수입→거래, 충당금→설정(충당금 섹션), 고정비→목표(finance), 이번 달 예산→설정
  assert.match(html, /button[^>]*class="hd-kpi hd-tone-info"[^>]*data-tab="tx"/);
  assert.match(html, /button[^>]*class="hd-kpi hd-tone-brand"[^>]*data-tab="settings"[^>]*data-scroll-to="settings-funds-section"/);
  assert.match(html, /button[^>]*class="hd-kpi hd-tone-success"[^>]*data-tab="finance"/);
  assert.match(html, /button[^>]*class="hd-kpi hd-tone-warning"[^>]*data-tab="settings"/);
});

test('donut legend rows open the category drill; 기타 stays inert', () => {
  const m = model('cycle');
  const html = homeDashboardHtml(m);
  assert.match(html, /button[^>]*class="hd-legend-row" data-report-action="open-category" data-category-name="[^"]*"/);
  // 기타 (aggregated) must never be a drill button
  assert.doesNotMatch(html, /data-category-name="[^"]*"[^>]*>[^]*?기타[^]*?<\/button>\s*<\/div>\s*<\/div>\s*<\/section>/);
});

test('bell badge shows review count; fake avatar dot removed', () => {
  const withReviews = buildHomeModel({ reviewCount: 7 });
  const html = homeDashboardHtml(withReviews);
  assert.match(html, /hd-badge">7</);
  assert.doesNotMatch(html, /hd-avatar-dot/);
  const none = homeDashboardHtml(buildHomeModel({ reviewCount: 0 }));
  assert.doesNotMatch(none, /hd-badge/);
});

test('goal cards carry open-goal-detail; realloc chip keeps real category id', () => {
  const m = model('cycle');
  const html = homeDashboardHtml(m);
  assert.match(html, /data-report-action="open-goal-detail" data-goal-name="생활유지비"/);
  const living = m.goals.find(g => g.name === '생활유지비');
  assert.ok(Array.isArray(living.children) && living.children.length >= 1);
  assert.equal(living.children[0].label, '생활비용');
});

test('empty states render for points and categories instead of blank shells', () => {
  const empty = buildHomeModel({});
  const html = homeDashboardHtml(empty);
  assert.ok(html.includes('아직 포인트 내역이 없어요'));
  assert.ok(html.includes('이번 기간 지출이 아직 없어요'));
});

test('fund detail modal renders non-empty content (both empty + populated draws)', () => {
  const funds = [{ id: 'f1', name: '돌발비용', emoji: '⚡', monthlyProvision: 50000, startMonthKey: '2026-06', openingBalance: 0, active: true }];
  const drawTxs = { f1: [{ id: 't1', merchant: '과태료', amount: 40000, type: 'card_payment', occurredAt: day(2026, 7, 10) }] };
  const [populated] = buildFundCardModels(funds, drawTxs, [], day(2026, 7, 23));
  const html = fundDetailModalHtml(populated, { draws: populated.recentDraws });
  assert.ok(html.includes('돌발비용'));
  assert.ok(html.includes('과태료'));
  assert.ok(html.includes('인출 내역'));

  // fund with no draws still shows guidance, never a blank body
  const [empty] = buildFundCardModels(funds, {}, [], day(2026, 7, 23));
  const emptyHtml = fundDetailModalHtml(empty, { draws: [] });
  assert.ok(emptyHtml.includes('아직 인출 내역이 없어요'));

  // unknown id → explicit not-found, not blank
  assert.ok(fundDetailModalHtml(undefined).includes('찾을 수 없습니다'));
});

test('reallocation modal renders sources + fallback, never blank', () => {
  const withSources = reallocationModalHtml({
    target: { kind: 'category', id: null, label: '생활비용' },
    suggestedAmount: 30000,
    sources: [
      { key: 'category:취미', kind: 'category', id: null, label: '취미', icon: '🎨', slack: 52000 },
      { key: 'external', kind: 'external', id: null, label: '예산 외 입금', icon: '💼', slack: 0 },
    ],
  });
  assert.ok(withSources.includes('예산 재배분'));
  assert.ok(withSources.includes('취미'));
  assert.ok(withSources.includes('30,000'));

  const noSources = reallocationModalHtml({ target: { kind: 'category', id: null, label: '생활비용' }, suggestedAmount: 0, sources: [] });
  assert.ok(noSources.includes('가져올 수 있는 항목이 없어요'));
});

test('goal detail modal renders child bars + realloc chip for the overspent child', () => {
  const goal = {
    name: '변동비',
    fraction: '18만 / 15만',
    percent: 120,
    children: [
      { id: 'cat-wine', label: '와인/야식', used: 180000, target: 150000, percent: 120, over: 30000 },
      { id: 'cat-cafe', label: '카페', used: 40000, target: 60000, percent: 67, over: -20000 },
    ],
  };
  const html = goalDetailModalHtml(goal);
  // non-empty: group name + child label present
  assert.ok(html.includes('변동비'));
  assert.ok(html.includes('와인/야식'));
  assert.ok(html.includes('카페'));
  // usage bar rendered for the child with a target
  assert.match(html, /hd-m-bar/);
  // overspent child gets a realloc chip carrying its real category id + kind
  assert.match(html, /data-fund-action="open-reallocation" data-target-kind="category" data-target-id="cat-wine"/);
  // the in-budget child must NOT get a realloc chip
  assert.doesNotMatch(html, /data-target-id="cat-cafe"/);

  // null goal → explicit not-found, never blank
  assert.ok(goalDetailModalHtml(null).includes('찾을 수 없습니다'));
});

test('fund detail + reallocation modals surface 이번 기간 결정 only when history exists', () => {
  const funds = [{ id: 'f1', name: '돌발비용', emoji: '⚡', monthlyProvision: 50000, startMonthKey: '2026-06', openingBalance: 0, active: true }];
  const [fund] = buildFundCardModels(funds, {}, [], day(2026, 7, 23));
  const history = [
    { from: { kind: 'category', id: 'c1', label: '취미' }, to: { kind: 'fund', id: 'f1', label: '돌발비용' }, amount: 30000, note: '헬스장 등록' },
  ];

  const withHistory = fundDetailModalHtml(fund, { draws: [], history });
  assert.ok(withHistory.includes('이번 기간 결정'));
  assert.ok(withHistory.includes('취미'));
  assert.ok(withHistory.includes('돌발비용'));

  const noHistory = fundDetailModalHtml(fund, { draws: [], history: [] });
  assert.ok(!noHistory.includes('이번 기간 결정'));

  const reallocWithHistory = reallocationModalHtml({
    target: { kind: 'category', id: null, label: '생활비용' },
    suggestedAmount: 30000,
    sources: [{ key: 'category:취미', kind: 'category', id: null, label: '취미', icon: '🎨', slack: 52000 }],
    history,
  });
  assert.ok(reallocWithHistory.includes('이번 기간 결정'));

  const reallocNoHistory = reallocationModalHtml({
    target: { kind: 'category', id: null, label: '생활비용' },
    suggestedAmount: 30000,
    sources: [{ key: 'category:취미', kind: 'category', id: null, label: '취미', icon: '🎨', slack: 52000 }],
    history: [],
  });
  assert.ok(!reallocNoHistory.includes('이번 기간 결정'));
});

test('reward point modal resolves a home bucket key to non-empty content', () => {
  const snapshot = {
    rewardPointItems: [{ id: 'winePurchase', label: '와인구매 포인트', order: 10 }],
    rewardSummary: { pointBuckets: [{ key: 'winePurchase', label: '와인구매 포인트', monthPoints: -3356 }] },
    rewardPointEntries: [{ id: 'e1', pointItemId: 'winePurchase', pointItemLabel: '와인구매 포인트', amount: 1200, usedAt: day(2026, 7, 12), note: '와인' }],
  };
  // key passed from home points row (buildPoints → p.key === bucket.key)
  const built = buildRewardPointModalModel(snapshot, 'winePurchase', '');
  assert.equal(built.selectedId, 'winePurchase');
  assert.ok(built.selectedBucket);
  const html = rewardPointModalHtml(built);
  assert.ok(html.includes('와인구매'));
  assert.ok(html.includes('사용 이력'));
  assert.ok(html.includes('와인')); // the entry note/label surfaces
  assert.doesNotMatch(html, /포인트 항목이 없습니다/);
});
