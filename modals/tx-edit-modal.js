// ================================================================
// modals/tx-edit-modal.js — 거래 상세/수정
// 영수증 품목 표시, 카테고리 변경, 메모, 분류 확정 (needsReview=false)
// ================================================================

import {
  getTransaction, getAccounts, getCategories, getReceipt,
  UNCATEGORIZED_CATEGORY_NAME, isReimbursementExpected,
} from '../data.js';
import { showToast } from '../utils/toast.js';
import { fmtKRW } from '../utils/format.js';
import { $, escHtml } from '../utils/dom.js';
import {
  getTypeEmoji,
  groupedCategoryOptions,
  transactionEditorHtml,
} from '../features/transactions/editor/view.js';
import {
  bindTransactionAddController,
  bindTransactionDetailController,
  configureTransactionModalController,
} from '../features/transactions/editor/controller.js';

let txDetailRequestVersion = 0;

export const MODAL_HTML = `
<div class="tds-modal-overlay" id="tx-edit-modal">
  <div class="tds-modal-sheet">
    <div class="tds-modal-handle"></div>
    <div class="tds-modal-content" style="text-align:left">
      <div class="tds-modal-title">거래 상세</div>
      <div id="tx-edit-body"></div>
    </div>
  </div>
</div>
`;

export async function openTxEditModal(txId) {
  const requestVersion = ++txDetailRequestVersion;
  const body = ensureTxEditModalBody();
  if (!body) {
    showToast('거래 상세 화면을 준비하지 못했습니다.', 2600, 'error');
    return;
  }

  window.openModal('tx-edit-modal');
  body.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';

  try {
    const tx = await getTransaction(txId);
    if (requestVersion !== txDetailRequestVersion) return;
    if (!tx) {
      body.innerHTML = '<div class="empty-state">거래를 찾을 수 없음</div>';
      return;
    }

    const accounts = getAccounts();
    const categories = getCategories();
    // 영수증 (있으면)
    let receiptHtml = '';
    const receiptIds = normalizeReceiptIds(tx);
    if (receiptIds.length) {
      const receiptResults = await Promise.allSettled(receiptIds.map(id => getReceipt(id)));
      const receipts = [];
      let failedReceiptCount = 0;
      receiptResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value) receipts.push(result.value);
          return;
        }
        failedReceiptCount += 1;
        console.warn('[tx-edit-modal] receipt load failed', receiptIds[index], result.reason);
      });
      if (failedReceiptCount > 0) {
        receiptHtml += `
          <div class="section-title" style="margin-top:16px">연결 영수증</div>
          <div class="tds-card st4">영수증 ${failedReceiptCount}건을 불러오지 못했습니다. 거래 수정은 계속할 수 있어요.</div>`;
      }
      for (const r of receipts.filter(Boolean)) {
        const itemsHtml = (r.items || []).map(it =>
          `<div class="item"><span class="name">${escHtml(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ''}</span><span class="price">${fmtKRW(it.price * (it.qty || 1))}</span></div>`
        ).join('');
        receiptHtml += `
          <div class="section-title" style="margin-top:16px">📄 ${escHtml(r.merchant)} 영수증</div>
          <div class="receipt-items">${itemsHtml || '<div class="st3">품목 없음</div>'}</div>`;
      }
    }
    if (requestVersion !== txDetailRequestVersion) return;

    body.innerHTML = transactionEditorHtml({
      tx,
      accounts,
      categories,
      receiptHtml,
      uncategorizedName: UNCATEGORIZED_CATEGORY_NAME,
      reimbursementExpected: isReimbursementExpected(tx),
    });
    bindTransactionDetailController(body);
  } catch (err) {
    if (requestVersion !== txDetailRequestVersion) return;
    console.error('[tx-edit-modal] failed to render detail', err);
    body.innerHTML = txDetailErrorHtml(txId, err);
    showToast('거래 상세를 불러오지 못했습니다.', 2600, 'error');
  }
}

function normalizeReceiptIds(tx = {}) {
  const ids = Array.isArray(tx.receiptIds) ? tx.receiptIds.slice() : [];
  if (!ids.length && tx.receiptId) ids.push(tx.receiptId);
  return ids.map(id => String(id || '').trim()).filter(Boolean);
}

function ensureTxEditModalBody() {
  if (!document.getElementById('tx-edit-modal')) {
    const container = document.getElementById('modals-container') || document.body;
    container.insertAdjacentHTML('beforeend', MODAL_HTML);
  }
  return $('#tx-edit-body');
}

function txDetailErrorHtml(txId, err) {
  const message = err?.message ? `오류: ${escHtml(err.message)}` : '잠시 후 다시 시도하세요.';
  return `
    <div class="empty-state compact">
      <div>거래 상세를 불러오지 못했습니다</div>
      <div class="st4">${message}</div>
      <button type="button" class="tds-btn secondary sm" style="margin-top:12px" data-tx-modal-action="retry-detail" data-tx-id="${escHtml(txId)}">다시 시도</button>
    </div>
  `;
}

export async function openTxAddModal() {
  ensureTxAddModal();
  window.openModal('tx-add-modal');
  const body = $('#tx-add-body');
  body.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  const accounts = getAccounts();
  const categories = getCategories();
  const modal = document.getElementById('tx-add-modal');
  const title = modal?.querySelector('.tds-modal-title');
  if (title) title.textContent = '거래 추가';
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  body.innerHTML = `
    <form id="tx-add-form">
      <div class="tx-add-type segmented">
        ${[
          ['card_payment', '카드'],
          ['transfer_out', '지출'],
          ['transfer_in', '수입'],
          ['settlement_in', '정산'],
        ].map(([value, label], idx) => `
          <label class="segmented-item ${idx === 0 ? 'active' : ''}">
            <input type="radio" name="type" value="${value}" ${idx === 0 ? 'checked' : ''}>
            ${label}
          </label>
        `).join('')}
      </div>
      <div class="tx-receipt-form">
        <label class="tx-receipt-row">
          <span>금액</span>
          <input class="tds-input tx-add-amount" name="amount" inputmode="numeric" placeholder="0" required>
        </label>
        <div class="tx-add-date-grid">
          <label class="tx-receipt-row">
            <span>날짜</span>
            <input class="tds-input" name="date" type="date" value="${date}" required>
          </label>
          <label class="tx-receipt-row">
            <span>시간</span>
            <input class="tds-input" name="time" type="time" value="${time}" required>
          </label>
        </div>
        <label class="tx-receipt-row">
          <span>상호</span>
          <input class="tds-input" name="merchant" placeholder="예: CU 동교점" required>
        </label>
        <label class="tx-receipt-row">
          <span>계좌</span>
          <select class="tds-select" name="accountId">
            <option value="">미지정</option>
            ${accounts.map(a => `<option value="${escHtml(a.id)}">${escHtml(a.alias)}${a.last4 ? ` (${escHtml(a.last4)})` : ''}</option>`).join('')}
          </select>
        </label>
        <label class="tx-receipt-row">
          <span>카테고리</span>
          <select class="tds-select" name="category">
            <option value="">자동/미분류</option>
            ${groupedCategoryOptions(categories, '')}
          </select>
        </label>
        <label class="tx-receipt-block">
          <span>메모</span>
          <textarea class="tds-textarea" name="memo" placeholder="필요하면 짧게 남겨요"></textarea>
        </label>
      </div>
      <div class="flex gap-md" style="margin-top:20px">
        <button type="button" class="tds-btn secondary" data-modal-dismiss="tx-add-modal">취소</button>
        <button type="submit" class="tds-btn" style="flex:1">저장</button>
      </div>
    </form>
  `;
  bindTransactionAddController(body);
}

function ensureTxAddModal() {
  if (document.getElementById('tx-add-modal')) return;
  const container = document.getElementById('modals-container') || document.body;
  container.insertAdjacentHTML('beforeend', `
    <div class="tds-modal-overlay" id="tx-add-modal">
      <div class="tds-modal-sheet">
        <div class="tds-modal-handle"></div>
        <div class="tds-modal-content" style="text-align:left">
          <div class="tds-modal-title">거래 추가</div>
          <div id="tx-add-body"></div>
        </div>
      </div>
    </div>
  `);
}

configureTransactionModalController({ reopenDetail: openTxEditModal });
window.openTxEditModal = openTxEditModal;
window.openTxAddModal = openTxAddModal;
