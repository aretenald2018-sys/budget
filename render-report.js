// ================================================================
// render-report.js — 소비 페이스 리포트
// 기준 전환: 이번 2주 조절비 / 이번 달 전체
// ================================================================

import {
  listTransactions, getCategories, aggregateByCategory, listMindbankEntries, listFinanceGoals, updateTransaction,
  displayCategoryName, isBudgetExcluded, isReimbursementExpected, REIMBURSEMENT_CATEGORY_NAME,
  listDevIdeas, saveDevIdea, updateDevIdea, deleteDevIdea,
  getAppSettings, saveAppSettings,
  listRewardPointEntries,
} from './data.js?v=20260712-domain-rules';
import { createRewardPointModalController } from './features/report/reward-point-modal/controller.js?v=20260712-report-features';
import {
  focusRewardLabel,
  formatPointBalance,
} from './features/report/reward-point-modal/state.js?v=20260712-report-features';
import { createSubcategoryClassifierController } from './features/report/subcategory-classifier/controller.js?v=20260712-report-features';
import {
  isUnassignedSubcategory,
  UNASSIGNED_SUBCATEGORY_LABEL,
} from './features/report/subcategory-classifier/state.js?v=20260712-report-features';
import {
  currentRhythm,
  expenseTransactions,
  isControlCategory,
  paceText,
  progressPercentValue,
  ratio,
  reimbursementTransactions,
  targetFor,
  usedFor,
} from './features/report/budget-summary/state.js?v=20260712-report-features';
import {
  budgetGaugeGroups,
  fixedCostRow,
  heroSecondaryProgress,
  reimbursementGaugeGroup,
} from './features/report/budget-summary/view.js?v=20260712-report-features';
import { fmtKRW, fmtKRWShort, fmtMonthKey, monthRange, fmtDateTime } from './utils/format.js';
import {
  cycleDateRangeText,
  cycleLabelForRange,
  cycleRangeForDate,
  normalizeCycleAnchorDate,
} from './utils/cycles.js?v=20260601-biweekly-start';
import { summarizeMindbank } from './utils/mindbank.js';
import { buildGoalImpact, formatManwonFromKRW } from './utils/finance-goals.js';
import { buildRewardSavingsSummary, buildRewardWidgetSnapshot } from './utils/reward-savings.js?v=20260712-report-features';
import { $, escHtml } from './utils/dom.js';
import { showToast } from './utils/toast.js';

const BIWEEKLY_START_KEY = 'budget.biweeklyStartDate';

const STATE = {
  monthKey: fmtMonthKey(new Date()),
  viewMode: 'cycle',
  monthTxs: [],
  cycleTxs: [],
  categories: [],
  rootSelector: '#tab-report',
  homeMode: false,
  activeDrill: null,
  biweeklyStartDate: '',
  cycleRange: null,
  rewardPointEntries: [],
  rewardPointItems: [],
  rewardSummary: null,
};

const rewardPointModalController = createRewardPointModalController({
  getSnapshot: () => ({
    rewardPointEntries: STATE.rewardPointEntries,
    rewardPointItems: STATE.rewardPointItems,
    rewardSummary: STATE.rewardSummary,
  }),
  refresh: async () => {
    await refreshRewardWidgetSnapshot();
    await renderReport({ rootSelector: STATE.rootSelector, homeMode: true });
  },
});

const subcategoryClassifierController = createSubcategoryClassifierController({
  getContext: () => ({
    drill: STATE.activeDrill,
    categories: STATE.categories,
    transactions: STATE.activeDrill
      ? txsForCategory(STATE.activeDrill.categoryName, STATE.activeDrill.mode)
      : [],
  }),
  patchTransactions: (txIds, patch) => txIds.forEach(txId => patchLocalTx(txId, patch)),
  updateCategories: categories => { STATE.categories = categories; },
  refreshDrill: refreshActiveReportDrill,
  refreshReport: () => renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode }),
});

export async function renderReport(options = {}) {
  const rootSelector = options.rootSelector || STATE.rootSelector || '#tab-report';
  const homeMode = !!options.homeMode;
  STATE.rootSelector = rootSelector;
  STATE.homeMode = homeMode;
  const root = $(rootSelector);
  if (!root) return;
  bindReportRoot(root);
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
        <button class="tds-icon-btn md" onclick="window.reportMonthShift(-1)">‹</button>
        <div class="t6">${monthKey}</div>
        <button class="tds-icon-btn md" onclick="window.reportMonthShift(1)">›</button>
      </div>
    `}
    <div class="report-body" data-report-body><div class="empty-state"><div class="loading-spinner"></div></div></div>
  `;

  const rewardLookbackStart = rewardLookbackStartDate(rewardSettings);

  const [monthTxs, cycleTxs, rewardTxs, mindbankEntries, financeGoals, devIdeas, rewardPointEntries] = await Promise.all([
    listTransactions({ from: monthStart, to: monthEnd, max: 1000 }),
    listTransactions({ from: cycleStart, to: cycleEnd, max: 1000 }),
    homeMode ? listTransactions({ from: rewardLookbackStart, to: new Date(), max: 3000 }).catch(() => []) : Promise.resolve([]),
    homeMode ? listMindbankEntries({ max: 200 }) : Promise.resolve([]),
    listFinanceGoals({ max: 10 }).catch(() => []),
    homeMode ? listDevIdeas({ max: 20 }).catch(() => []) : Promise.resolve([]),
    homeMode ? listRewardPointEntries({ max: 300 }).catch(() => []) : Promise.resolve([]),
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
  const mindbank = summarizeMindbank(mindbankEntries);
  const monthUsedAll = budgetCategories.reduce((sum, cat) => sum + usedFor(cat, byCatMonth), 0);
  const monthTargetAll = budgetCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, 'month'), 0);
  const goalImpact = buildGoalImpact(financeGoals.find(goal => goal.active !== false) || financeGoals[0] || null, {
    monthUsed: monthUsedAll,
    monthTarget: monthTargetAll,
    mindbankTotal: mindbank.total,
  });
  const homeVariableCategories = homeMode ? controlCategories : [];
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
    <section class="hero report-hero-card ${homeMode ? 'home-hero-card' : ''} ${mode === 'month' ? 'monthly' : ''}">
      ${reportModeControlHtml(mode, homeMode)}

      <div class="report-hero-head">
        <div>
          <div class="label">${heroTitleLabel(mode, monthKey, homeMode)}</div>
          <div class="report-hero-period">${heroPeriodLabel(mode, monthKey, cycleRange)}</div>
          <div class="amount">${fmtKRW(currentUsed).replace('원', '')}<span class="unit">원</span></div>
          ${homeMode ? '' : `
            <div class="sub">
              <span>수입 <b>+${fmtKRW(currentIncome).replace('원', '')}</b></span>
              <span>정산 <b>+${fmtKRW(currentSettlement).replace('원', '')}</b></span>
            </div>
            <div class="pace ${currentTarget && currentUsed > currentTarget ? 'warn' : ''}">● ${paceText(currentUsed, currentTarget)}</div>
          `}
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
        ? heroSecondaryProgress(
            homeMode ? '고정비 포함 전체 지출' : '고정비 제외 조절비',
            homeMode ? monthUsedAll : controlMonthUsed,
            homeMode ? monthTargetAll : controlMonthTarget,
          )
        : ''}
    </section>

    ${homeMode ? '' : financeDirectionCard(goalImpact)}

    ${homeMode ? `
      ${rewardSavingsCard(rewardSummary)}
      ${reviewNudgeCard(reviewCount)}
      <section class="home-responsive-section home-variable-section">
        <div class="section-title home-section-title"><h3>${mode === 'cycle' ? '이번 2주 변동비' : '이번 달 변동비'}</h3><button type="button" class="more" onclick="switchTab('report')">전체 ›</button></div>
        <div class="budget-gauge-panel home-variable-panel">
          ${budgetGaugeGroups(homeVariableCategories, byCat, monthKey, mode, { showIcon: false, homeMode })}
        </div>
      </section>
    ` : `
      <div class="section-title"><h3>${mode === 'cycle' ? '균형 카테고리' : '월 MAX 게이지'}</h3><button type="button" class="more" onclick="switchTab('settings')">관리 ›</button></div>
      <div class="budget-gauge-panel">
        ${budgetGaugeGroups(gaugeCategories, byCat, monthKey, mode, { homeMode })}
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
  if (homeMode) publishRewardWidgetSnapshot(rewardSummary);
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

function bindReportRoot(root) {
  if (!root || root.dataset.reportRootBound) return;
  root.dataset.reportRootBound = 'true';
  root.addEventListener('click', event => {
    const modeTarget = event.target?.closest?.('[data-report-view-mode]');
    if (modeTarget && root.contains(modeTarget)) {
      event.preventDefault();
      STATE.viewMode = modeTarget.dataset.reportViewMode === 'month' ? 'month' : 'cycle';
      renderReport({
        rootSelector: root.dataset.reportRootSelector || STATE.rootSelector,
        homeMode: root.dataset.reportHomeMode === 'true',
      });
      return;
    }
    const dailyFocusTarget = event.target?.closest?.('[data-reward-daily-focus]');
    if (dailyFocusTarget && root.contains(dailyFocusTarget)) {
      event.preventDefault();
      chooseDailyRewardFocus(dailyFocusTarget.dataset.rewardDailyFocus);
      return;
    }
    const pointUsageTarget = event.target?.closest?.('[data-reward-point-action="open"]');
    if (pointUsageTarget && root.contains(pointUsageTarget)) {
      event.preventDefault();
      rewardPointModalController.open(pointUsageTarget.dataset.rewardPointId);
      return;
    }
    const actionTarget = event.target?.closest?.('[data-report-action]');
    if (!actionTarget || !root.contains(actionTarget)) return;
    if (actionTarget.dataset.reportAction !== 'open-biweekly-start-settings') return;
    event.preventDefault();
    STATE.rootSelector = root.dataset.reportRootSelector || STATE.rootSelector;
    STATE.homeMode = root.dataset.reportHomeMode === 'true';
    openBiweeklyStartSettings();
  });
  root.addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-biweekly-start-form]');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    saveBiweeklyStartDate(form);
  });
}

function localAppSettingsFallback() {
  return {
    homeManagedCategoryIds: [],
    biweeklyStartDate: readLocalStorage(BIWEEKLY_START_KEY),
    rewardSavings: {},
  };
}

function resolveBiweeklyStartDate(appSettings = {}) {
  return normalizeCycleAnchorDate(appSettings.biweeklyStartDate)
    || normalizeCycleAnchorDate(readLocalStorage(BIWEEKLY_START_KEY));
}

function syncLocalBiweeklyStartDate(value) {
  const normalized = normalizeCycleAnchorDate(value);
  if (normalized) {
    writeLocalStorage(BIWEEKLY_START_KEY, normalized);
  } else {
    removeLocalStorage(BIWEEKLY_START_KEY);
  }
}

async function chooseDailyRewardFocus(focusBucketKey) {
  const normalizedFocus = String(focusBucketKey || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
  if (!normalizedFocus) return;
  try {
    const appSettings = await getAppSettings();
    const rewardSavings = appSettings.rewardSavings || {};
    const dailyReward = rewardSavings.dailyReward || {};
    await saveAppSettings({
      rewardSavings: {
        ...rewardSavings,
        dailyReward: {
          ...dailyReward,
          enabled: dailyReward.enabled !== false,
          selectedDateKey: todayDateKey(new Date()),
          selectedRuleId: 'focusPoint',
          focusBucketKey: normalizedFocus,
        },
      },
    });
    showToast('오늘 카드를 골랐어요.', 1200, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '오늘 카드 저장 실패', 2200, 'error');
  }
}

function todayDateKey(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function reportModeControlHtml(mode, homeMode) {
  const tabs = `
    <div class="report-mode-tabs">
      <button type="button" class="${mode === 'cycle' ? 'active' : ''}" data-report-view-mode="cycle">이번 2주</button>
      <button type="button" class="${mode === 'month' ? 'active' : ''}" data-report-view-mode="month">이번 달</button>
    </div>
  `;
  const rowClass = homeMode
    ? 'report-cycle-mode-row home-cycle-mode-row'
    : 'report-cycle-mode-row';
  return `
    <div class="${rowClass}">
      ${tabs}
      <button class="home-cycle-settings-btn" type="button" data-report-action="open-biweekly-start-settings" aria-label="2주 시작일 설정" title="2주 시작일 설정">⚙</button>
    </div>
  `;
}

function biweeklyStartControlHtml(biweeklyStartDate, range) {
  const value = normalizeCycleAnchorDate(biweeklyStartDate) || formatDateInput(range.start);
  return `
    <form class="home-cycle-start-form home-cycle-start-modal-form" data-biweekly-start-form>
      <label class="home-cycle-start-field">
        <span>시작일</span>
        <input class="tds-input" type="date" name="biweeklyStartDate" value="${escHtml(value)}">
      </label>
      <div class="home-cycle-range-preview">
        <span>현재 2주</span>
        <strong>${cycleDateRangeText(range)}</strong>
      </div>
      <div class="home-cycle-modal-actions">
        <button class="tds-btn secondary" type="button" data-report-action="close-biweekly-start-settings">닫기</button>
        <button class="tds-btn primary" type="submit">저장</button>
      </div>
    </form>
  `;
}

function openBiweeklyStartSettings() {
  const range = STATE.cycleRange || cycleRangeForDate(new Date(), STATE.biweeklyStartDate);
  const modal = ensureBiweeklyStartModal();
  modal.querySelector('#home-cycle-settings-body').innerHTML = biweeklyStartControlHtml(STATE.biweeklyStartDate, range);
  window.openModal('home-cycle-settings-modal');
}

function ensureBiweeklyStartModal() {
  let modal = document.getElementById('home-cycle-settings-modal');
  if (!modal) {
    const container = document.getElementById('modals-container') || document.body;
    container.insertAdjacentHTML('beforeend', `
      <div class="tds-modal-overlay home-cycle-settings-modal" id="home-cycle-settings-modal" role="dialog" aria-modal="true" aria-labelledby="home-cycle-settings-title">
        <div class="tds-modal-sheet home-cycle-settings-sheet">
          <div class="tds-modal-handle"></div>
          <div class="tds-modal-content">
            <div class="home-cycle-modal-head">
              <div class="tds-modal-title" id="home-cycle-settings-title">2주 시작일 설정</div>
              <button class="home-cycle-modal-close" type="button" data-report-action="close-biweekly-start-settings" aria-label="닫기">×</button>
            </div>
            <div id="home-cycle-settings-body"></div>
          </div>
        </div>
      </div>
    `);
    modal = document.getElementById('home-cycle-settings-modal');
  }
  bindBiweeklyStartModal(modal);
  return modal;
}

function bindBiweeklyStartModal(modal) {
  if (!modal || modal.dataset.biweeklyStartModalBound) return;
  modal.dataset.biweeklyStartModalBound = 'true';
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      window.closeModal('home-cycle-settings-modal');
      return;
    }
    const actionTarget = event.target?.closest?.('[data-report-action]');
    if (!actionTarget || !modal.contains(actionTarget)) return;
    if (actionTarget.dataset.reportAction === 'close-biweekly-start-settings') {
      event.preventDefault();
      window.closeModal('home-cycle-settings-modal');
    }
  });
  modal.addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-biweekly-start-form]');
    if (!form || !modal.contains(form)) return;
    event.preventDefault();
    saveBiweeklyStartDate(form);
  });
}

async function saveBiweeklyStartDate(form) {
  const biweeklyStartDate = normalizeCycleAnchorDate(new FormData(form).get('biweeklyStartDate'));
  if (!biweeklyStartDate) {
    showToast('시작일을 선택하세요.', 1600, 'warning');
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await saveAppSettings({ biweeklyStartDate });
    writeLocalStorage(BIWEEKLY_START_KEY, biweeklyStartDate);
    STATE.biweeklyStartDate = biweeklyStartDate;
    STATE.cycleRange = cycleRangeForDate(new Date(), biweeklyStartDate);
    window.refreshAppHeader?.();
    showToast('이번 2주 시작일을 저장했어요.', 1400, 'success');
    window.closeModal?.('home-cycle-settings-modal');
    await renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '시작일 저장 실패', 2400, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function heroPeriodLabel(mode, monthKey, range) {
  if (mode === 'cycle') return cycleLabelForRange(range);
  return `${monthKey} · ${elapsedMonthDayLabel(monthKey)}`;
}

function heroTitleLabel(mode, monthKey, homeMode) {
  if (mode === 'cycle') return homeMode ? '이번 2주 조절비' : '이번 격주 지출';
  return homeMode ? `${monthKey} 조절비` : `${monthKey} 지출 합계`;
}

function formatDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function readLocalStorage(key) {
  try {
    return window.localStorage?.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeLocalStorage(key, value) {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Firestore remains the durable source when localStorage is unavailable.
  }
}

function removeLocalStorage(key) {
  try {
    window.localStorage?.removeItem(key);
  } catch {
    // Firestore remains the durable source when localStorage is unavailable.
  }
}

function elapsedMonthDayLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  const today = new Date();
  if (today.getFullYear() !== year || today.getMonth() + 1 !== month) return '전체';
  return `${today.getDate()}일째`;
}

function reviewNudgeCard(count) {
  if (!count) return '';
  return `
    <button type="button" class="insight review review-nudge-card" onclick="switchTab('review')">
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
          <button class="home-reward-daily-option" type="button" data-reward-daily-focus="${escHtml(bucket.key)}" ${baselineReady ? '' : 'disabled'}>
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

function formatRewardRatePct(value) {
  const pct = Math.max(0, Math.min(100, Number(value) * 100));
  if (!Number.isFinite(pct)) return '0';
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
}

function financeDirectionCard(impact) {
  if (!impact) {
    return `
      <button type="button" class="finance-direction-card empty" onclick="switchTab('finance')">
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
    <button type="button" class="finance-direction-card" onclick="switchTab('finance')">
      <span class="mark">◇</span>
      <span class="body">
        <span class="label">장기 방향 · ${escHtml(impact.goal.name || '목표')}</span>
        <span class="h">${directionText}</span>
        <span class="sub">${budgetText} · 좋은 선택 여력 +${fmtKRW(impact.mindbankTotal)}</span>
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
      <form id="dev-idea-form" class="dev-idea-form" onsubmit="window.addDevIdea(event)">
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
      <input type="checkbox" aria-label="완료 표시" ${done ? 'checked' : ''} onchange="window.toggleDevIdea('${idea.id}', this.checked)">
      <span class="dev-idea-title">${escHtml(idea.title || '제목 없음')}</span>
      <span class="dev-idea-status">${devIdeaStatusLabel(status)}</span>
      <button type="button" title="삭제" onclick="event.preventDefault();event.stopPropagation();window.deleteDevIdea('${idea.id}')">×</button>
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

function openReportCategoryTxs(encodedName, mode = STATE.viewMode) {
  const categoryName = decodeURIComponent(encodedName);
  STATE.activeDrill = { type: 'category', categoryName, mode };
  const txs = txsForCategory(categoryName, mode);
  const total = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const modal = ensureReportModal();
  const category = STATE.categories.find(cat => cat.name === categoryName);
  modal.querySelector('.tds-modal-title').textContent = `${category?.emoji || ''} ${categoryName}`;
  modal.querySelector('#report-category-modal-body').innerHTML = `
    <div class="report-drill-summary">
      <strong>${fmtKRW(total)}</strong>
      <span>${mode === 'cycle' ? '이번 2주' : '이번 달'} · ${txs.length}건</span>
    </div>
    ${txs.length ? subcategorySummaryHtml(txs, { actionableUnassigned: true }) : ''}
    ${txs.length
      ? txs.map(tx => reportTxRow(tx)).join('')
      : '<div class="empty-state compact"><div>해당 기준의 거래가 없습니다</div></div>'}
  `;
  if (!modal.classList.contains('open')) window.openModal('report-category-modal');
}

function openReportReimbursementTxs(mode = STATE.viewMode) {
  STATE.activeDrill = { type: 'reimbursement', categoryName: REIMBURSEMENT_CATEGORY_NAME, mode };
  const txs = txsForCategory(REIMBURSEMENT_CATEGORY_NAME, mode);
  const total = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const modal = ensureReportModal();
  modal.querySelector('.tds-modal-title').textContent = `↩ ${REIMBURSEMENT_CATEGORY_NAME}`;
  modal.querySelector('#report-category-modal-body').innerHTML = `
    <div class="report-drill-summary reimbursement">
      <strong>${fmtKRW(total)}</strong>
      <span>${mode === 'cycle' ? '이번 2주' : '이번 달'} · ${txs.length}건 · 예산/소비 합계 제외</span>
    </div>
    ${txs.length ? subcategorySummaryHtml(txs, { actionableUnassigned: false }) : ''}
    ${txs.length
      ? txs.map(tx => reportTxRow(tx)).join('')
      : '<div class="empty-state compact"><div>환급 예정으로 표시된 거래가 없습니다</div></div>'}
  `;
  if (!modal.classList.contains('open')) window.openModal('report-category-modal');
}

function ensureReportModal() {
  let modal = document.getElementById('report-category-modal');
  if (!modal) {
    const container = document.getElementById('modals-container') || document.body;
    container.insertAdjacentHTML('beforeend', `
      <div class="tds-modal-overlay" id="report-category-modal" onclick="if(event.target===this)closeModal('report-category-modal')">
        <div class="tds-modal-sheet">
          <div class="tds-modal-handle"></div>
          <div class="tds-modal-content" style="text-align:left">
            <div class="tds-modal-title">카테고리 내역</div>
            <div id="report-category-modal-body"></div>
          </div>
        </div>
      </div>
    `);
    modal = document.getElementById('report-category-modal');
  }
  bindReportModal(modal);
  return modal;
}

function bindReportModal(modal) {
  if (!modal || modal.dataset.reportModalBound) return;
  modal.dataset.reportModalBound = 'true';
  modal.addEventListener('click', (event) => {
    clearPendingSubcategoryPointerFallback();
    handleReportModalAction(event, modal);
  });
  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    clearPendingSubcategoryPointerFallback();
    handleReportModalAction(event, modal);
  });
  modal.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse') return;
    scheduleSubcategoryPointerFallback(event, modal);
  });
  modal.addEventListener('pointercancel', clearPendingSubcategoryPointerFallback);
  modal.addEventListener('selectstart', (event) => {
    preventSubcategoryTextSelection(event, modal);
  });
  modal.addEventListener('contextmenu', (event) => {
    preventSubcategoryTextSelection(event, modal);
  });
}

let pendingSubcategoryPointerFallback = null;

function scheduleSubcategoryPointerFallback(event, modal) {
  const actionTarget = closestReportActionTarget(event.target, modal);
  if (!actionTarget || actionTarget.dataset.reportAction !== 'open-subcategory-classifier') return;

  clearPendingSubcategoryPointerFallback();
  pendingSubcategoryPointerFallback = window.setTimeout(() => {
    pendingSubcategoryPointerFallback = null;
    if (!modal.isConnected || !modal.contains(actionTarget)) return;
    if (shouldIgnoreRepeatedSubcategoryOpen()) return;
    subcategoryClassifierController.open();
  }, 420);
}

function clearPendingSubcategoryPointerFallback() {
  if (!pendingSubcategoryPointerFallback) return;
  window.clearTimeout(pendingSubcategoryPointerFallback);
  pendingSubcategoryPointerFallback = null;
}

function preventSubcategoryTextSelection(event, modal) {
  const actionTarget = closestReportActionTarget(event.target, modal);
  if (!actionTarget || actionTarget.dataset.reportAction !== 'open-subcategory-classifier') return;
  event.preventDefault();
}

function handleReportModalAction(event, modal) {
  const actionTarget = closestReportActionTarget(event.target, modal);
  if (!actionTarget) return;
  const action = actionTarget.dataset.reportAction;
  if (!['open-subcategory-classifier', 'open-tx-detail', 'toggle-reimbursement'].includes(action)) return;

  event.preventDefault();
  event.stopPropagation();

  if (action === 'open-subcategory-classifier') {
    if (shouldIgnoreRepeatedSubcategoryOpen()) return;
    subcategoryClassifierController.open();
    return;
  }

  if (action === 'open-tx-detail') {
    openReportTxDetail(actionTarget.dataset.txId);
    return;
  }

  if (action === 'toggle-reimbursement') {
    if (actionTarget.dataset.saving === 'true') return;
    const checked = actionTarget.dataset.checked !== 'true';
    reportToggleReimbursement(actionTarget.dataset.txId, checked, actionTarget);
  }
}

let lastSubcategoryClassifierOpenAt = 0;

function shouldIgnoreRepeatedSubcategoryOpen() {
  const now = Date.now();
  if (now - lastSubcategoryClassifierOpenAt < 350) return true;
  lastSubcategoryClassifierOpenAt = now;
  return false;
}

function closestReportActionTarget(target, root) {
  const element = target?.closest ? target : target?.parentElement;
  const actionTarget = element?.closest?.('[data-report-action]');
  return actionTarget && root?.contains?.(actionTarget) ? actionTarget : null;
}

function reportTxRow(tx) {
  const isPos = tx.type === 'transfer_in' || tx.type === 'settlement_in';
  const sign = isPos ? '+' : '-';
  const checked = isReimbursementExpected(tx);
  const txId = escHtml(tx.id);
  const meta = [
    tx.subcategory,
    fmtDateTime(tx.occurredAt),
    tx.memo,
  ].filter(Boolean).join(' · ');
  return `
    <div class="report-tx-row">
      <div class="report-tx-open" role="button" tabindex="0" data-report-action="open-tx-detail" data-tx-id="${txId}">
        <span class="tx-icon">${typeEmoji(tx.type)}</span>
        <span class="report-tx-body">
          <strong>${escHtml(tx.merchant || tx.counterparty || '미분류')}</strong>
          <small>${escHtml(meta)}</small>
        </span>
        <span class="${isPos ? 'amount-pos' : 'amount-neg'}">${sign}${fmtKRW(tx.amount)}</span>
      </div>
      <span
        class="report-refund-check ${checked ? 'active' : ''}"
        role="button"
        tabindex="0"
        data-report-action="toggle-reimbursement"
        data-tx-id="${txId}"
        data-checked="${checked ? 'true' : 'false'}"
        aria-pressed="${checked ? 'true' : 'false'}"
        aria-label="${checked ? '환급예정 해제' : '환급처리'}"
      >
        <span data-report-refund-label>${checked ? '환급예정' : '환급처리'}</span>
      </span>
    </div>
  `;
}

function subcategorySummaryHtml(txs, options = {}) {
  const rows = Object.values(txs.reduce((acc, tx) => {
    const key = isUnassignedSubcategory(tx.subcategory) ? UNASSIGNED_SUBCATEGORY_LABEL : tx.subcategory;
    if (!acc[key]) acc[key] = { name: key, amount: 0, count: 0 };
    acc[key].amount += Number(tx.amount) || 0;
    acc[key].count += 1;
    return acc;
  }, {})).sort((a, b) => b.amount - a.amount);

  return `
    <div class="report-subcategory-summary">
      <div class="report-subcategory-title">상세분류 요약</div>
      ${rows.map(row => subcategorySummaryRowHtml(row, options)).join('')}
    </div>
  `;
}

function subcategorySummaryRowHtml(row, options = {}) {
  const actionable = Boolean(options.actionableUnassigned) && row.name === UNASSIGNED_SUBCATEGORY_LABEL;
  const content = `
    <span>${escHtml(row.name)}</span>
    <em>${row.count}건</em>
    <strong>${fmtKRW(row.amount)}</strong>
  `;
  if (!actionable) return `<div class="report-subcategory-row">${content}</div>`;
  return `
    <button type="button" class="report-subcategory-row actionable" data-report-action="open-subcategory-classifier" aria-haspopup="dialog" aria-label="${escHtml(row.name)} ${row.count}건 분류">
      ${content}
    </button>
  `;
}

function openReportTxDetail(txId) {
  if (!txId) return;
  window.closeModal('report-category-modal');
  window.openTxEditModal?.(txId);
}

async function reportToggleReimbursement(txId, checked, actionTarget = null) {
  if (!txId) return;
  const previous = actionTarget?.dataset.checked === 'true';
  if (actionTarget) {
    actionTarget.dataset.saving = 'true';
    actionTarget.setAttribute('aria-disabled', 'true');
    setReportRefundActionState(actionTarget, checked);
  }
  try {
    await updateTransaction(txId, {
      reimbursementExpected: checked,
      excludedFromBudget: checked,
      excludeReason: checked ? 'reimbursement_expected' : null,
    });
    patchLocalTx(txId, {
      reimbursementExpected: checked,
      excludedFromBudget: checked,
      excludeReason: checked ? 'reimbursement_expected' : null,
    });
    showToast(checked ? '환급예정금액으로 분리됨' : '일반 지출로 복귀됨', 1400, 'success');
    refreshActiveReportDrill();
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    if (actionTarget) setReportRefundActionState(actionTarget, previous);
    showToast(err.message || '환급 상태 변경 실패', 2600, 'error');
  } finally {
    if (actionTarget) {
      delete actionTarget.dataset.saving;
      actionTarget.removeAttribute('aria-disabled');
    }
  }
}

function setReportRefundActionState(actionTarget, checked) {
  actionTarget.dataset.checked = checked ? 'true' : 'false';
  actionTarget.setAttribute('aria-pressed', checked ? 'true' : 'false');
  actionTarget.setAttribute('aria-label', checked ? '환급예정 해제' : '환급처리');
  actionTarget.classList.toggle('active', checked);
  const label = actionTarget.querySelector('[data-report-refund-label]');
  if (label) label.textContent = checked ? '환급예정' : '환급처리';
}

function patchLocalTx(txId, patch) {
  STATE.monthTxs = STATE.monthTxs.map(tx => tx.id === txId ? { ...tx, ...patch } : tx);
  STATE.cycleTxs = STATE.cycleTxs.map(tx => tx.id === txId ? { ...tx, ...patch } : tx);
}

function refreshActiveReportDrill() {
  if (!STATE.activeDrill) return;
  if (STATE.activeDrill.type === 'reimbursement') {
    openReportReimbursementTxs(STATE.activeDrill.mode);
    return;
  }
  openReportCategoryTxs(encodeURIComponent(STATE.activeDrill.categoryName), STATE.activeDrill.mode);
}

function txsForCategory(categoryName, mode) {
  const source = mode === 'cycle' ? STATE.cycleTxs : STATE.monthTxs;
  if (categoryName === REIMBURSEMENT_CATEGORY_NAME) {
    return reimbursementTransactions(source)
      .sort((a, b) => dateMs(b.occurredAt) - dateMs(a.occurredAt));
  }
  return expenseTransactions(source)
    .filter(tx => displayCategoryName(tx) === categoryName)
    .sort((a, b) => dateMs(b.occurredAt) - dateMs(a.occurredAt));
}

function dateMs(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function typeEmoji(type) {
  return ({ card_payment: '💳', transfer_out: '↗️', transfer_in: '↙️', internal_transfer: '🔄', settlement_in: '💰', settlement_out: '💸' })[type] || '📦';
}

window.reportMonthShift = (delta) => {
  if (STATE.homeMode) {
    renderReport({ rootSelector: STATE.rootSelector, homeMode: true });
    return;
  }
  const [y, m] = STATE.monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  STATE.monthKey = fmtMonthKey(d);
  renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
};

window.reportViewMode = (mode) => {
  STATE.viewMode = mode === 'month' ? 'month' : 'cycle';
  renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
};

window.openReportCategoryTxs = openReportCategoryTxs;
window.openReportReimbursementTxs = openReportReimbursementTxs;
window.openReportTxDetail = openReportTxDetail;
window.reportToggleReimbursement = reportToggleReimbursement;

window.addDevIdea = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const title = new FormData(form).get('title');
  try {
    await saveDevIdea({ title, status: 'pending' });
    form.reset();
    showToast('개발 아이디어를 저장했어요.', 1300, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '아이디어 저장 실패', 2400, 'error');
  }
};

window.toggleDevIdea = async (ideaId, done) => {
  try {
    await updateDevIdea(ideaId, { status: done ? 'done' : 'pending' });
    showToast(done ? '완료로 표시했어요.' : '진행전으로 돌렸어요.', 1200, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '아이디어 변경 실패', 2400, 'error');
  }
};

window.deleteDevIdea = async (ideaId) => {
  try {
    await deleteDevIdea(ideaId);
    showToast('아이디어를 삭제했어요.', 1200, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '아이디어 삭제 실패', 2400, 'error');
  }
};
