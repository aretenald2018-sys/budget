import {
  updateTransaction,
  displayCategoryName,
  isReimbursementExpected,
  REIMBURSEMENT_CATEGORY_NAME,
  saveDevIdea,
  updateDevIdea,
  deleteDevIdea,
  getAppSettings,
  saveAppSettings,
} from '../../data.js?v=20260712-domain-rules-r2';
import { createRewardPointModalController } from './reward-point-modal/controller.js?v=20260712-report-features';
import { createSubcategoryClassifierController } from './subcategory-classifier/controller.js?v=20260712-report-features';
import {
  isUnassignedSubcategory,
  UNASSIGNED_SUBCATEGORY_LABEL,
} from './subcategory-classifier/state.js?v=20260712-report-features';
import {
  expenseTransactions,
  reimbursementTransactions,
} from './budget-summary/state.js?v=20260712-report-features';
import { reportState as STATE } from './state.js?v=20260712-current-surface-r1';
import { fmtKRW, fmtMonthKey, fmtDateTime } from '../../utils/format.js';
import {
  cycleDateRangeText,
  cycleLabelForRange,
  cycleRangeForDate,
  normalizeCycleAnchorDate,
} from '../../utils/cycles.js?v=20260601-biweekly-start';
import { escHtml } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

const BIWEEKLY_START_KEY = 'budget.biweeklyStartDate';
let renderReport = async () => {};
let refreshRewardWidgetSnapshot = async () => {};

export function bindReportController(root, callbacks = {}) {
  renderReport = callbacks.renderReport || renderReport;
  refreshRewardWidgetSnapshot = callbacks.refreshRewardWidgetSnapshot || refreshRewardWidgetSnapshot;
  bindReportRoot(root);
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
    event.preventDefault();
    handleReportRootAction(actionTarget, root);
  });
  root.addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-biweekly-start-form]');
    if (form && root.contains(form)) {
      event.preventDefault();
      saveBiweeklyStartDate(form);
      return;
    }
    const ideaForm = event.target?.closest?.('[data-dev-idea-form]');
    if (!ideaForm || !root.contains(ideaForm)) return;
    event.preventDefault();
    submitDevIdea(ideaForm);
  });
  root.addEventListener('change', event => {
    const toggle = event.target?.closest?.('[data-dev-idea-toggle]');
    if (!toggle || !root.contains(toggle)) return;
    toggleDevIdeaDone(toggle.dataset.ideaId, toggle.checked);
  });
}

function handleReportRootAction(actionTarget, root) {
  const action = actionTarget.dataset.reportAction;
  if (action === 'open-biweekly-start-settings') {
    STATE.rootSelector = root.dataset.reportRootSelector || STATE.rootSelector;
    STATE.homeMode = root.dataset.reportHomeMode === 'true';
    openBiweeklyStartSettings();
  } else if (action === 'switch-tab') {
    window.switchTab?.(actionTarget.dataset.tab);
  } else if (action === 'shift-month') {
    shiftReportMonth(Number(actionTarget.dataset.monthDelta) || 0);
  } else if (action === 'open-category') {
    openReportCategoryTxs(actionTarget.dataset.categoryName || '', actionTarget.dataset.reportMode || STATE.viewMode);
  } else if (action === 'open-reimbursement') {
    openReportReimbursementTxs(actionTarget.dataset.reportMode || STATE.viewMode);
  } else if (action === 'delete-dev-idea') {
    removeDevIdeaById(actionTarget.dataset.ideaId);
  }
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
      <div class="tds-modal-overlay" id="report-category-modal">
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

async function submitDevIdea(form) {
  const title = new FormData(form).get('title');
  try {
    await saveDevIdea({ title, status: 'pending' });
    form.reset();
    showToast('개발 아이디어를 저장했어요.', 1300, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '아이디어 저장 실패', 2400, 'error');
  }
}

async function toggleDevIdeaDone(ideaId, done) {
  try {
    await updateDevIdea(ideaId, { status: done ? 'done' : 'pending' });
    showToast(done ? '완료로 표시했어요.' : '진행전으로 돌렸어요.', 1200, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '아이디어 변경 실패', 2400, 'error');
  }
}

async function removeDevIdeaById(ideaId) {
  try {
    await deleteDevIdea(ideaId);
    showToast('아이디어를 삭제했어요.', 1200, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '아이디어 삭제 실패', 2400, 'error');
  }
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

