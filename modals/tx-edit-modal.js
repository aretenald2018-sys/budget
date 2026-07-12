// ================================================================
// modals/tx-edit-modal.js — 거래 상세/수정
// 영수증 품목 표시, 카테고리 변경, 메모, 분류 확정 (needsReview=false)
// ================================================================

import {
  saveTransaction, getTransaction, updateTransaction, deleteTransaction,
  getAccounts, getCategories, getReceipt, applySharedPayment,
  saveCategorySubcategory, deleteCategorySubcategory,
  UNCATEGORIZED_CATEGORY_NAME, isReimbursementExpected,
} from '../data.js?v=20260712-domain-rules-r2';
import { showToast } from '../utils/toast.js';
import { fmtKRW } from '../utils/format.js';
import { $, escHtml } from '../utils/dom.js';
import {
  getTypeEmoji,
  groupedCategoryOptions,
  subcategoryEditorHtml,
  transactionEditorHtml,
} from '../features/transactions/editor/view.js?v=20260712-transaction-features';

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
  const body = ensureTxEditModalBody();
  if (!body) {
    showToast('거래 상세 화면을 준비하지 못했습니다.', 2600, 'error');
    return;
  }

  window.openModal('tx-edit-modal');
  body.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';

  try {
    const tx = await getTransaction(txId);
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

    body.innerHTML = transactionEditorHtml({
      tx,
      accounts,
      categories,
      receiptHtml,
      uncategorizedName: UNCATEGORIZED_CATEGORY_NAME,
      reimbursementExpected: isReimbursementExpected(tx),
    });
    bindTxDetailEditor(body);
  } catch (err) {
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
  bindTxAddModal(body);
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

function bindTxAddModal(root) {
  root.querySelectorAll('.tx-add-type input').forEach(input => {
    input.addEventListener('change', () => {
      root.querySelectorAll('.tx-add-type .segmented-item').forEach(label => {
        label.classList.toggle('active', label.querySelector('input')?.checked);
      });
    });
  });
  root.querySelector('#tx-add-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = parseAmount(fd.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('금액을 1원 이상으로 입력하세요.', 2200, 'error');
      return;
    }
    const occurredAt = new Date(`${fd.get('date')}T${fd.get('time') || '00:00'}:00`);
    if (Number.isNaN(occurredAt.getTime())) {
      showToast('날짜와 시간을 확인하세요.', 2200, 'error');
      return;
    }
    const type = fd.get('type') || 'card_payment';
    const party = String(fd.get('merchant') || '').trim();
    const payload = {
      type,
      amount,
      occurredAt,
      accountId: fd.get('accountId') || null,
      category: fd.get('category') || null,
      memo: fd.get('memo') || null,
      needsReview: !fd.get('category'),
    };
    if (type === 'transfer_in' || type === 'settlement_in' || type === 'settlement_out') payload.counterparty = party;
    else payload.merchant = party;
    try {
      await saveTransaction(payload);
      showToast('거래를 추가했어요.', 1500, 'success');
      window.closeModal('tx-add-modal');
      window.refreshCurrentTab?.();
    } catch (err) {
      showToast(err.message || '거래 추가 실패', 3000, 'error');
    }
  });
}

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'tx-edit-form') return;
  e.preventDefault();
  const txId = e.target.dataset.txId;
  const fd = new FormData(e.target);
  const amount = parseAmount(fd.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('\uae08\uc561\uc744 1\uc6d0 \uc774\uc0c1\uc73c\ub85c \uc785\ub825\ud558\uc138\uc694.', 2200, 'error');
    return;
  }
  const patch = {
    amount,
    category: fd.get('category') || null,
    subcategory: fd.get('category') ? (fd.get('subcategory') || null) : null,
    accountId: fd.get('accountId') || null,
    merchant: fd.get('merchant') || null,
    memo: fd.get('memo') || null,
    reimbursementExpected: !!fd.get('reimbursementExpected'),
    excludedFromBudget: !!fd.get('reimbursementExpected'),
    excludeReason: fd.get('reimbursementExpected') ? 'reimbursement_expected' : null,
  };
  if (fd.get('confirmReview')) patch.needsReview = false;
  try {
    await updateTransaction(txId, patch);
    showToast('저장됨', 1500, 'success');
    window.closeModal('tx-edit-modal');
    if (window.refreshCurrentTab) window.refreshCurrentTab();
  } catch (err) {
    showToast(err.message, 3000, 'error');
  }
});

document.addEventListener('click', event => {
  const actionTarget = event.target?.closest?.('[data-tx-modal-action]');
  if (!actionTarget) return;
  if (actionTarget.dataset.txModalAction === 'retry-detail') {
    openTxEditModal(actionTarget.dataset.txId);
  }
});

function bindTxDetailEditor(root) {
  root.addEventListener('click', (event) => {
    const actionTarget = event.target?.closest?.('[data-tx-editor-action]');
    if (!actionTarget || !root.contains(actionTarget)) return;
    const action = actionTarget.dataset.txEditorAction;
    const txId = actionTarget.dataset.txId || root.querySelector('#tx-edit-form')?.dataset.txId;
    if (action === 'delete') {
      window.deleteTx?.(txId);
    } else if (action === 'cancel') {
      window.closeModal?.('tx-edit-modal');
    } else if (action === 'shared-payment') {
      window.applySharedPaymentFromModal?.(
        txId,
        Number(actionTarget.dataset.peopleCount) || 2,
        false,
      );
    }
  });

  const categorySelect = root.querySelector('[name=category]');
  categorySelect?.addEventListener('change', () => {
    renderSubcategoryEditor(root, categorySelect.value, '');
  });

  const refundInput = root.querySelector('[name=reimbursementExpected]');
  refundInput?.addEventListener('change', () => {
    refundInput.closest('.tx-refund-panel')?.classList.toggle('active', refundInput.checked);
  });

  root.querySelector('#tx-subcategory-editor')?.addEventListener('click', async (e) => {
    const action = e.target?.dataset?.subcategoryAction;
    if (!action) return;
    const categoryName = root.querySelector('[name=category]')?.value || '';
    const select = root.querySelector('[name=subcategory]');
    const draft = root.querySelector('[name=subcategoryDraft]');
    const selectedOption = select?.selectedOptions?.[0];
    const selectedId = selectedOption?.dataset?.id || '';
    const draftName = String(draft?.value || '').trim();

    try {
      if (!categoryName) throw new Error('카테고리를 먼저 선택하세요.');
      if (action === 'add') {
        const saved = await saveCategorySubcategory(categoryName, { name: draftName });
        renderSubcategoryEditor(root, categoryName, saved.name);
        showToast('상세분류 추가됨', 1300, 'success');
      } else if (action === 'rename') {
        if (!selectedId) throw new Error('수정할 상세분류를 선택하세요.');
        const saved = await saveCategorySubcategory(categoryName, { id: selectedId, name: draftName });
        renderSubcategoryEditor(root, categoryName, saved.name);
        showToast('상세분류 수정됨', 1300, 'success');
      } else if (action === 'delete') {
        if (!selectedId) throw new Error('삭제할 상세분류를 선택하세요.');
        if (!confirm('이 상세분류를 삭제할까요? 기존 거래의 상세분류는 비워집니다.')) return;
        await deleteCategorySubcategory(categoryName, selectedId);
        renderSubcategoryEditor(root, categoryName, '');
        showToast('상세분류 삭제됨', 1300, 'success');
      }
      if (window.refreshCurrentTab) window.refreshCurrentTab();
    } catch (err) {
      showToast(err.message, 2600, 'error');
    }
  });

  root.querySelector('#tx-subcategory-editor')?.addEventListener('change', (e) => {
    if (e.target?.name !== 'subcategory') return;
    const draft = root.querySelector('[name=subcategoryDraft]');
    if (draft) draft.value = e.target.value || '';
    const summaryValue = root.querySelector('#tx-subcategory-details summary strong');
    if (summaryValue) summaryValue.textContent = e.target.value || '미지정';
  });
}

function renderSubcategoryEditor(root, categoryName, selectedName) {
  const holder = root.querySelector('#tx-subcategory-editor');
  if (!holder) return;
  holder.innerHTML = subcategoryEditorHtml(getCategories(), categoryName, selectedName);
  const summaryValue = root.querySelector('#tx-subcategory-details summary strong');
  if (summaryValue) summaryValue.textContent = selectedName || '미지정';
}

function parseAmount(value) {
  const normalized = String(value || '').replace(/[^\d.-]/g, '');
  return Math.round(Math.abs(Number(normalized)));
}

window.deleteTx = async (txId) => {
  if (!confirm('이 거래를 삭제할까요?')) return;
  try {
    await deleteTransaction(txId);
    showToast('삭제됨', 1500, 'success');
    window.closeModal('tx-edit-modal');
    if (window.refreshCurrentTab) window.refreshCurrentTab();
  } catch (err) {
    showToast(err.message, 3000, 'error');
  }
};

window.applySharedPaymentFromModal = async (txId, peopleCount) => {
  try {
    const rememberRule = !!document.getElementById(`shared-remember-${txId}`)?.checked;
    await applySharedPayment(txId, peopleCount, { rememberRule });
    showToast(rememberRule ? '공동 결제 규칙까지 저장됨' : '내 부담액으로 반영됨', 1600, 'success');
    await openTxEditModal(txId);
    if (window.refreshCurrentTab) window.refreshCurrentTab();
  } catch (err) {
    showToast(err.message, 3000, 'error');
  }
};

window.openTxEditModal = openTxEditModal;
window.openTxAddModal = openTxAddModal;
