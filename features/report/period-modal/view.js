// ================================================================
// features/report/period-modal/view.js — 기간 설정 시트의 순수 빌더
//
// 홈 상단 기간 버튼(⚙)이 여는 시트. 보기 모드(이번 2주/이번 달)와 2주 시작일을
// 한 곳에서 정한다. DOM 조작·저장은 controller 가 맡고 여기서는 문자열만 만든다.
// ================================================================

import {
  cycleDateRangeText,
  cycleRangeForDate,
  normalizeCycleAnchorDate,
} from '../../../utils/cycles.js';
import { escHtml } from '../../../utils/dom.js';

export function formatDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

// 고른 시작일로 기간이 어떻게 잡히는지. 시작일이 미래면 오늘은 아직 '이전 2주'에
// 속하는데, 그 사실을 말해주지 않으면 날짜를 바꿔도 아무 반응이 없어 보인다.
// (14의 배수만큼 떨어진 날짜는 실제로 같은 기간을 가리켜서 더 그렇게 보였다.)
export function cyclePreviewFor(anchorValue, now = new Date()) {
  const anchor = normalizeCycleAnchorDate(anchorValue);
  const range = cycleRangeForDate(now, anchor);
  let note = '';
  if (anchor) {
    const [year, month, day] = anchor.split('-').map(Number);
    const anchorDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    if (anchorDate.getTime() > today.getTime()) {
      note = `오늘은 아직 이전 2주예요. ${cycleDateRangeText(cycleRangeForDate(anchorDate, anchor))} 부터 새 2주가 시작돼요.`;
    }
  }
  return { rangeText: cycleDateRangeText(range), note };
}

export function biweeklyStartControlHtml(biweeklyStartDate, range, mode = 'cycle') {
  const value = normalizeCycleAnchorDate(biweeklyStartDate) || formatDateInput(range.start);
  const preview = cyclePreviewFor(value);
  return `
    <div class="hd-period-mode" role="tablist" aria-label="기간 보기 전환">
      <button type="button" class="${mode === 'cycle' ? 'on' : ''}" data-period-mode="cycle" role="tab" aria-selected="${mode === 'cycle'}">이번 2주</button>
      <button type="button" class="${mode === 'month' ? 'on' : ''}" data-period-mode="month" role="tab" aria-selected="${mode === 'month'}">이번 달</button>
    </div>
    <form class="home-cycle-start-form home-cycle-start-modal-form" data-biweekly-start-form>
      <label class="home-cycle-start-field">
        <span>2주 시작일</span>
        <input class="tds-input" type="date" name="biweeklyStartDate" value="${escHtml(value)}">
      </label>
      <div class="home-cycle-range-preview">
        <span>현재 2주</span>
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
