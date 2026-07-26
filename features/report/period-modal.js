// ================================================================
// features/report/period-modal.js — 예산 기간 설정 모달 (홈/리포트 공용)
//
// 이 모달과 설정 › 전체 예산 화면은 같은 값을 고친다:
//   appSettings.budget.{cycle,cycleUnit,customDays} + appSettings.biweeklyStartDate
// 기간 판단은 전부 domain/budget/period.js를 거친다.
// ================================================================

import { getAppSettings, saveAppSettings } from '../../data.js';
import { reportState as STATE } from './state.js';
import { cycleDateRangeText, cycleRangeForDate, normalizeCycleAnchorDate } from '../../utils/cycles.js';
import {
  MAX_CUSTOM_DAYS,
  MIN_CUSTOM_DAYS,
  normalizeBudgetCycle,
  normalizeCustomDays,
  resolveBudgetPeriod,
} from '../../domain/budget/period.js';
import { escHtml } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

const MODAL_ID = 'home-cycle-settings-modal';

let refreshReport = async () => {};
let persistAnchor = () => {};

export function bindBudgetPeriodModal(callbacks = {}) {
  refreshReport = callbacks.refreshReport || refreshReport;
  persistAnchor = callbacks.persistAnchor || persistAnchor;
}

// 지금 적용 중인 기간. STATE에 없으면(첫 렌더 전) 기본값(2주)으로 떨어진다.
export function currentPeriod() {
  return STATE.budgetPeriod || resolveBudgetPeriod({});
}

export function openBudgetPeriodModal() {
  const modal = ensureModal();
  renderBody(modal);
  window.openModal(MODAL_ID);
}

// 홈의 기간 세그먼트/모달도 결국 appSettings.budget.cycle 하나를 고친다.
// 월 모드로 갈 때는 직전 주기 단위를 cycleUnit에 남겨 되돌아올 수 있게 한다.
export async function saveBudgetCycle(nextCycle, { modal = null } = {}) {
  const cycle = normalizeBudgetCycle(nextCycle);
  const previous = currentPeriod();
  const optimistic = resolveBudgetPeriod({
    cycle,
    cycleUnit: cycle === 'monthly' ? previous.cycleUnit : cycle,
    customDays: previous.customDays,
  });
  applyPeriod(optimistic);
  if (modal) renderBody(modal);
  try {
    const current = await getAppSettings();
    await saveAppSettings({
      budget: {
        ...current.budget,
        cycle: optimistic.cycle,
        cycleUnit: optimistic.cycleUnit,
        customDays: optimistic.customDays,
      },
    });
  } catch (err) {
    applyPeriod(previous);
    if (modal) renderBody(modal);
    showToast(err.message || '예산 주기 저장 실패', 2400, 'error');
  }
  await refreshReport();
}

export async function saveBudgetPeriodForm(form) {
  const formData = new FormData(form);
  const period = currentPeriod();
  const anchorDate = normalizeCycleAnchorDate(formData.get('biweeklyStartDate'));
  if (period.mode === 'cycle' && !anchorDate) {
    showToast('시작일을 선택하세요.', 1600, 'warning');
    return;
  }
  const customDays = formData.has('customDays')
    ? normalizeCustomDays(formData.get('customDays'), period.customDays)
    : period.customDays;
  const button = form.querySelector('button[type="submit"]');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    const current = await getAppSettings();
    const budget = {
      ...current.budget,
      cycle: period.cycle,
      cycleUnit: period.cycleUnit,
      customDays,
    };
    await saveAppSettings({ budget, ...(anchorDate ? { biweeklyStartDate: anchorDate } : {}) });
    const next = resolveBudgetPeriod(budget);
    applyPeriod(next);
    if (anchorDate) {
      persistAnchor(anchorDate);
      STATE.biweeklyStartDate = anchorDate;
      STATE.cycleRange = cycleRangeForDate(new Date(), anchorDate, next.cycleDays);
    }
    window.refreshAppHeader?.();
    showToast('예산 기간을 저장했어요.', 1400, 'success');
    window.closeModal?.(MODAL_ID);
    await refreshReport();
  } catch (err) {
    showToast(err.message || '기간 저장 실패', 2400, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function applyPeriod(period) {
  STATE.budgetPeriod = period;
  STATE.viewMode = period.mode;
  STATE.cycleDays = period.cycleDays;
  STATE.periodLabel = period.periodLabel;
}

function renderBody(modal) {
  const period = currentPeriod();
  const range = STATE.cycleRange || cycleRangeForDate(new Date(), STATE.biweeklyStartDate, period.cycleDays);
  modal.querySelector('#home-cycle-settings-body').innerHTML = periodControlHtml(STATE.biweeklyStartDate, range, period);
}

function periodControlHtml(anchorDate, range, period) {
  const value = normalizeCycleAnchorDate(anchorDate) || formatDateInput(range.start);
  const cycleOption = (cycle, label) => `
    <button type="button" class="${period.cycle === cycle ? 'on' : ''}" data-period-cycle="${cycle}" role="tab" aria-selected="${period.cycle === cycle}">${escHtml(label)}</button>
  `;
  return `
    <div class="hd-period-mode" role="tablist" aria-label="예산 주기 선택">
      ${cycleOption('biweekly', '2주')}
      ${cycleOption('weekly', '1주')}
      ${cycleOption('monthly', '매월')}
      ${cycleOption('custom', '직접')}
    </div>
    <form class="home-cycle-start-form home-cycle-start-modal-form" data-biweekly-start-form>
      ${period.cycle === 'custom' ? `
        <label class="home-cycle-start-field">
          <span>주기 일수</span>
          <input class="tds-input" type="number" name="customDays" min="${MIN_CUSTOM_DAYS}" max="${MAX_CUSTOM_DAYS}" value="${period.customDays}">
        </label>
      ` : ''}
      <label class="home-cycle-start-field" ${period.mode === 'month' ? 'hidden' : ''}>
        <span>${escHtml(period.unitLabel)} 시작일</span>
        <input class="tds-input" type="date" name="biweeklyStartDate" value="${escHtml(value)}">
      </label>
      <div class="home-cycle-range-preview">
        <span>현재 ${escHtml(period.mode === 'month' ? '달' : period.unitLabel)}</span>
        <strong>${period.mode === 'month' ? monthRangeText(new Date()) : cycleDateRangeText(range)}</strong>
      </div>
      <p class="home-cycle-modal-note">설정 › 전체 예산의 '예산 적용 주기'와 같은 값이에요.</p>
      <div class="home-cycle-modal-actions">
        <button class="tds-btn secondary" type="button" data-report-action="close-biweekly-start-settings">닫기</button>
        <button class="tds-btn primary" type="submit">저장</button>
      </div>
    </form>
  `;
}

function monthRangeText(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${start.getMonth() + 1}/${start.getDate()}–${end.getMonth() + 1}/${end.getDate()}`;
}

function formatDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function ensureModal() {
  let modal = document.getElementById(MODAL_ID);
  if (!modal) {
    const container = document.getElementById('modals-container') || document.body;
    container.insertAdjacentHTML('beforeend', `
      <div class="tds-modal-overlay home-cycle-settings-modal hd-sheet" id="${MODAL_ID}" role="dialog" aria-modal="true" aria-labelledby="home-cycle-settings-title">
        <div class="tds-modal-sheet home-cycle-settings-sheet">
          <div class="tds-modal-handle"></div>
          <div class="tds-modal-content">
            <div class="home-cycle-modal-head">
              <div class="tds-modal-title" id="home-cycle-settings-title">기간 설정</div>
              <button class="home-cycle-modal-close" type="button" data-report-action="close-biweekly-start-settings" aria-label="닫기">×</button>
            </div>
            <div id="home-cycle-settings-body"></div>
          </div>
        </div>
      </div>
    `);
    modal = document.getElementById(MODAL_ID);
  }
  bindModalEvents(modal);
  return modal;
}

function bindModalEvents(modal) {
  if (!modal || modal.dataset.biweeklyStartModalBound) return;
  modal.dataset.biweeklyStartModalBound = 'true';
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      window.closeModal(MODAL_ID);
      return;
    }
    // 모달은 탭 루트 밖(#modals-container)이라 주기 전환을 자체 처리한다.
    const cycleTarget = event.target?.closest?.('[data-period-cycle]');
    if (cycleTarget && modal.contains(cycleTarget)) {
      event.preventDefault();
      const nextCycle = normalizeBudgetCycle(cycleTarget.dataset.periodCycle);
      if (nextCycle !== currentPeriod().cycle) saveBudgetCycle(nextCycle, { modal });
      return;
    }
    const actionTarget = event.target?.closest?.('[data-report-action]');
    if (!actionTarget || !modal.contains(actionTarget)) return;
    if (actionTarget.dataset.reportAction === 'close-biweekly-start-settings') {
      event.preventDefault();
      window.closeModal(MODAL_ID);
    }
  });
  modal.addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-biweekly-start-form]');
    if (!form || !modal.contains(form)) return;
    event.preventDefault();
    saveBudgetPeriodForm(form);
  });
}
