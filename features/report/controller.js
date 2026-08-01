import {
  updateTransaction,
  displayCategoryName,
  isReimbursementExpected,
  REIMBURSEMENT_CATEGORY_NAME,
  UNCATEGORIZED_CATEGORY_NAME,
} from '../../data.js';
import { fundCoveredTxsForCategory, fundCoveredDrillHtml } from '../funds/drill.js';
import { requestSettingsDrill } from '../settings/modals.js';
import { groupUncategorizedByParty, uncategorizedBulkHtml } from './uncategorized/view.js';
import { budgetModelHtml } from '../settings/budget-explainer/view.js';
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
import { fmtKRW, fmtMonthKey, fmtDateTime, josaRo } from '../../utils/format.js';
import { cycleLabelForRange } from '../../utils/cycles.js';
import {
  VIEW_MODES,
  periodLabelForMode,
  periodNounForMode,
} from '../../domain/budget/model.js';
// 기간 설정 시트(보기 모드 전환 · 모드별 시작일 저장)는 period-modal 이 통째로 소유한다.
import {
  configurePeriodModal,
  localAppSettingsFallback,
  normalizeViewMode,
  openPeriodSettings,
  resolvePeriodStartDate,
  savePeriodStartDate,
  syncLocalPeriodMode,
  syncLocalPeriodStartDate,
} from './period-modal/controller.js';
import { escHtml } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

let renderReport = async () => {};
let refreshRewardWidgetSnapshot = async () => {};

export function bindReportController(root, callbacks = {}) {
  renderReport = callbacks.renderReport || renderReport;
  refreshRewardWidgetSnapshot = callbacks.refreshRewardWidgetSnapshot || refreshRewardWidgetSnapshot;
  configurePeriodModal({ renderReport });
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
    // 중첩된 충당금/재배분 액션은 문서 레벨 funds 컨트롤러가 처리 — 여기서 중복 처리 금지.
    if (event.target?.closest?.('[data-fund-action]')) return;
    const modeTarget = event.target?.closest?.('[data-report-view-mode]');
    if (modeTarget && root.contains(modeTarget)) {
      event.preventDefault();
      STATE.viewMode = normalizeViewMode(modeTarget.dataset.reportViewMode);
      STATE.viewModeUserSet = true;
      renderReport({
        rootSelector: root.dataset.reportRootSelector || STATE.rootSelector,
        homeMode: root.dataset.reportHomeMode === 'true',
      });
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
    const form = event.target?.closest?.('[data-period-start-form]');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    savePeriodStartDate(form);
  });
}

function handleReportRootAction(actionTarget, root) {
  const action = actionTarget.dataset.reportAction;
  if (action === 'open-biweekly-start-settings') {
    STATE.rootSelector = root.dataset.reportRootSelector || STATE.rootSelector;
    STATE.homeMode = root.dataset.reportHomeMode === 'true';
    openPeriodSettings();
  } else if (action === 'switch-tab') {
    window.switchTab?.(actionTarget.dataset.tab);
    if (actionTarget.dataset.scrollTo) scheduleScrollTo(actionTarget.dataset.scrollTo);
  } else if (action === 'open-settings-screen') {
    // 설정 탭으로 이동하면서 특정 drill-in 화면을 바로 연다.
    requestSettingsDrill(actionTarget.dataset.settingsScreen);
    window.switchTab?.('settings');
  } else if (action === 'hero-info') {
    // 한 줄 토스트로는 고정비·충당금·재배분의 관계를 설명할 수 없어 계산 내역 시트로 바꿨다.
    openBudgetModelSheet(actionTarget.dataset.lens === 'spent' ? 'spent' : 'sts');
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

function reportModeControlHtml(mode, homeMode) {
  const tabs = `
    <div class="report-mode-tabs">
      ${VIEW_MODES.map(item => `
        <button type="button" class="${mode === item ? 'active' : ''}" data-report-view-mode="${item}">${periodLabelForMode(item)}</button>
      `).join('')}
    </div>
  `;
  const rowClass = homeMode
    ? 'report-cycle-mode-row home-cycle-mode-row'
    : 'report-cycle-mode-row';
  return `
    <div class="${rowClass}">
      ${tabs}
      <button class="home-cycle-settings-btn" type="button" data-report-action="open-biweekly-start-settings" aria-label="기간 시작일 설정" title="기간 시작일 설정">⚙</button>
    </div>
  `;
}

// 히어로 ⓘ — '써도 되는 돈'이 어떻게 나온 숫자인지 실제 값으로 보여준다.
function openBudgetModelSheet(lens) {
  const modal = ensureBudgetModelModal();
  const body = modal.querySelector('#budget-model-sheet-body');
  if (lens === 'spent') {
    body.innerHTML = `
      <div class="budget-model">
        <div class="budget-model-head">
          <strong>지금까지 쓴 돈</strong>
          <span>이 기간에 변동비 카테고리에서 실제로 나간 금액의 합계예요.</span>
        </div>
        <div class="budget-model-note">
          <span class="budget-model-chip">고정비</span>
          <small>월세·통신비처럼 고정비로 지정한 카테고리는 여기에 포함되지 않아요.</small>
        </div>
        <div class="budget-model-note">
          <span class="budget-model-chip">충당금</span>
          <small>충당금에서 차감한 지출과 환급예정으로 표시한 지출도 빠집니다.</small>
        </div>
      </div>
    `;
  } else {
    body.innerHTML = budgetModelHtml(STATE.budgetBreakdown || {});
  }
  window.openModal('budget-model-sheet');
}

function ensureBudgetModelModal() {
  let modal = document.getElementById('budget-model-sheet');
  if (!modal) {
    const container = document.getElementById('modals-container') || document.body;
    container.insertAdjacentHTML('beforeend', `
      <div class="tds-modal-overlay hd-sheet" id="budget-model-sheet" role="dialog" aria-modal="true" aria-label="금액 계산 방식">
        <div class="tds-modal-sheet">
          <div class="tds-modal-handle"></div>
          <div class="tds-modal-content" style="text-align:left" id="budget-model-sheet-body"></div>
        </div>
      </div>
    `);
    modal = document.getElementById('budget-model-sheet');
    modal.addEventListener('click', event => {
      if (event.target === modal) window.closeModal?.('budget-model-sheet');
    });
  }
  return modal;
}

function heroPeriodLabel(mode, monthKey, range) {
  if (mode !== 'month') return cycleLabelForRange(range);
  return `${monthKey} · ${elapsedMonthDayLabel(monthKey)}`;
}

function heroTitleLabel(mode, monthKey, homeMode) {
  if (mode !== 'month') {
    return homeMode ? `${periodLabelForMode(mode)} 조절비` : `${periodNounForMode(mode)} 지출`;
  }
  return homeMode ? `${monthKey} 조절비` : `${monthKey} 지출 합계`;
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
      <span>${periodLabelForMode(mode)} · ${txs.length}건</span>
    </div>
    ${categoryName === UNCATEGORIZED_CATEGORY_NAME ? uncategorizedBulkHtml(txs, STATE.categories) : ''}
    ${txs.length ? subcategorySummaryHtml(txs, { actionableUnassigned: true }) : ''}
    ${txs.length
      ? txs.map(tx => reportTxRow(tx)).join('')
      : '<div class="empty-state compact"><div>해당 기준의 거래가 없습니다</div></div>'}
    ${fundCoveredDrillHtml(fundCoveredTxsForCategory(mode === 'month' ? STATE.monthTxs : STATE.cycleTxs, categoryName))}
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
      <span>${periodLabelForMode(mode)} · ${txs.length}건 · 예산/소비 합계 제외</span>
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
  if (!['open-subcategory-classifier', 'open-tx-detail', 'toggle-reimbursement', 'apply-uncategorized'].includes(action)) return;

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

  if (action === 'apply-uncategorized') {
    applyUncategorizedGroup(actionTarget, modal);
    return;
  }

  if (action === 'toggle-reimbursement') {
    if (actionTarget.dataset.saving === 'true') return;
    const checked = actionTarget.dataset.checked !== 'true';
    reportToggleReimbursement(actionTarget.dataset.txId, checked, actionTarget);
  }
}

// 미분류 드릴의 '소비처별 일괄 정리' — 한 소비처의 미분류 거래를 한 번에 재분류한다.
async function applyUncategorizedGroup(actionTarget, modal) {
  // 버튼 자신도 data-uncat-key 를 갖고 있으므로 행은 클래스로 찾는다.
  const row = actionTarget.closest('.report-uncat-row');
  const select = row?.querySelector('[data-uncat-select]');
  const category = String(select?.value || '').trim();
  if (!category) {
    showToast('먼저 카테고리를 선택하세요.', 2000, 'error');
    return;
  }
  if (actionTarget.dataset.saving === 'true') return;
  const drill = STATE.activeDrill;
  const txs = drill ? txsForCategory(drill.categoryName, drill.mode) : [];
  const group = groupUncategorizedByParty(txs).find(item => item.key === actionTarget.dataset.uncatKey);
  if (!group?.txIds.length) {
    showToast('정리할 거래를 찾지 못했습니다.', 2000, 'error');
    return;
  }
  actionTarget.dataset.saving = 'true';
  actionTarget.disabled = true;
  const original = actionTarget.textContent;
  actionTarget.textContent = '적용 중…';
  try {
    for (const txId of group.txIds) {
      await updateTransaction(txId, { category, needsReview: false });
      patchLocalTx(txId, { category, needsReview: false });
    }
    showToast(`${group.label} ${group.txIds.length}건을 ${category}${josaRo(category)} 옮겼어요.`, 2000, 'success');
    refreshActiveReportDrill();
    await renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '일괄 정리 실패', 2600, 'error');
    actionTarget.dataset.saving = '';
    actionTarget.disabled = false;
    actionTarget.textContent = original;
  }
  void modal;
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
  const source = mode === 'month' ? STATE.monthTxs : STATE.cycleTxs;
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
  resolvePeriodStartDate,
  syncLocalPeriodStartDate,
  syncLocalPeriodMode,
  reportModeControlHtml,
  heroPeriodLabel,
  heroTitleLabel,
  elapsedMonthDayLabel,
};
