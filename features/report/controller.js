import {
  updateTransaction,
  displayCategoryName,
  isReimbursementExpected,
  REIMBURSEMENT_CATEGORY_NAME,
  getAppSettings,
  saveAppSettings,
} from '../../data.js';
import { fundCoveredTxsForCategory, fundCoveredDrillHtml } from '../funds/drill.js';
import { openGoalDetail } from '../home/goal-modal.js';
import { heroHtml } from '../home/dashboard.js';
import { createRewardPointModalController } from './reward-point-modal/controller.js';
import { createSubcategoryClassifierController } from './subcategory-classifier/controller.js';
import {
  isUnassignedSubcategory,
  UNASSIGNED_SUBCATEGORY_LABEL,
} from './subcategory-classifier/state.js';
import {
  expenseTransactions,
  reimbursementTransactions,
} from './budget-summary/state.js';
import { reportState as STATE } from './state.js';
import { fmtKRW, fmtMonthKey, fmtDateTime } from '../../utils/format.js';
import {
  cycleLabelForRange,
  normalizeCycleAnchorDate,
} from '../../utils/cycles.js';
import { cycleForViewMode } from '../../domain/budget/period.js';
import {
  bindBudgetPeriodModal,
  currentPeriod,
  openBudgetPeriodModal,
  saveBudgetCycle,
  saveBudgetPeriodForm,
} from './period-modal.js';
import { escHtml } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

const BIWEEKLY_START_KEY = 'budget.biweeklyStartDate';
const DAILY_REWARD_SELECTION_KEY = 'budget.dailyRewardSelection';
let renderReport = async () => {};
let refreshRewardWidgetSnapshot = async () => {};
let applyDailyRewardFocus = () => {};

export function bindReportController(root, callbacks = {}) {
  renderReport = callbacks.renderReport || renderReport;
  bindBudgetPeriodModal({
    refreshReport: () => renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode }),
    persistAnchor: value => writeLocalStorage(BIWEEKLY_START_KEY, value),
  });
  refreshRewardWidgetSnapshot = callbacks.refreshRewardWidgetSnapshot || refreshRewardWidgetSnapshot;
  applyDailyRewardFocus = callbacks.applyDailyRewardFocus || applyDailyRewardFocus;
  bindReportRoot(root);
}

export function bindDailyRewardFocusButtons(root) {
  if (!root) return;
  root.querySelectorAll('[data-reward-daily-focus]').forEach(button => {
    if (button.dataset.rewardDailyFocusBound) return;
    button.dataset.rewardDailyFocusBound = 'true';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      chooseDailyRewardFocus(button.dataset.rewardDailyFocus);
    });
  });
}

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

function bindReportRoot(root) {
  if (!root || root.dataset.reportRootBound) return;
  root.dataset.reportRootBound = 'true';
  root.addEventListener('click', event => {
    // 중첩된 충당금/재배분 액션은 문서 레벨 funds 컨트롤러가 처리 — 여기서 중복 처리 금지.
    if (event.target?.closest?.('[data-fund-action]')) return;
    const modeTarget = event.target?.closest?.('[data-report-view-mode]');
    if (modeTarget && root.contains(modeTarget)) {
      event.preventDefault();
      // 기간 세그먼트는 표시 전용이 아니라 예산 주기 설정 자체를 바꾼다(설정 탭과 동일 값).
      STATE.rootSelector = root.dataset.reportRootSelector || STATE.rootSelector;
      STATE.homeMode = root.dataset.reportHomeMode === 'true';
      const nextMode = modeTarget.dataset.reportViewMode === 'month' ? 'month' : 'cycle';
      if (nextMode !== STATE.viewMode) saveBudgetCycle(cycleForViewMode(nextMode, currentPeriod()));
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
    event.preventDefault();
    handleReportRootAction(actionTarget, root);
  });
  root.addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-biweekly-start-form]');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    saveBudgetPeriodForm(form);
  });
}

function handleReportRootAction(actionTarget, root) {
  const action = actionTarget.dataset.reportAction;
  if (action === 'open-biweekly-start-settings') {
    STATE.rootSelector = root.dataset.reportRootSelector || STATE.rootSelector;
    STATE.homeMode = root.dataset.reportHomeMode === 'true';
    openBudgetPeriodModal();
  } else if (action === 'switch-tab') {
    window.switchTab?.(actionTarget.dataset.tab);
    if (actionTarget.dataset.scrollTo) scheduleScrollTo(actionTarget.dataset.scrollTo);
  } else if (action === 'open-search') {
    // 검색 오버레이는 아직 준비 중 — 빈 핸들러 대신 명시적 준비중 안내.
    showToast('검색 기능은 준비 중이에요.', 1600, 'info');
  } else if (action === 'hero-info') {
    // 히어로 금액 계산 방식 한 줄 설명(툴팁 대체 토스트).
    const lens = actionTarget.dataset.lens === 'spent' ? 'spent' : 'sts';
    showToast(lens === 'spent'
      ? '쓴 돈 = 이번 기간 조절 카테고리에서 실제로 쓴 금액의 합계예요.'
      : '써도 되는 돈 = 예산에서 이미 쓴 돈과 충당금을 뺀, 지금 남은 여윳돈이에요.', 3200, 'info');
  } else if (action === 'shift-month') {
    shiftReportMonth(Number(actionTarget.dataset.monthDelta) || 0);
  } else if (action === 'open-category') {
    openReportCategoryTxs(actionTarget.dataset.categoryName || '', actionTarget.dataset.reportMode || STATE.viewMode);
  } else if (action === 'open-reimbursement') {
    openReportReimbursementTxs(actionTarget.dataset.reportMode || STATE.viewMode);
  } else if (action === 'open-goal-detail') {
    const goal = (STATE.homeGoals || []).find(g => g.name === actionTarget.dataset.goalName);
    if (goal) openGoalDetail(goal);
  } else if (action === 'hero-lens') {
    // 렌즈는 표시 전환일 뿐 → 전체 재렌더(데이터 재조회) 없이 히어로만 교체.
    const nextLens = actionTarget.dataset.lens === 'spent' ? 'spent' : 'sts';
    if (nextLens === STATE.heroLens) return;
    STATE.heroLens = nextLens;
    const heroEl = STATE.homeMode && STATE.homeModel ? root.querySelector('.hd-hero') : null;
    if (heroEl) {
      STATE.homeModel.hero.lens = nextLens;
      heroEl.outerHTML = heroHtml(STATE.homeModel.hero);
      return;
    }
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  }
}

// 탭 렌더는 비동기라, 대상 섹션이 DOM에 나타날 때까지 잠깐 재시도 후 스크롤.
function scheduleScrollTo(elementId, attempt = 0) {
  const el = document.getElementById(elementId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (attempt < 25) window.setTimeout(() => scheduleScrollTo(elementId, attempt + 1), 120);
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
  const selection = {
    selectedDateKey: todayDateKey(new Date()),
    selectedRuleId: 'focusPoint',
    focusBucketKey: normalizedFocus,
  };
  writeDailyRewardSelection(selection);
  applyDailyRewardFocus(selection);
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
          ...selection,
        },
      },
    });
    clearDailyRewardSelection();
    showToast('오늘 카드를 골랐어요.', 1200, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast('오늘 카드가 이 기기에 반영됐어요. 동기화를 다시 시도합니다.', 2600, 'warning');
  }
}

export function applyStoredDailyRewardSelection(rewardSavings = {}) {
  const selection = readDailyRewardSelection();
  if (!selection) return rewardSavings;
  if (selection.selectedDateKey !== todayDateKey(new Date())) {
    clearDailyRewardSelection();
    return rewardSavings;
  }
  return {
    ...rewardSavings,
    dailyReward: {
      ...(rewardSavings.dailyReward || {}),
      ...selection,
    },
  };
}

function readDailyRewardSelection() {
  try {
    const value = JSON.parse(readLocalStorage(DAILY_REWARD_SELECTION_KEY) || 'null');
    const selectedDateKey = todayDateKey(value?.selectedDateKey);
    const focusBucketKey = String(value?.focusBucketKey || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
    return selectedDateKey && value?.selectedRuleId === 'focusPoint' && focusBucketKey
      ? { selectedDateKey, selectedRuleId: 'focusPoint', focusBucketKey }
      : null;
  } catch {
    return null;
  }
}

function writeDailyRewardSelection(selection) {
  try {
    writeLocalStorage(DAILY_REWARD_SELECTION_KEY, JSON.stringify(selection));
  } catch {
    // The in-memory card update still gives immediate feedback when storage is unavailable.
  }
}

function clearDailyRewardSelection() {
  removeLocalStorage(DAILY_REWARD_SELECTION_KEY);
}

function todayDateKey(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function reportModeControlHtml(mode, homeMode, period = currentPeriod()) {
  const tabs = `
    <div class="report-mode-tabs">
      <button type="button" class="${mode === 'cycle' ? 'active' : ''}" data-report-view-mode="cycle">이번 ${escHtml(period.unitLabel)}</button>
      <button type="button" class="${mode === 'month' ? 'active' : ''}" data-report-view-mode="month">이번 달</button>
    </div>
  `;
  const rowClass = homeMode
    ? 'report-cycle-mode-row home-cycle-mode-row'
    : 'report-cycle-mode-row';
  return `
    <div class="${rowClass}">
      ${tabs}
      <button class="home-cycle-settings-btn" type="button" data-report-action="open-biweekly-start-settings" aria-label="예산 기간 설정" title="예산 기간 설정">⚙</button>
    </div>
  `;
}

// 드릴 모달 헤더용 기간 문구 — 설정된 주기를 그대로 따라간다.
function periodLabelFor(mode) {
  return mode === 'cycle' ? currentPeriod().periodLabel : '이번 달';
}

function heroPeriodLabel(mode, monthKey, range) {
  if (mode === 'cycle') return cycleLabelForRange(range);
  return `${monthKey} · ${elapsedMonthDayLabel(monthKey)}`;
}

function heroTitleLabel(mode, monthKey, homeMode, period = currentPeriod()) {
  if (mode === 'cycle') return homeMode ? `${period.periodLabel} 조절비` : `${period.periodLabel} 지출`;
  return homeMode ? `${monthKey} 조절비` : `${monthKey} 지출 합계`;
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


function openReportCategoryTxs(encodedName, mode = STATE.viewMode) {
  const categoryName = decodeURIComponent(encodedName);
  STATE.activeDrill = { type: 'category', categoryName, mode, periodLabel: periodLabelFor(mode) };
  const txs = txsForCategory(categoryName, mode);
  const total = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const modal = ensureReportModal();
  const category = STATE.categories.find(cat => cat.name === categoryName);
  modal.querySelector('.tds-modal-title').textContent = `${category?.emoji || ''} ${categoryName}`;
  modal.querySelector('#report-category-modal-body').innerHTML = `
    <div class="report-drill-summary">
      <strong>${fmtKRW(total)}</strong>
      <span>${escHtml(periodLabelFor(mode))} · ${txs.length}건</span>
    </div>
    ${txs.length ? subcategorySummaryHtml(txs, { actionableUnassigned: true }) : ''}
    ${txs.length
      ? txs.map(tx => reportTxRow(tx)).join('')
      : '<div class="empty-state compact"><div>해당 기준의 거래가 없습니다</div></div>'}
    ${fundCoveredDrillHtml(fundCoveredTxsForCategory(mode === 'cycle' ? STATE.cycleTxs : STATE.monthTxs, categoryName))}
  `;
  if (!modal.classList.contains('open')) window.openModal('report-category-modal');
}

function openReportReimbursementTxs(mode = STATE.viewMode) {
  STATE.activeDrill = { type: 'reimbursement', categoryName: REIMBURSEMENT_CATEGORY_NAME, mode, periodLabel: periodLabelFor(mode) };
  const txs = txsForCategory(REIMBURSEMENT_CATEGORY_NAME, mode);
  const total = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const modal = ensureReportModal();
  modal.querySelector('.tds-modal-title').textContent = `↩ ${REIMBURSEMENT_CATEGORY_NAME}`;
  modal.querySelector('#report-category-modal-body').innerHTML = `
    <div class="report-drill-summary reimbursement">
      <strong>${fmtKRW(total)}</strong>
      <span>${escHtml(periodLabelFor(mode))} · ${txs.length}건 · 예산/소비 합계 제외</span>
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
      <div class="tds-modal-overlay hd-sheet" id="report-category-modal">
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
    if (event.target === modal) {
      window.closeModal?.('report-category-modal');
      return;
    }
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

function shiftReportMonth(delta) {
  if (STATE.homeMode) {
    renderReport({ rootSelector: STATE.rootSelector, homeMode: true });
    return;
  }
  const [y, m] = STATE.monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  STATE.monthKey = fmtMonthKey(d);
  renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
}

export {
  localAppSettingsFallback,
  resolveBiweeklyStartDate,
  syncLocalBiweeklyStartDate,
  reportModeControlHtml,
  heroPeriodLabel,
  heroTitleLabel,
  elapsedMonthDayLabel,
};
