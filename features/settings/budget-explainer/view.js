// ================================================================
// features/settings/budget-explainer/view.js — 예산 계산식 설명 블록 (순수 빌더)
//
// 설정 > 전체 예산 과 홈 히어로 ⓘ 가 같은 정의를 쓰도록 한 곳에서 만든다.
// 예전에는 홈 ⓘ 가 한 줄짜리 토스트("예산에서 쓴 돈과 충당금을 뺀 여윳돈")를
// 띄웠고 재배분·고정비는 아무 데도 설명이 없었다.
// ================================================================

import { buildBudgetBreakdown } from '../../../domain/budget/model.js';
import { escHtml } from '../../../utils/dom.js';
import { fmtKRW } from '../../../utils/format.js';

function signedWon(value, sign) {
  const amount = Math.abs(Math.round(Number(value) || 0));
  if (sign === '−') return `− ${fmtKRW(amount)}`;
  if (sign === '+') return `+ ${fmtKRW(amount)}`;
  return fmtKRW(amount);
}

// numbers 를 주면 실제 값이 들어간 계산 내역, 안 주면 설명만 있는 뼈대.
export function budgetModelHtml(numbers = {}, options = {}) {
  const model = buildBudgetBreakdown(numbers);
  const showValues = options.showValues !== false;
  const rows = model.rows
    .filter(row => showValues || row.key !== 'adjustments' || row.value)
    .map(row => `
      <div class="budget-model-row">
        <div class="budget-model-row-head">
          <span class="budget-model-op">${escHtml(row.sign || '')}</span>
          <strong>${escHtml(row.label)}</strong>
          ${showValues ? `<b class="${row.value < 0 ? 'neg' : ''}">${escHtml(signedWon(row.value, ''))}</b>` : ''}
        </div>
        <small>${escHtml(row.hint)}</small>
      </div>
    `).join('');

  return `
    <div class="budget-model">
      <div class="budget-model-head">
        <strong>이 금액은 이렇게 나와요</strong>
        <span>고정비 · 충당금 · 재배분이 어떻게 얽히는지 한눈에 보기</span>
      </div>
      <div class="budget-model-rows">${rows}</div>
      <div class="budget-model-total">
        <span>지금 써도 되는 돈</span>
        <strong class="${model.amount < 0 ? 'neg' : ''}">${escHtml(fmtKRW(model.amount))}</strong>
      </div>
      <div class="budget-model-note">
        <span class="budget-model-chip">고정비</span>
        <small>${escHtml(model.fixedHint)}${model.fixedMonthly ? ` 이번 달 고정비는 ${fmtKRW(model.fixedMonthly)}이에요.` : ''}</small>
      </div>
    </div>
  `;
}

// 설정 화면 상단에 접어두는 형태. 처음 쓰는 사람이 열어볼 수 있게 열림 기본값.
export function budgetModelDetailsHtml(numbers = {}, { open = false } = {}) {
  return `
    <details class="budget-model-details" ${open ? 'open' : ''}>
      <summary>예산 · 고정비 · 충당금은 어떤 관계인가요?</summary>
      ${budgetModelHtml(numbers)}
    </details>
  `;
}
