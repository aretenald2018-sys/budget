// ================================================================
// features/settings/screens/shared.js — 설정 10화면 공용 마크업 헬퍼
// ================================================================

import { escHtml } from '../../../utils/dom.js';
import { fmtKRW } from '../../../utils/format.js';

export { escHtml, fmtKRW };

export function switchHtml(name, checked, attrs = '') {
  return `
    <label class="tds-switch">
      <input type="checkbox" data-screen-field="${escHtml(name)}" ${checked ? 'checked' : ''} ${attrs}>
      <span class="tds-switch-slider"></span>
    </label>
  `;
}

export function radioHtml(name, value, label, checked) {
  return `
    <label class="settings-radio">
      <input type="radio" name="${escHtml(name)}" value="${escHtml(value)}" data-screen-field="${escHtml(name)}" ${checked ? 'checked' : ''}>
      <span>${escHtml(label)}</span>
    </label>
  `;
}

export function progressHtml(pct, tone = '') {
  const clamped = Math.min(100, Math.max(0, Number(pct) || 0));
  return `
    <div class="tds-progress"><div class="tds-progress-fill ${tone}" style="transform:scaleX(${(clamped / 100).toFixed(3)})"></div></div>
  `;
}

export function sectionHtml(title, bodyHtml, extraHead = '') {
  return `
    <div class="settings-screen-section">
      <div class="settings-screen-section-head"><h3>${escHtml(title)}</h3>${extraHead}</div>
      ${bodyHtml}
    </div>
  `;
}

export function rowHtml({ emoji = '', name = '', desc = '', right = '', attrs = '' }) {
  return `
    <div class="settings-row" ${attrs}>
      <div class="l">${emoji ? `<div class="ico">${emoji}</div>` : ''}<div><div class="name">${name}</div>${desc ? `<div class="desc">${desc}</div>` : ''}</div></div>
      <div class="r">${right}</div>
    </div>
  `;
}

export function primaryButtonHtml(action, label) {
  return `<button type="button" class="tds-btn settings-screen-cta" data-screen-action="${escHtml(action)}">${escHtml(label)}</button>`;
}

// 저장하기 화면의 미저장 이탈 가드: 폼 변경 시 overlay에 dirty 표시
export function markDirtyOnChange(body) {
  const overlay = body.closest('.settings-drill-overlay');
  if (!overlay) return;
  body.addEventListener('change', () => { overlay.dataset.dirty = 'true'; });
  body.addEventListener('input', () => { overlay.dataset.dirty = 'true'; });
}

export function clearDirty(body) {
  const overlay = body.closest('.settings-drill-overlay');
  if (overlay) delete overlay.dataset.dirty;
}

export function fmtWon(n) {
  return `${Math.round(Number(n) || 0).toLocaleString('ko-KR')}원`;
}

export function fmtSignedWon(n) {
  const v = Math.round(Number(n) || 0);
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('ko-KR')}원`;
}

export function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return blob;
}

export function localISODateTime(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

// 카테고리 정렬(설정 화면 공통)
export function sortedExpenseCategories(categories) {
  return (categories || [])
    .filter(c => c.kind === 'expense')
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
}
