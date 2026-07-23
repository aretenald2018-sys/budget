// ================================================================
// render-report.js — 소비 페이스 리포트
// 기준 전환: 이번 2주 조절비 / 이번 달 전체
// ================================================================

import {
  listTransactions, getCategories, aggregateByCategory, listFinanceGoals,
  displayCategoryName, isBudgetExcluded,
  getAppSettings,
  listRewardPointEntries,
  getProvisionFunds,
  listBudgetAdjustments,
} from './data.js';
import {
  currentRhythm,
  effectiveTargetFor,
  isControlCategory,
  paceText,
  ratio,
  reimbursementTransactions,
  targetFor,
  usedFor,
} from './features/report/budget-summary/state.js';
import { buildSafeToSpendSummary } from './domain/funds/provision.js';
import {
  buildFundCardModels,
  filterPeriodAdjustments,
  fundsState,
  localISODate,
  setFundContext,
} from './features/funds/state.js';
import { groupFundDrawTxs, earliestFundStartDate, widgetExtraFrom } from './features/funds/home.js';
import { bindFundActions } from './features/funds/controller.js';
import { homeDashboardHtml } from './features/home/dashboard.js';
import { buildHomeModel } from './features/home/model.js';
import { getCurrentUser } from './data.js';
import {
  budgetGaugeGroups,
  fixedCostRow,
  heroSecondaryProgress,
  reimbursementGaugeGroup,
} from './features/report/budget-summary/view.js';
import { fmtKRW, fmtMonthKey, monthRange } from './utils/format.js';
import {
  cycleRangeForDate,
} from './utils/cycles.js';
import { buildGoalImpact, formatManwonFromKRW } from './utils/finance-goals.js';
import { buildRewardSavingsSummary, buildRewardWidgetSnapshot } from './utils/reward-savings.js';
import { $, escHtml } from './utils/dom.js';
import { reportState as STATE } from './features/report/state.js';
import {
  bindReportController,
  localAppSettingsFallback,
  resolveBiweeklyStartDate,
  syncLocalBiweeklyStartDate,
  reportModeControlHtml,
  heroPeriodLabel,
  heroTitleLabel,
  elapsedMonthDayLabel,
} from './features/report/controller.js';



export async function renderReport(options = {}) {
  const rootSelector = options.rootSelector || STATE.rootSelector || '#tab-report';
  const homeMode = !!options.homeMode;
  STATE.rootSelector = rootSelector;
  STATE.homeMode = homeMode;
  const root = $(rootSelector);
  if (!root) return;
  bindReportController(root, { renderReport, refreshRewardWidgetSnapshot });
  root.dataset.reportRootSelector = rootSelector;
  root.dataset.reportHomeMode = homeMode ? 'true' : 'false';
  root.innerHTML = '<div class="report-body" data-report-body><div class="empty-state"><div class="loading-spinner"></div></div></div>';

  const appSettings = await getAppSettings().catch(() => localAppSettingsFallback());
  syncLocalBiweeklyStartDate(appSettings.biweeklyStartDate);
  const monthKey = homeMode ? fmtMonthKey(new Date()) : STATE.monthKey;
  const { start: monthStart, end: monthEnd } = monthRange(monthKey);
  const biweeklyStartDate = resolveBiweeklyStartDate(appSettings);
  const cycleRange = cycleRangeForDate(new Date(), biweeklyStartDate);
  const { start: cycleStart, end: cycleEnd } = cycleRange;
  STATE.biweeklyStartDate = biweeklyStartDate;
  STATE.cycleRange = cycleRange;
  const rewardSettings = appSettings.rewardSavings || {};

  root.innerHTML = `
    ${homeMode ? '' : `
      <div class="report-month-nav">
        <button class="tds-icon-btn md" type="button" data-report-action="shift-month" data-month-delta="-1">‹</button>
        <div class="t6">${monthKey}</div>
        <button class="tds-icon-btn md" type="button" data-report-action="shift-month" data-month-delta="1">›</button>
      </div>
    `}
    <div class="report-body" data-report-body><div class="empty-state"><div class="loading-spinner"></div></div></div>
  `;

  const rewardLookbackStart = rewardLookbackStartDate(rewardSettings);
  const provisionFunds = getProvisionFunds();
  const fundDrawFrom = provisionFunds.length ? earliestFundStartDate(provisionFunds) : new Date();

  const [monthTxs, cycleTxs, rewardTxs, financeGoals, rewardPointEntries, budgetAdjustments, fundDrawTxs] = await Promise.all([
    listTransactions({ from: monthStart, to: monthEnd, max: 1000 }),
    listTransactions({ from: cycleStart, to: cycleEnd, max: 1000 }),
    homeMode ? listTransactions({ from: rewardLookbackStart, to: new Date(), max: 3000 }).catch(() => []) : Promise.resolve([]),
    listFinanceGoals({ max: 10 }).catch(() => []),
    homeMode ? listRewardPointEntries({ max: 300 }).catch(() => []) : Promise.resolve([]),
    listBudgetAdjustments({ monthKey, max: 400 }).catch(() => []),
    (homeMode && provisionFunds.length) ? listTransactions({ from: fundDrawFrom, to: new Date(), max: 3000 }).catch(() => []) : Promise.resolve([]),
  ]);
  STATE.monthTxs = monthTxs;
  STATE.cycleTxs = cycleTxs;

  const categories = getCategories();
  STATE.categories = categories;
  const budgetCategories = categories
    .filter(c => c.kind === 'expense')
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
  const controlCategories = budgetCategories.filter(isControlCategory);
  const fixedCategories = budgetCategories.filter(cat => currentRhythm(cat) === 'fixed');

  const byCatMonth = aggregateByCategory(monthTxs);
  const byCatCycle = aggregateByCategory(cycleTxs);
  const mode = STATE.viewMode;
  const gaugeCategories = mode === 'cycle' ? controlCategories : budgetCategories;
  const heroCategories = homeMode ? controlCategories : gaugeCategories;
  const byCat = mode === 'cycle' ? byCatCycle : byCatMonth;

  const currentUsed = heroCategories.reduce((sum, cat) => sum + usedFor(cat, byCat), 0);
  const currentTarget = heroCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, mode), 0);
  const currentIncome = incomeFor(mode === 'cycle' ? cycleTxs : monthTxs);
  const currentSettlement = settlementFor(mode === 'cycle' ? cycleTxs : monthTxs);
  const fixedUsed = fixedCategories.reduce((sum, cat) => sum + usedFor(cat, byCatMonth), 0);
  const fixedTarget = fixedCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, 'month'), 0);
  const controlMonthUsed = controlCategories.reduce((sum, cat) => sum + usedFor(cat, byCatMonth), 0);
  const controlMonthTarget = controlCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, 'month'), 0);
  const reimbursement = reimbursementSummary(mode === 'cycle' ? cycleTxs : monthTxs);
  const reviewCount = (mode === 'cycle' ? cycleTxs : monthTxs).filter(tx => tx.needsReview).length;
  document.dispatchEvent(new CustomEvent('budget:review-count', { detail: { count: reviewCount } }));
  const monthUsedAll = budgetCategories.reduce((sum, cat) => sum + usedFor(cat, byCatMonth), 0);
  const monthTargetAll = budgetCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, 'month'), 0);
  const goalImpact = buildGoalImpact(financeGoals.find(goal => goal.active !== false) || financeGoals[0] || null, {
    monthUsed: monthUsedAll,
    monthTarget: monthTargetAll,
  });
  const homeVariableCategories = homeMode ? controlCategories : [];

  // ── 지금 써도 되는 돈(Safe-to-Spend) + 충당금 컨텍스트 ──
  const cycleStartISO = localISODate(cycleRange.start);
  const periodAdjustments = filterPeriodAdjustments(budgetAdjustments, { mode, monthKey, cycleStartDate: cycleStartISO });
  const stsBudgetBase = controlCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, mode), 0);
  const stsSpent = controlCategories.reduce((sum, cat) => sum + usedFor(cat, byCat), 0);
  const safeToSpend = buildSafeToSpendSummary({
    budgetTotal: stsBudgetBase,
    spentTotal: stsSpent,
    funds: provisionFunds,
    adjustments: periodAdjustments,
    mode,
    monthKey,
    cycleRange,
    controlCategoryNames: controlCategories.map(cat => cat.name),
    now: new Date(),
  });
  const drawTxsByFund = groupFundDrawTxs(fundDrawTxs);
  const fundCardModels = homeMode ? buildFundCardModels(provisionFunds, drawTxsByFund, budgetAdjustments, new Date()) : [];
  if (homeMode) {
    setFundContext({
      funds: provisionFunds,
      drawTxsByFund,
      adjustments: budgetAdjustments,
      periodAdjustments,
      categories: controlCategories,
      byCategory: byCat,
      monthKey,
      mode,
      cycleStartDate: cycleStartISO,
      expanded: fundsState.expanded,
    });
  }

  const rewardSummary = homeMode ? buildRewardSavingsSummary({
    transactions: rewardTxs.filter(tx => !isBudgetExcluded(tx)),
    pointEntries: rewardPointEntries,
    categoryNames: controlCategories.map(cat => cat.name),
    getCategoryName: displayCategoryName,
    now: new Date(),
    ...rewardSettings,
  }) : null;
  STATE.rewardPointEntries = rewardPointEntries;
  STATE.rewardPointItems = rewardSummary?.pointItems || [];
  STATE.rewardSummary = rewardSummary;
  const reportBody = root.querySelector('[data-report-body]');
  if (!reportBody) return;

  if (homeMode) {
    reportBody.innerHTML = homeDashboardHtml(buildHomeModel({
      user: getCurrentUser() || {},
      cycleRange, mode, monthKey,
      controlCategories, budgetCategories, byCat, byCatMonth,
      cycleTxs, monthTxs, periodAdjustments,
      rewardSummary, monthTargetAll,
      safeToSpend, fundModels: fundCardModels, heroLens: STATE.heroLens,
    }));
    bindFundActions();
    widgetExtraState = widgetExtraFrom(safeToSpend, fundCardModels, { mode, monthKey });
    publishRewardWidgetSnapshot(rewardSummary);
    return;
  }

  reportBody.innerHTML = `
    <section class="hero report-hero-card ${mode === 'month' ? 'monthly' : ''}">
      ${reportModeControlHtml(mode, homeMode)}
      <div class="report-hero-head">
        <div>
          <div class="label">${heroTitleLabel(mode, monthKey, homeMode)}</div>
          <div class="report-hero-period">${heroPeriodLabel(mode, monthKey, cycleRange)}</div>
          <div class="amount">${fmtKRW(currentUsed).replace('원', '')}<span class="unit">원</span></div>
          <div class="sub">
            <span>수입 <b>+${fmtKRW(currentIncome).replace('원', '')}</b></span>
            <button type="button" class="report-hero-settle-link" data-report-action="switch-tab" data-tab="settle">정산 <b>+${fmtKRW(currentSettlement).replace('원', '')}</b> ›</button>
          </div>
          <div class="pace ${currentTarget && currentUsed > currentTarget ? 'warn' : ''}">● ${paceText(currentUsed, currentTarget)}</div>
        </div>
      </div>
      <div class="report-hero-progress">
        <div class="tds-progress"><div class="tds-progress-fill ${currentUsed > currentTarget && currentTarget ? 'warning' : ''}" style="transform:scaleX(${ratio(currentUsed, currentTarget)})"></div></div>
        <div class="report-hero-meta">
          <span>${fmtKRW(currentTarget)} 기준</span>
          <span>${currentTarget ? `${Math.min(999, Math.round((currentUsed / currentTarget) * 100))}% 사용` : '목표 미설정'}</span>
        </div>
      </div>
      ${mode === 'month' ? heroSecondaryProgress('고정비 제외 조절비', controlMonthUsed, controlMonthTarget) : ''}
    </section>

    ${reviewNudgeCard(reviewCount)}

    ${financeDirectionCard(goalImpact)}

    <div class="section-title"><h3>${mode === 'cycle' ? '균형 카테고리' : '월 MAX 게이지'}</h3><button type="button" class="more" data-report-action="switch-tab" data-tab="settings">관리 ›</button></div>
    <div class="budget-gauge-panel">
      ${budgetGaugeGroups(gaugeCategories, byCat, monthKey, mode, { homeMode, adjustments: periodAdjustments })}
      ${reimbursementGaugeGroup(reimbursement, mode)}
    </div>

    <div class="section-title"><h3>이번 달 고정비</h3></div>
    <div class="fixed-cost-panel">
      <div class="fixed-cost-summary">
        <strong>${fmtKRW(fixedUsed)}</strong>
        <span>${fmtKRW(fixedTarget)} 예정</span>
      </div>
      ${fixedCategories.map(cat => fixedCostRow(cat, byCatMonth, monthKey)).join('')}
    </div>
  `;
}

export async function refreshRewardWidgetSnapshot() {
  const bridge = rewardWidgetBridge();
  if (!bridge) return false;
  try {
    const appSettings = await getAppSettings().catch(() => localAppSettingsFallback());
    const rewardSettings = appSettings.rewardSavings || {};
    const rewardLookbackStart = rewardLookbackStartDate(rewardSettings);
    const now = new Date();
    const { start: pointUsageStart, end: pointUsageEnd } = monthRange(fmtMonthKey(now));
    const [rewardTxs, rewardPointEntries] = await Promise.all([
      listTransactions({ from: rewardLookbackStart, to: new Date(), max: 3000 }).catch(() => []),
      listRewardPointEntries({ from: pointUsageStart, to: pointUsageEnd, max: 300 }).catch(() => []),
    ]);
    const controlCategories = getCategories()
      .filter(cat => cat.kind === 'expense')
      .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99))
      .filter(isControlCategory);
    const rewardSummary = buildRewardSavingsSummary({
      transactions: rewardTxs.filter(tx => !isBudgetExcluded(tx)),
      pointEntries: rewardPointEntries,
      categoryNames: controlCategories.map(cat => cat.name),
      getCategoryName: displayCategoryName,
      now,
      ...rewardSettings,
    });
    return publishRewardWidgetSnapshot(rewardSummary, bridge);
  } catch (err) {
    console.warn('Reward widget snapshot refresh failed', err);
    return false;
  }
}

function reviewNudgeCard(count) {
  if (!count) return '';
  return `
    <button type="button" class="insight review review-nudge-card" data-report-action="switch-tab" data-tab="review">
      <span class="tag">검토 대기</span>
      <div class="head">자동 분류 확인이 필요한 거래 ${count}건이 있어요</div>
      <div class="body">카테고리만 정해주면 홈 게이지와 월간 리포트가 바로 정돈됩니다.</div>
    </button>
  `;
}

function rewardLookbackStartDate(rewardSettings = {}) {
  const rewardLookbackDays = Math.max(30, Math.round(Number(rewardSettings.lookbackDays) || 180));
  const rewardLookbackStart = new Date();
  rewardLookbackStart.setDate(rewardLookbackStart.getDate() - rewardLookbackDays - 10);
  rewardLookbackStart.setHours(0, 0, 0, 0);
  return rewardLookbackStart;
}

function rewardWidgetBridge() {
  const bridge = window.BudgetAndroid;
  return bridge && typeof bridge.updateRewardWidgetSnapshot === 'function' ? bridge : null;
}

// 마지막으로 계산한 STS·충당금 스냅샷(종합 위젯 v3용). 홈 렌더에서 갱신되며,
// 보상 설정 저장/데일리 포커스 등 홈 밖 갱신에서도 재사용해 위젯 일관성 유지.
let widgetExtraState = { safeToSpend: null, funds: [] };

function publishRewardWidgetSnapshot(summary, bridge = rewardWidgetBridge()) {
  if (!summary || !bridge || typeof bridge.updateRewardWidgetSnapshot !== 'function') return false;
  try {
    // 종합 위젯: 스키마 v2를 유지한 채 STS·충당금을 추가 필드로 실어 전방 호환.
    summary.safeToSpend = widgetExtraState.safeToSpend;
    summary.funds = widgetExtraState.funds;
    return bridge.updateRewardWidgetSnapshot(JSON.stringify(buildRewardWidgetSnapshot(summary))) !== false;
  } catch (err) {
    console.warn('Reward widget snapshot update failed', err);
    return false;
  }
}

function financeDirectionCard(impact) {
  if (!impact) {
    return `
      <button type="button" class="finance-direction-card empty" data-report-action="switch-tab" data-tab="finance">
          <span class="mark">◇</span>
          <span class="body">
            <span class="label">장기 방향</span>
          <span class="h">목표 탭에서 목표 시나리오를 정해주세요</span>
          <span class="sub">저축 시나리오 하나를 기준으로 삼으면 소비 흐름과 함께 볼 수 있어요.</span>
          </span>
        <span class="arrow">›</span>
      </button>
    `;
  }
  const directionText = impact.directionDelta >= 0
    ? `목표선에 ${formatManwonFromKRW(impact.directionDelta)} 가까워지는 흐름`
    : `목표선에서 ${formatManwonFromKRW(Math.abs(impact.directionDelta))} 멀어지는 흐름`;
  const budgetText = impact.budgetDelta >= 0
    ? `예산 대비 ${fmtKRW(impact.budgetDelta)} 여유`
    : `예산 대비 ${fmtKRW(Math.abs(impact.budgetDelta))} 초과`;
  return `
    <button type="button" class="finance-direction-card" data-report-action="switch-tab" data-tab="finance">
      <span class="mark">◇</span>
      <span class="body">
        <span class="label">장기 방향 · ${escHtml(impact.goal.name || '목표')}</span>
        <span class="h">${directionText}</span>
        <span class="sub">${budgetText}</span>
      </span>
      <span class="meter"><span style="transform:scaleX(${impact.progress})"></span></span>
    </button>
  `;
}

function reimbursementSummary(txs) {
  const rows = reimbursementTransactions(txs);
  return {
    amount: rows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
    count: rows.length,
  };
}

function incomeFor(txs) {
  return txs
    .filter(tx => tx.type === 'transfer_in' || tx.type === 'settlement_in')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

function settlementFor(txs) {
  return txs
    .filter(tx => tx.type === 'settlement_in')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

