// ================================================================
// features/report/period-modal/controller.js — 기간 설정 시트의 동작
//
// 홈 상단 기간 pill(⚙)이 여는 시트: 보기 모드 전환과 그 모드의 시작일 저장.
// 시작일은 모드마다 다른 필드에 들어간다(1주 → weeklyStartDate, 2주 → biweeklyStartDate).
//
// 모달은 탭 루트 밖(#modals-container)에 붙어서 리포트 루트의 위임 리스너가 닿지 않는다.
// 그래서 자기 클릭·입력·제출을 여기서 직접 처리한다.
// ================================================================

import { saveAppSettings } from '../../../data.js';
import { reportState as STATE } from '../state.js';
import { cycleRangeForDate, normalizeCycleAnchorDate } from '../../../utils/cycles.js';
import { VIEW_MODES, periodDaysForMode, periodLabelForMode } from '../../../domain/budget/model.js';
import { cyclePreviewFor, periodStartControlHtml } from './view.js';
import { showToast } from '../../../utils/toast.js';

// 보기 모드별 시작일(앵커). 저장 필드와 localStorage 미러 키가 짝을 이룬다.
const PERIOD_START_FIELDS = { week: 'weeklyStartDate', cycle: 'biweeklyStartDate' };
const PERIOD_START_KEYS = {
  week: 'budget.weeklyStartDate',
  cycle: 'budget.biweeklyStartDate',
};
// 앱 헤더의 기간 pill 은 홈 렌더보다 먼저 그려진다. 지금 보고 있는 기간을 알 수 있게
// 마지막 보기 모드를 남겨둔다(예전에는 무슨 주기든 '격주'라고 적혀 있었다).
const PERIOD_MODE_KEY = 'budget.periodMode';

let renderReport = async () => {};

export function configurePeriodModal(callbacks = {}) {
  renderReport = callbacks.renderReport || renderReport;
}

export function normalizeViewMode(value) {
  return VIEW_MODES.includes(value) ? value : 'cycle';
}

export function periodStartField(mode) {
  return PERIOD_START_FIELDS[mode] || PERIOD_START_FIELDS.cycle;
}

export function localAppSettingsFallback() {
  return {
    homeManagedCategoryIds: [],
    weeklyStartDate: readLocalStorage(PERIOD_START_KEYS.week),
    biweeklyStartDate: readLocalStorage(PERIOD_START_KEYS.cycle),
    rewardSavings: {},
  };
}

// 앵커는 보기 모드가 고른다: 1주 보기는 weeklyStartDate, 2주 보기는 biweeklyStartDate.
// 예산 주기와는 별개라, 매월 예산인 사람이 잠깐 1주로 봐도 자기 1주 시작일을 쓴다.
export function resolvePeriodStartDate(appSettings = {}, mode = 'cycle') {
  const field = periodStartField(mode);
  const key = PERIOD_START_KEYS[mode] || PERIOD_START_KEYS.cycle;
  return normalizeCycleAnchorDate(appSettings[field])
    || normalizeCycleAnchorDate(readLocalStorage(key));
}

export function syncLocalPeriodMode(mode) {
  writeLocalStorage(PERIOD_MODE_KEY, normalizeViewMode(mode));
}

export function syncLocalPeriodStartDate(mode, value) {
  const key = PERIOD_START_KEYS[mode] || PERIOD_START_KEYS.cycle;
  const normalized = normalizeCycleAnchorDate(value);
  if (normalized) {
    writeLocalStorage(key, normalized);
  } else {
    removeLocalStorage(key);
  }
}

export function openPeriodSettings() {
  const modal = ensurePeriodModal();
  renderPeriodModalBody(modal);
  window.openModal('home-cycle-settings-modal');
}

function renderPeriodModalBody(modal) {
  const mode = STATE.viewMode;
  const anchor = STATE[periodStartField(mode)] || '';
  const range = STATE.cycleRange || cycleRangeForDate(new Date(), anchor, periodDaysForMode(mode));
  modal.querySelector('#home-cycle-settings-body').innerHTML = periodStartControlHtml({
    mode,
    anchor,
    range,
    field: periodStartField(mode),
  });
}

function ensurePeriodModal() {
  let modal = document.getElementById('home-cycle-settings-modal');
  if (!modal) {
    const container = document.getElementById('modals-container') || document.body;
    container.insertAdjacentHTML('beforeend', `
      <div class="tds-modal-overlay home-cycle-settings-modal hd-sheet" id="home-cycle-settings-modal" role="dialog" aria-modal="true" aria-labelledby="home-cycle-settings-title">
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
    modal = document.getElementById('home-cycle-settings-modal');
  }
  bindPeriodModal(modal);
  return modal;
}

function bindPeriodModal(modal) {
  if (!modal || modal.dataset.biweeklyStartModalBound) return;
  modal.dataset.biweeklyStartModalBound = 'true';
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      window.closeModal('home-cycle-settings-modal');
      return;
    }
    // 모달은 탭 루트 밖(#modals-container)이라 보기 모드 전환을 자체 처리한다.
    const modeTarget = event.target?.closest?.('[data-period-mode]');
    if (modeTarget && modal.contains(modeTarget)) {
      event.preventDefault();
      const nextMode = normalizeViewMode(modeTarget.dataset.periodMode);
      if (nextMode !== STATE.viewMode) {
        STATE.viewMode = nextMode;
        STATE.viewModeUserSet = true;
        renderPeriodModalBody(modal);
        renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
      }
      return;
    }
    const actionTarget = event.target?.closest?.('[data-report-action]');
    if (!actionTarget || !modal.contains(actionTarget)) return;
    if (actionTarget.dataset.reportAction === 'close-biweekly-start-settings') {
      event.preventDefault();
      window.closeModal('home-cycle-settings-modal');
    }
  });
  // 저장하기 전에도 고른 날짜로 기간이 어떻게 잡히는지 바로 보여준다.
  // 이게 없어서 날짜를 바꿔도 '현재 2주'가 꿈쩍하지 않았고, 설정이 먹지 않는 것처럼 보였다.
  modal.addEventListener('input', event => {
    const input = event.target?.closest?.('[data-period-start-input]');
    if (!input || !modal.contains(input)) return;
    const preview = cyclePreviewFor(input.value, new Date(), periodDaysForMode(STATE.viewMode));
    const rangeEl = modal.querySelector('[data-cycle-range-preview]');
    const noteEl = modal.querySelector('[data-cycle-range-note]');
    if (rangeEl) rangeEl.textContent = preview.rangeText;
    if (noteEl) {
      noteEl.textContent = preview.note;
      noteEl.hidden = !preview.note;
    }
  });
  modal.addEventListener('submit', event => {
    const form = event.target?.closest?.('[data-period-start-form]');
    if (!form || !modal.contains(form)) return;
    event.preventDefault();
    savePeriodStartDate(form);
  });
}

// 시작일은 보기 모드의 앵커 필드에 저장한다(1주 → weeklyStartDate, 2주 → biweeklyStartDate).
// 서로 다른 필드라 1주 시작일을 정해도 2주 시작일이 덮이지 않는다.
export async function savePeriodStartDate(form) {
  const mode = normalizeViewMode(form.dataset.periodStartForm);
  const field = periodStartField(mode);
  const startDate = normalizeCycleAnchorDate(new FormData(form).get(field));
  if (!startDate) {
    showToast('시작일을 선택하세요.', 1600, 'warning');
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await saveAppSettings({ [field]: startDate });
    syncLocalPeriodStartDate(mode, startDate);
    STATE[field] = startDate;
    STATE.cycleRange = cycleRangeForDate(new Date(), startDate, periodDaysForMode(mode));
    window.refreshAppHeader?.();
    showToast(`${periodLabelForMode(mode)} 시작일을 저장했어요.`, 1400, 'success');
    window.closeModal?.('home-cycle-settings-modal');
    await renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '시작일 저장 실패', 2400, 'error');
  } finally {
    if (button) button.disabled = false;
  }
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
