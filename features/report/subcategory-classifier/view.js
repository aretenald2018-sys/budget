import { escHtml } from '../../../utils/dom.js';
import { fmtDateTime, fmtKRW } from '../../../utils/format.js';
import { UNASSIGNED_SUBCATEGORY_LABEL } from './state.js';

export function subcategoryClassifierHtml(txs, subcategories, mode) {
  const total = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const disabled = subcategories.length === 0;
  return `
    <form class="report-subcategory-classify-form">
      <div class="report-subcategory-classify-head">
        <strong>${escHtml(UNASSIGNED_SUBCATEGORY_LABEL)}</strong>
        <span>${mode === 'cycle' ? '이번 2주' : '이번 달'} · ${txs.length}건 · ${fmtKRW(total)}</span>
      </div>
      <label class="report-subcategory-target">
        <span>지정할 상세분류</span>
        <select class="tds-select" name="subcategory" ${disabled ? 'disabled' : ''}>
          ${subcategories.length
            ? subcategories.map(sub => `<option value="${escHtml(sub.name)}">${escHtml(sub.name)}</option>`).join('')
            : '<option value="">상세분류 없음</option>'}
        </select>
      </label>
      <label class="report-subcategory-select-all">
        <input type="checkbox" data-report-action="toggle-subcategory-all" checked>
        <span>전체 선택</span>
        <em data-selected-count>${txs.length}건 선택</em>
      </label>
      <div class="report-subcategory-classify-list">
        ${txs.map(subcategoryClassifierRowHtml).join('')}
      </div>
      <div class="report-subcategory-classify-actions">
        <button type="button" class="tds-btn secondary" data-report-action="close-subcategory-classifier">취소</button>
        <button type="button" class="tds-btn" data-report-action="save-subcategory-classifier" aria-label="선택 거래 저장" ${disabled ? 'disabled' : ''}>확인</button>
      </div>
    </form>
  `;
}

function subcategoryClassifierRowHtml(tx) {
  const isPos = tx.type === 'transfer_in' || tx.type === 'settlement_in';
  const sign = isPos ? '+' : '-';
  const meta = [fmtDateTime(tx.occurredAt), tx.memo].filter(Boolean).join(' · ');
  return `
    <label class="report-subcategory-check-row">
      <input type="checkbox" name="txIds" value="${escHtml(tx.id)}" checked>
      <span class="report-subcategory-check-body">
        <strong>${escHtml(tx.merchant || tx.counterparty || '미분류')}</strong>
        <small>${escHtml(meta)}</small>
      </span>
      <b class="${isPos ? 'amount-pos' : 'amount-neg'}">${sign}${fmtKRW(tx.amount)}</b>
    </label>
  `;
}
