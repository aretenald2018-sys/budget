import { conditionProgress, isBinaryConditionType } from './conditions.js?v=20260505-visual-modal';
import { escHtml } from '../utils/dom.js';

export function choiceConditionEditFields(condition, id, options = {}) {
  if (condition.type === 'date') {
    return `
      ${hiddenFields(condition, id, ['DueDate', 'Done'])}
      <div class="tx-receipt-row condition-date-field">
        <span>날짜</span>
        <input class="tds-input" name="conditionDueDate:${escAttr(id)}" type="date" value="${escAttr(condition.dueDate || '')}">
      </div>
      ${deleteButton(id, options)}
    `;
  }
  if (condition.type === 'amount') {
    return `
      ${hiddenFields(condition, id, ['Current', 'Target'])}
      <div class="tx-receipt-row condition-number-fields">
        <span>현재 금액</span>
        <input class="tds-input" name="conditionCurrent:${escAttr(id)}" inputmode="numeric" value="${numericValue(condition.current)}" placeholder="0">
      </div>
      <div class="tx-receipt-row condition-number-fields">
        <span>목표 금액</span>
        <input class="tds-input" name="conditionTarget:${escAttr(id)}" inputmode="numeric" value="${numericValue(condition.target)}" placeholder="0">
      </div>
      ${deleteButton(id, options)}
    `;
  }
  if (condition.type === 'number') {
    return `
      ${hiddenFields(condition, id, ['Current', 'Target', 'Unit'])}
      <div class="tx-receipt-row condition-number-fields">
        <span>현재</span>
        <input class="tds-input" name="conditionCurrent:${escAttr(id)}" inputmode="numeric" value="${numericValue(condition.current)}" placeholder="0">
      </div>
      <div class="tx-receipt-row condition-number-fields">
        <span>목표</span>
        <input class="tds-input" name="conditionTarget:${escAttr(id)}" inputmode="numeric" value="${numericValue(condition.target)}" placeholder="0">
      </div>
      <div class="tx-receipt-row condition-unit-field">
        <span>단위</span>
        <input class="tds-input" name="conditionUnit:${escAttr(id)}" value="${escAttr(condition.unit || '')}">
      </div>
      ${deleteButton(id, options)}
    `;
  }
  return `
    ${hiddenFields(condition, id, ['Done'])}
    <label class="tx-shared-remember choice-pact-condition-check">
      <input type="checkbox" name="conditionDone:${escAttr(id)}" ${conditionProgress(condition) >= 1 ? 'checked' : ''}>
      ${condition.type === 'diet' ? '다이어트 성공함' : '완료됨'}
    </label>
    ${deleteButton(id, options)}
  `;
}

function hiddenFields(condition, id, visibleFields = []) {
  const visible = new Set(visibleFields);
  const unit = condition.unit || (condition.type === 'amount' ? '원' : '');
  const rows = [
    ['Type', condition.type],
    ['Label', condition.label],
    ['DueDate', condition.dueDate || ''],
    ['Current', condition.current ?? ''],
    ['Target', condition.target ?? ''],
    ['Unit', unit],
    ['Note', condition.note || ''],
  ];
  const fields = rows
    .filter(([key]) => !visible.has(key))
    .map(([key, value]) => `<input type="hidden" name="condition${key}:${escAttr(id)}" value="${escAttr(value == null ? '' : String(value))}">`);
  if (isBinaryConditionType(condition.type) && condition.done && !visible.has('Done')) {
    fields.push(`<input type="hidden" name="conditionDone:${escAttr(id)}" value="on">`);
  }
  return fields.join('');
}

function deleteButton(id, options = {}) {
  return `
    <div class="tx-shared-row choice-condition-actions">
      <span></span>
      <button type="button" class="choice-pact-condition-remove" data-choice-detail-action="${options.deleteAction || 'delete-condition'}" ${options.ownerAttrs || ''} data-condition-id="${escAttr(id)}">조건 삭제</button>
    </div>
  `;
}

function numericValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? escAttr(String(n)) : '';
}

function escAttr(value) {
  return escHtml(String(value || ''));
}
