// ================================================================
// features/report/period-modal/view.js — 기간 설정 시트의 순수 빌더
//
// 홈 상단 기간 버튼(⚙)이 여는 시트. 보기 모드(이번 1주/이번 2주/이번 달)와 그 모드의
// 시작일을 한 곳에서 정한다. DOM 조작·저장은 controller 가 맡고 여기서는 문자열만 만든다.
//
// 시작일은 모드마다 따로다 — 1주 보기는 weeklyStartDate, 2주 보기는 biweeklyStartDate.
// 그래서 이 시트는 지금 고른 모드의 입력칸 하나만 보여준다(매월은 달력 기준이라 없다).
// ================================================================

import {
  cycleDateRangeText,
  cycleRangeForDate,
  normalizeCycleAnchorDate,
} from '../../../utils/cycles.js';
import {
  VIEW_MODES,
  periodDaysForMode,
  periodLabelForMode,
  periodNounForMode,
} from '../../../domain/budget/model.js';
import { escHtml } from '../../../utils/dom.js';

export function formatDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

// 고른 시작일로 기간이 어떻게 잡히는지. 시작일이 미래면 오늘은 아직 '이전 기간'에
// 속하는데, 그 사실을 말해주지 않으면 날짜를 바꿔도 아무 반응이 없어 보인다.
// (기간 길이의 배수만큼 떨어진 날짜는 실제로 같은 기간을 가리켜서 더 그렇게 보였다.)
export function cyclePreviewFor(anchorValue, now = new Date(), cycleDays = 14) {
  const anchor = normalizeCycleAnchorDate(anchorValue);
  const range = cycleRangeForDate(now, anchor, cycleDays);
  const noun = Number(cycleDays) === 7 ? '1주' : '2주';
  let note = '';
  if (anchor) {
    const [year, month, day] = anchor.split('-').map(Number);
    const anchorDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    if (anchorDate.getTime() > today.getTime()) {
      const nextText = cycleDateRangeText(cycleRangeForDate(anchorDate, anchor, cycleDays));
      note = `오늘은 아직 이전 ${noun}예요. ${nextText} 부터 새 ${noun}가 시작돼요.`;
    }
  }
  return { rangeText: cycleDateRangeText(range), note };
}

export function periodStartControlHtml({ mode = 'cycle', anchor = '', range = null, field = 'biweeklyStartDate' } = {}) {
  const tabs = `
    <div class="hd-period-mode" role="tablist" aria-label="기간 보기 전환">
      ${VIEW_MODES.map(item => `
        <button type="button" class="${mode === item ? 'on' : ''}" data-period-mode="${item}" role="tab" aria-selected="${mode === item}">${periodLabelForMode(item)}</button>
      `).join('')}
    </div>
  `;
  if (mode === 'month') {
    return `
      ${tabs}
      <div class="home-cycle-range-preview">
        <span>기준</span>
        <strong>달력 1일 – 말일</strong>
      </div>
      <small class="home-cycle-range-note">매월 보기는 달력 기준이라 따로 정할 시작일이 없어요.</small>
    `;
  }
  const noun = periodNounForMode(mode);
  const cycleDays = periodDaysForMode(mode);
  const value = normalizeCycleAnchorDate(anchor) || formatDateInput(range?.start);
  const preview = cyclePreviewFor(value, new Date(), cycleDays);
  return `
    ${tabs}
    <form class="home-cycle-start-form home-cycle-start-modal-form" data-period-start-form="${escHtml(mode)}">
      <label class="home-cycle-start-field">
        <span>${escHtml(noun)} 시작일</span>
        <input class="tds-input" type="date" name="${escHtml(field)}" data-period-start-input value="${escHtml(value)}">
      </label>
      <div class="home-cycle-range-preview">
        <span>현재 ${escHtml(noun)}</span>
        <strong data-cycle-range-preview>${preview.rangeText}</strong>
      </div>
      <small class="home-cycle-range-note" data-cycle-range-note ${preview.note ? '' : 'hidden'}>${escHtml(preview.note)}</small>
      <div class="home-cycle-modal-actions">
        <button class="tds-btn secondary" type="button" data-report-action="close-biweekly-start-settings">닫기</button>
        <button class="tds-btn primary" type="submit">저장</button>
      </div>
    </form>
  `;
}
