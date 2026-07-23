// ================================================================
// render-report.js — 소비 페이스 리포트
// 기준 전환: 이번 2주 조절비 / 이번 달 전체
// ================================================================

import {
  listTransactions, getCategories, aggregateByCategory, listFinanceGoals,
  displayCategoryName, isBudgetExcluded,
  listDevIdeas,
  getAppSettings,
  listRewardPointEntries,
  getProvisionFunds,
  listBudgetAdjustments,
} from './data.js';
import {
  focusRewardLabel,
  formatPointBalance,
} from './features/report/reward-point-modal/state.js';
import {
  currentRhythm,
  effectiveTargetFor,
  isControlCategory,
  paceText,
  progressPercentValue,
  ratio,
  reimbursementTransactions,
  targetFor,
  usedFor,
} from './features/report/budget-summary/state.js';
import { buildSafeToSpendSummary } from './domain/funds/provision.js';
import { fundCardsHtml } from './features/funds/view.js';
import {
  buildFundCardModels,
  filterPeriodAdjustments,
  fundsState,
  localISODate,
  setFundContext,
} from './features/funds/state.js';
import { safeToSpendHero, groupFundDrawTxs, earliestFundStartDate } from './features/funds/home.js';
import { bindFundActions } from './features/funds/controller.js';
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
  bindDailyRewardFocusButtons,
  applyStoredDailyRewardSelection,
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
  bindReportController(root, { renderReport, refreshRewardWidgetSnapshot, applyDailyRewardFocus: selection => applyDailyRewardFocus(root, selection) });
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
  const rewardSettings = applyStoredDailyRewardSelection(appSettings.rewardSavings || {});

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

  const [monthTxs, cycleTxs, rewardTxs, financeGoals, devIdeas, rewardPointEntries, budgetAdjustments, fundDrawTxs] = await Promise.all([
    listTransactions({ from: monthStart, to: monthEnd, max: 1000 }),
    listTransactions({ from: cycleStart, to: cycleEnd, max: 1000 }),
    homeMode ? listTransactions({ from: rewardLookbackStart, to: new Date(), max: 3000 }).catch(() => []) : Promise.resolve([]),
    listFinanceGoals({ max: 10 }).catch(() => []),
    homeMode ? listDevIdeas({ max: 20 }).catch(() => []) : Promise.resolve([]),
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

  reportBody.innerHTML = `
    ${homeMode
      ? safeToSpendHero(safeToSpend, { mode, monthKey, modeControlHtml: reportModeControlHtml(mode, true) })
      : `
    <section class="hero report-hero-card ${mode === 'month' ? 'monthly' : ''}">
      ${reportModeControlHtml(mode, homeMode)}

      <div class="report-hero-head">
        <div>
          <div class="label">${heroTitleLabel(mode, monthKey, homeMode)}</div>
          <div class="report-hero-period">${heroPeriodLabel(mode, monthKey, cycleRange)}</div>
          <div class="amount">${fmtKRW(currentUsed).replace('원', '')}<span class="unit">원</span></div>
          <div class="sub">
            <span>수입 <b>+${fmtKRW(currentIncome).replace('원', '')}</b></span>
            <span>정산 <b>+${fmtKRW(currentSettlement).replace('원', '')}</b></span>
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
      ${mode === 'month'
        ? heroSecondaryProgress('고정비 제외 조절비', controlMonthUsed, controlMonthTarget)
        : ''}
    </section>
    `}

    ${homeMode ? '' : financeDirectionCard(goalImpact)}

    ${homeMode ? `
      ${fundCardsHtml(fundCardModels, { expanded: fundsState.expanded })}
      ${rewardSavingsCard(rewardSummary)}
      ${reviewNudgeCard(reviewCount)}
      <section class="home-responsive-section home-variable-section">
        <div class="section-title home-section-title"><h3>${mode === 'cycle' ? '이번 2주 변동비' : '이번 달 변동비'}</h3><button type="button" class="more" data-report-action="switch-tab" data-tab="report">전체 ›</button></div>
        <div class="budget-gauge-panel home-variable-panel">
          ${budgetGaugeGroups(homeVariableCategories, byCat, monthKey, mode, { showIcon: false, adjustments: periodAdjustments })}
        </div>
      </section>
    ` : `
      <div class="section-title"><h3>${mode === 'cycle' ? '균형 카테고리' : '월 MAX 게이지'}</h3><button type="button" class="more" data-report-action="switch-tab" data-tab="settings">관리 ›</button></div>
      <div class="budget-gauge-panel">
        ${budgetGaugeGroups(gaugeCategories, byCat, monthKey, mode, { homeMode, adjustments: periodAdjustments })}
        ${reimbursementGaugeGroup(reimbursement, mode)}
      </div>
    `}

    <div class="section-title"><h3>이번 달 고정비</h3></div>
    <div class="fixed-cost-panel">
      <div class="fixed-cost-summary">
        <strong>${fmtKRW(fixedUsed)}</strong>
        <span>${fmtKRW(fixedTarget)} 예정</span>
      </div>
      ${fixedCategories.map(cat => fixedCostRow(cat, byCatMonth, monthKey)).join('')}
    </div>
    ${homeMode ? devIdeasCard(devIdeas) : ''}
  `;
  bindDailyRewardFocusButtons(reportBody);
  if (homeMode) {
    bindFundActions();
    publishRewardWidgetSnapshot(rewardSummary);
  }
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

function rewardSavingsCard(summary) {
  if (!summary) return '';
  const baselineReady = !!summary.baselineReady;
  const todayAmount = baselineReady && summary.todaySaved > 0
    ? `+${fmtKRW(summary.todaySaved).replace('원', '')}<span class="unit">원</span>`
    : '적립 없음';
  const pointBuckets = Array.isArray(summary.pointBuckets) ? summary.pointBuckets : [];
  const dailyPointBuckets = pointBuckets.filter(bucket => !bucket.historyOnly);
  return `
    <section class="home-reward-card" aria-label="오늘의 적립">
      <div class="home-reward-head">
        <span>오늘의 적립</span>
        <strong>${todayAmount}</strong>
      </div>
      <div class="home-reward-metrics">
        <div>
          <span>오늘</span>
          <strong>${baselineReady ? fmtKRW(summary.todaySpend).replace('원', '') : '-'}</strong>
        </div>
        <div>
          <span>평소</span>
          <strong>${baselineReady ? fmtKRW(summary.dailyBaseline).replace('원', '') : '-'}</strong>
        </div>
      </div>
      ${rewardDailyCard(summary, dailyPointBuckets, baselineReady)}
      <div class="home-reward-points">
        <div class="home-reward-point-head">
          <span>포인트</span>
          <strong>기준액 대비</strong>
        </div>
        <div class="home-reward-point-list">
          ${pointBuckets.map(bucket => rewardPointBucketRow(bucket, baselineReady)).join('')}
        </div>
      </div>
    </section>
  `;
}

function rewardDailyCard(summary, pointBuckets, baselineReady) {
  const dailyReward = summary.dailyReward || {};
  if (dailyReward.status === 'disabled') return '';
  const bonusRate = formatRewardRatePct(dailyReward.bonusRate || 0);
  const selected = dailyReward.status === 'selected';
  if (selected) {
    const bonusPoints = Math.max(0, Math.round(Number(summary.ruleBonusPoints || dailyReward.ruleBonusPoints) || 0));
    return `
      <div class="home-reward-daily selected">
        <div class="home-reward-daily-main">
          <span>오늘 카드</span>
          <strong>${escHtml(dailyReward.label || '집중 카드')}</strong>
          <small>${bonusPoints ? `추가 +${fmtKRW(bonusPoints).replace('원', '')}P` : '결과를 기다리는 중'}</small>
        </div>
        <div class="home-reward-daily-chips">
          <span>${escHtml(dailyReward.streakText || '연속 적립 시작')}</span>
          <span>${escHtml(dailyReward.freezeText || '쉬어가기권 0장')}</span>
          <span>${escHtml(dailyReward.tierLabel || '브론즈 1단계')}</span>
        </div>
      </div>
    `;
  }
  const helperText = baselineReady
    ? `하나만 고르면 그 포인트에 오늘 절약분 +${bonusRate}%를 더해요.`
    : '최근 소비 기준선이 준비되면 오늘 카드를 고를 수 있어요.';
  return `
    <div class="home-reward-daily">
      <div class="home-reward-daily-main">
        <span>오늘 카드</span>
        <strong>${dailyReward.status === 'waiting' ? '기준선 준비 중' : '어디에 더 가까워질까요?'}</strong>
        <small>${helperText}</small>
      </div>
      <div class="home-reward-daily-options">
        ${pointBuckets.map(bucket => `
          <button class="home-reward-daily-option" type="button" data-reward-daily-focus="${escHtml(bucket.key)}">
            <span>${escHtml(focusRewardLabel(bucket.label))}</span>
            <strong>+${bonusRate}%</strong>
          </button>
        `).join('')}
      </div>
      <div class="home-reward-daily-chips">
        <span>${escHtml(dailyReward.streakText || '연속 적립 시작')}</span>
        <span>${escHtml(dailyReward.freezeText || '쉬어가기권 1장')}</span>
      </div>
    </div>
  `;
}

function rewardPointBucketRow(bucket, baselineReady) {
  const targetAmount = Math.max(0, Math.round(Number(bucket.targetAmount) || 0));
  const targetText = targetAmount ? fmtKRW(targetAmount).replace('원', '') : '기준액 없음';
  const progressFill = baselineReady && targetAmount ? progressPercentValue(bucket.monthPoints, targetAmount) : 0;
  const progressPct = baselineReady && targetAmount
    ? `${Math.min(999, Math.round((Math.max(0, Number(bucket.monthPoints) || 0) / targetAmount) * 100))}%`
    : '-';
  const spentMonthPoints = Math.max(0, Math.round(Number(bucket.spentMonthPoints) || 0));
  const earnedMonthPoints = Math.max(0, Math.round(Number(bucket.earnedMonthPoints) || 0));
  const isOverdrawn = baselineReady && Number(bucket.monthPoints) < 0;
  const balanceText = formatPointBalance(bucket.monthPoints);
  const displayValue = isOverdrawn ? formatPointBalance(bucket.monthPoints) : progressPct;
  const rowClasses = [
    'home-reward-point-row',
    'home-widget-row',
    bucket.todayBonusPoints ? 'bonus' : '',
    isOverdrawn ? 'overdrawn' : '',
  ].filter(Boolean).join(' ');
  const pointMeta = baselineReady
    ? [
        `적립 +${fmtKRW(earnedMonthPoints).replace('원', '')}P`,
        spentMonthPoints ? `사용 -${fmtKRW(spentMonthPoints).replace('원', '')}P` : '',
        `잔액 ${balanceText}`,
      ].filter(Boolean).join(' · ')
    : '최근 6개월 변동비가 쌓이면 계산됩니다';
  const paceMeta = baselineReady
    ? [
        `오늘 +${fmtKRW(bucket.todayPoints).replace('원', '')}`,
        bucket.todayBonusPoints ? `오늘 카드 +${fmtKRW(bucket.todayBonusPoints).replace('원', '')}` : '',
        `월 예상 ${fmtKRW(bucket.projectedMonthPoints).replace('원', '')}`,
        `${progressPct}`,
        `${formatRewardRatePct(bucket.rate)}%`,
      ].filter(Boolean).join(' · ')
    : `${targetText}`;
  const rowLabel = focusRewardLabel(bucket.label);
  return `
    <button class="${rowClasses}" type="button" data-reward-point-action="open" data-reward-point-id="${escHtml(bucket.key)}" aria-label="${escHtml(rowLabel)} 포인트 사용 및 이력 관리">
      <div class="home-widget-row-shell ${progressFill > 0 ? 'has-progress' : ''}" aria-label="${escHtml(rowLabel)} ${escHtml(displayValue)}">
        <span class="home-reward-point-progress home-widget-fill" style="--fill-pct:${progressFill.toFixed(2)}%"></span>
        <span class="home-widget-mark" aria-hidden="true">${escHtml(rewardPointMark(bucket))}</span>
        <span class="home-widget-name">${escHtml(rowLabel)}</span>
        <strong class="home-widget-value">${escHtml(displayValue)}</strong>
      </div>
      <div class="home-widget-row-meta home-reward-point-meta">
        <span>${escHtml(pointMeta)}</span>
        <span>${escHtml(paceMeta)}</span>
      </div>
    </button>
  `;
}

function rewardPointMark(bucket) {
  const key = String(bucket?.key || '');
  if (key === 'winePurchase') return '와';
  if (key === 'premiumIngredients') return '재';
  if (key === 'travelFund') return '여';
  return Array.from(focusRewardLabel(bucket?.label))[0] || 'P';
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

function publishRewardWidgetSnapshot(summary, bridge = rewardWidgetBridge()) {
  if (!summary || !bridge || typeof bridge.updateRewardWidgetSnapshot !== 'function') return false;
  try {
    return bridge.updateRewardWidgetSnapshot(JSON.stringify(buildRewardWidgetSnapshot(summary))) !== false;
  } catch (err) {
    console.warn('Reward widget snapshot update failed', err);
    return false;
  }
}

function applyDailyRewardFocus(root, selection) {
  const summary = STATE.rewardSummary;
  if (!summary || !selection?.focusBucketKey) return;
  const dailyReward = summary.dailyReward || {};
  const bonusRate = Math.max(0, Number(dailyReward.bonusRate) || 0);
  const bonusCap = Math.max(0, Math.round(Number(dailyReward.bonusCap) || 0));
  const ruleBonusPoints = Math.min(Math.round(Math.max(0, Number(summary.todaySaved) || 0) * bonusRate), bonusCap);
  let focusLabel = '';
  const pointBuckets = (summary.pointBuckets || []).map(bucket => {
    if (bucket.key !== selection.focusBucketKey) return bucket;
    focusLabel = focusRewardLabel(bucket.label);
    const previousBonus = Math.max(0, Math.round(Number(bucket.todayBonusPoints) || 0));
    const todayBasePoints = Math.max(0, Math.round(Number(bucket.todayBasePoints ?? (Number(bucket.todayPoints) || 0) - previousBonus) || 0));
    return {
      ...bucket,
      todayBasePoints,
      todayBonusPoints: ruleBonusPoints,
      todayPoints: todayBasePoints + ruleBonusPoints,
      earnedMonthPoints: Math.max(0, Math.round(Number(bucket.earnedMonthPoints) || 0) - previousBonus) + ruleBonusPoints,
      monthPoints: Math.round(Number(bucket.monthPoints) || 0) - previousBonus + ruleBonusPoints,
      projectedMonthPoints: Math.max(0, Math.round(Number(bucket.projectedMonthPoints) || 0) - previousBonus) + ruleBonusPoints,
    };
  });
  if (!focusLabel) return;
  const selectedSummary = {
    ...summary,
    pointBuckets,
    ruleBonusPoints,
    dailyReward: {
      ...dailyReward,
      ...selection,
      status: 'selected',
      label: `${focusLabel} 집중`,
      ruleBonusPoints,
      bonusText: ruleBonusPoints ? `오늘 카드 +${ruleBonusPoints}P` : '오늘 카드 대기',
    },
  };
  STATE.rewardSummary = selectedSummary;
  const card = root.querySelector('.home-reward-card');
  if (!card) return;
  card.outerHTML = rewardSavingsCard(selectedSummary);
  publishRewardWidgetSnapshot(selectedSummary);
}

function formatRewardRatePct(value) {
  const pct = Math.max(0, Math.min(100, Number(value) * 100));
  if (!Number.isFinite(pct)) return '0';
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
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

function devIdeasCard(ideas) {
  const pendingCount = ideas.filter(idea => devIdeaStatus(idea) === 'pending').length;
  const runningCount = ideas.filter(idea => devIdeaStatus(idea) === 'running').length;
  const headText = runningCount
    ? `${runningCount}개 진행중 · ${pendingCount}개 진행전`
    : `${pendingCount}개 진행전`;
  return `
    <section class="dev-idea-card">
      <div class="dev-idea-head">
        <div>
          <div class="eyebrow">Dev Ideas</div>
          <h3>개발 아이디어</h3>
        </div>
        <span>${headText}</span>
      </div>
      <form id="dev-idea-form" class="dev-idea-form" data-dev-idea-form>
        <input class="tds-input" name="title" placeholder="홈 하단에 붙여둘 아이디어" autocomplete="off" required>
        <button class="tds-btn tonal" type="submit">추가</button>
      </form>
      <div class="dev-idea-list">
        ${ideas.length ? ideas.slice(0, 4).map(devIdeaRow).join('') : '<div class="dev-idea-empty">생각난 기능을 한 줄로 저장해요.</div>'}
      </div>
    </section>
  `;
}

function devIdeaRow(idea) {
  const status = devIdeaStatus(idea);
  const done = status === 'done';
  return `
    <label class="dev-idea-row ${done ? 'done' : ''} status-${status}">
      <input type="checkbox" aria-label="완료 표시" data-dev-idea-toggle data-idea-id="${escHtml(idea.id)}" ${done ? 'checked' : ''}>
      <span class="dev-idea-title">${escHtml(idea.title || '제목 없음')}</span>
      <span class="dev-idea-status">${devIdeaStatusLabel(status)}</span>
      <button type="button" title="삭제" data-report-action="delete-dev-idea" data-idea-id="${escHtml(idea.id)}">×</button>
    </label>
  `;
}

function devIdeaStatus(idea) {
  const status = String(idea?.status || '').trim();
  if (['pending', 'running', 'done', 'failed'].includes(status)) return status;
  return idea?.done ? 'done' : 'pending';
}

function devIdeaStatusLabel(status) {
  return ({
    pending: '진행전',
    running: '진행중',
    done: '완료',
    failed: '오류',
  })[status] || '진행전';
}
