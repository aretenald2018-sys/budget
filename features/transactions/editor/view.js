import { escHtml } from '../../../utils/dom.js';
import { fmtDateTime, fmtKRW } from '../../../utils/format.js';

const TYPE_LABELS = {
  card_payment: '카드 결제',
  transfer_out: '이체 (출금)',
  transfer_in: '이체 (입금)',
  internal_transfer: '내부 이체',
  settlement_in: '정산 받음',
  settlement_out: '정산 보냄',
};

export function transactionEditorHtml({
  tx,
  accounts = [],
  categories = [],
  funds = [],
  receiptHtml = '',
  uncategorizedName = '미분류',
  reimbursementExpected = false,
} = {}) {
  const categoryOptions = groupedCategoryOptions(categories, tx.category, uncategorizedName);
  const isAmountPos = tx.type === 'transfer_in' || tx.type === 'settlement_in';
  return `
    <div class="tx-receipt-head">
      <div>
        <span>${TYPE_LABELS[tx.type] || escHtml(tx.type)} · ${fmtDateTime(tx.occurredAt)}</span>
        <strong>${escHtml(tx.merchant || tx.counterparty || '미분류')}</strong>
      </div>
      <em class="${isAmountPos ? 'amount-pos' : 'amount-neg'}">
        ${isAmountPos ? '+' : '-'}${fmtKRW(tx.amount).replace('-', '')}
      </em>
    </div>
    <form id="tx-edit-form" data-tx-id="${escHtml(tx.id)}">
      <div class="tx-receipt-form">
        ${sharedPaymentHtml(tx)}
        ${fundAssignPanel(tx, funds)}
        ${reimbursementPanel(reimbursementExpected, { disabled: !!tx.fundId })}
        <label class="tx-receipt-row">
          <span>금액</span>
          <input class="tds-input" name="amount" inputmode="numeric" value="${Number(tx.amount) || 0}" required>
        </label>

        <label class="tx-receipt-row">
          <span>카테고리</span>
          <select class="tds-select" name="category">
            <option value="" ${!tx.category || tx.category === uncategorizedName ? 'selected' : ''}>미분류</option>
            ${categoryOptions}
          </select>
        </label>

        <details class="tx-receipt-details" id="tx-subcategory-details">
          <summary>
            <span>상세분류</span>
            <strong>${escHtml(tx.subcategory || '미지정')}</strong>
          </summary>
          <div class="tx-receipt-block" id="tx-subcategory-editor">
            ${subcategoryEditorHtml(categories, tx.category, tx.subcategory)}
          </div>
        </details>

        <label class="tx-receipt-row">
          <span>계좌</span>
          <select class="tds-select" name="accountId">
            <option value="">미지정</option>
            ${accounts.map(account => `
              <option value="${escHtml(account.id)}" ${tx.accountId === account.id ? 'selected' : ''}>
                ${escHtml(account.alias)}${account.last4 ? ` (${escHtml(account.last4)})` : ''}
              </option>
            `).join('')}
          </select>
        </label>

        <label class="tx-receipt-row">
          <span>가맹점 / 상대</span>
          <input class="tds-input" name="merchant" value="${escHtml(tx.merchant || tx.counterparty || '')}">
        </label>

        <label class="tx-receipt-block">
          <span>메모</span>
          <textarea class="tds-textarea" name="memo">${escHtml(tx.memo || '')}</textarea>
        </label>
      </div>

      ${tx.needsReview ? `
        <div class="form-group">
          <label>
            <input type="checkbox" name="confirmReview" checked> 분류 확정 (리뷰 큐에서 제거)
          </label>
        </div>
      ` : ''}

      ${receiptHtml}

      ${tx.body ? `
        <div class="section-title" style="margin-top:16px">원문</div>
        <div class="tds-card" style="font-family:var(--font-mono);font-size:12px;white-space:pre-wrap">${escHtml(tx.body)}</div>
      ` : ''}

      <div class="flex gap-md" style="margin-top:24px">
        <button type="button" class="tds-btn ghost" data-tx-editor-action="delete">삭제</button>
        <button type="button" class="tds-btn secondary" data-tx-editor-action="cancel">취소</button>
        <button type="submit" class="tds-btn" style="flex:1">저장</button>
      </div>
    </form>
  `;
}

export function reimbursementPanel(checked = false, { disabled = false } = {}) {
  const helpText = '체크하면 홈 히어로와 월간 캘린더 소비금액에서는 빠지고, 환급예정금액으로 따로 집계됩니다.';
  return `
    <div class="tx-refund-panel ${checked ? 'active' : ''}">
      <label class="tx-refund-check">
        <input type="checkbox" name="reimbursementExpected" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span>환급예정</span>
      </label>
      <span class="tx-refund-help" tabindex="0" aria-label="${escHtml(helpText)}" title="${escHtml(helpText)}" data-tooltip="${escHtml(helpText)}">?</span>
    </div>
  `;
}

export function fundAssignPanel(tx = {}, funds = []) {
  if (!['card_payment', 'transfer_out'].includes(tx.type)) return '';
  const currentFundId = String(tx.fundId || '');
  const rows = Array.isArray(funds) ? funds.filter(fund => fund.active || fund.id === currentFundId) : [];
  if (!rows.length && !currentFundId) return '';
  const historyOnly = currentFundId && !rows.some(fund => fund.id === currentFundId)
    ? `<option value="${escHtml(currentFundId)}" selected>${escHtml(tx.fundLabel || '이전 충당금')}</option>`
    : '';
  return `
    <div class="tx-refund-panel tx-fund-panel ${currentFundId ? 'active' : ''}">
      <label class="tx-refund-check" style="flex:1">
        <span>충당금에서 차감</span>
        <select class="tds-select" name="fundId" style="flex:1;margin-left:8px">
          <option value="">사용 안 함</option>
          ${rows.map(fund => `
            <option value="${escHtml(fund.id)}" data-fund-label="${escHtml(fund.name)}" ${fund.id === currentFundId ? 'selected' : ''}>
              ${escHtml(fund.emoji)} ${escHtml(fund.name)}
            </option>
          `).join('')}
          ${historyOnly}
        </select>
      </label>
      <span class="tx-refund-help" tabindex="0" data-tooltip="선택하면 이 지출은 2주 예산에서 빠지고 충당금 잔액에서 차감됩니다.">?</span>
    </div>
  `;
}

export function getTypeEmoji(type) {
  return ({
    card_payment: '💳',
    transfer_out: '↗️',
    transfer_in: '↙️',
    internal_transfer: '🔄',
    settlement_in: '💰',
    settlement_out: '💸',
  })[type] || '📦';
}

export function sharedPaymentHtml(tx) {
  if (!isShareableTx(tx)) return '';
  const merchant = escHtml(tx.merchant || tx.counterparty || '이 결제처');
  if (tx.sharedPayment?.status === 'applied') {
    return `
      <div class="tx-shared-row">
        <div>
          <span>나눠낸 결제</span>
          <strong>${tx.sharedPayment.peopleCount || 2}명 기준 · 내 부담 ${fmtKRW(tx.sharedPayment.myAmount || tx.amount)}</strong>
        </div>
        <div class="tx-shared-actions" aria-label="나눠낸 결제 다시 계산">
          ${sharedPaymentButtons(tx.id)}
        </div>
      </div>
    `;
  }
  return `
    <div class="tx-shared-row">
      <div>
        <span>나눠낸 결제</span>
        <strong>${merchant} 같이 쓴 결제라면</strong>
      </div>
      <div class="tx-shared-actions" aria-label="나눠낸 결제 인원 선택">
        ${sharedPaymentButtons(tx.id)}
      </div>
      <label class="tx-shared-remember">
        <input type="checkbox" id="shared-remember-${escHtml(tx.id)}">
        다음에도 자동
      </label>
    </div>
  `;
}

export function groupedCategoryOptions(categories, selectedName, uncategorizedName = '미분류') {
  const expense = categories
    .filter(category => category.kind === 'expense' && category.name !== uncategorizedName)
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
  const income = categories.filter(category => category.kind === 'income');
  const groups = {};
  for (const category of expense) {
    const parent = category.parent || '기타';
    if (!groups[parent]) groups[parent] = [];
    groups[parent].push(category);
  }
  const expenseHtml = Object.entries(groups).map(([parent, rows]) => `
    <optgroup label="${escHtml(parent)}">
      ${rows.map(category => `<option value="${escHtml(category.name)}" ${selectedName === category.name ? 'selected' : ''}>${category.emoji || ''} ${escHtml(category.name)}</option>`).join('')}
    </optgroup>
  `).join('');
  const incomeHtml = income.length ? `
    <optgroup label="수입">
      ${income.map(category => `<option value="${escHtml(category.name)}" ${selectedName === category.name ? 'selected' : ''}>${category.emoji || ''} ${escHtml(category.name)}</option>`).join('')}
    </optgroup>
  ` : '';
  return expenseHtml + incomeHtml;
}

export function subcategoryEditorHtml(categories, categoryName, selectedName) {
  const category = categories.find(item => item.name === categoryName);
  const subs = normalizeSubcategories(category?.subcategories);
  const disabled = !categoryName;
  return `
    <label>상세분류</label>
    <div class="subcategory-editor">
      <select class="tds-select" name="subcategory" ${disabled ? 'disabled' : ''}>
        <option value="">미지정</option>
        ${subs.map(sub => `<option value="${escHtml(sub.name)}" data-id="${escHtml(sub.id)}" ${selectedName === sub.name ? 'selected' : ''}>${escHtml(sub.name)}</option>`).join('')}
      </select>
      <input class="tds-input" name="subcategoryDraft" value="${escHtml(selectedName || '')}" placeholder="${disabled ? '카테고리 선택 후 등록' : '예: 식재료비'}" ${disabled ? 'disabled' : ''}>
      <div class="subcategory-actions">
        <button type="button" class="tds-btn sm secondary" data-subcategory-action="add" ${disabled ? 'disabled' : ''}>추가</button>
        <button type="button" class="tds-btn sm secondary" data-subcategory-action="rename" ${disabled ? 'disabled' : ''}>수정</button>
        <button type="button" class="tds-btn sm ghost" data-subcategory-action="delete" ${disabled ? 'disabled' : ''}>삭제</button>
      </div>
    </div>
    <div class="st4" style="margin-top:6px">상세분류는 이 카테고리의 거래 요약에 사용됩니다.</div>
  `;
}

export function normalizeSubcategories(value) {
  return Array.isArray(value)
    ? value.map((item, index) => typeof item === 'string'
      ? { id: `legacy_${index}`, name: item }
      : { id: item.id || `legacy_${index}`, name: item.name || '' })
      .filter(item => item.name)
    : [];
}

function isShareableTx(tx) {
  return ['card_payment', 'transfer_out'].includes(tx.type) && Number(tx.amount) > 0;
}

function sharedPaymentButtons(txId) {
  return [2, 3, 4].map(peopleCount => `
    <button type="button" class="tds-btn sm secondary" data-tx-editor-action="shared-payment" data-tx-id="${escHtml(txId)}" data-people-count="${peopleCount}">${peopleCount}명</button>
  `).join('');
}
