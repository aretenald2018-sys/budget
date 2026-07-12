import {
  updateTransaction,
  markRawMessageSkipped,
  applyReceiptToTransaction,
} from '../../data.js?v=20260712-domain-rules-r2';
import { reviewState as STATE } from './state.js?v=20260712-current-surface-r1';
import { showToast } from '../../utils/toast.js';
import { $ } from '../../utils/dom.js';

let renderReview = async () => {};

export function bindReviewController(list, renderer) {
  renderReview = renderer;
  if (!list || list.dataset.reviewEventsBound === 'true') return;
  list.dataset.reviewEventsBound = 'true';
  list.addEventListener('click', onClick);
  list.addEventListener('change', onChange);
}

async function onChange(event) {
  if (event.target.dataset.action !== 'set-category') return;
  const card = event.target.closest('[data-tx-id]');
  const txId = card.dataset.txId;
  const category = event.target.value || null;
  try {
    await updateTransaction(txId, { category });
    showToast(`카테고리 → ${category || '없음'}`, 1200, 'success');
  } catch (err) { showToast(err.message, 2400, 'error'); }
}

async function onClick(event) {
  const actionTarget = event.target.closest('[data-action]');
  const action = actionTarget?.dataset.action;
  const rawCard = event.target.closest('[data-raw-id]');
  if (action === 'navigate') {
    document.dispatchEvent(new CustomEvent('budget:app-action', {
      detail: { action, tab: actionTarget.dataset.tab },
    }));
    return;
  }
  if (action === 'skip-raw' && rawCard) {
    try {
      await markRawMessageSkipped(rawCard.dataset.rawId, 'review_skip');
      rawCard.style.opacity = '0.5';
      setTimeout(() => { rawCard.remove(); checkEmpty(); }, 300);
      showToast('원문을 건너뛰었어요.', 1200, 'success');
    } catch (err) { showToast(err.message, 2400, 'error'); }
    return;
  }
  const receiptCard = event.target.closest('[data-receipt-id]');
  if (action === 'match-receipt' && receiptCard) {
    const txId = actionTarget.dataset.txId;
    const receiptId = receiptCard.dataset.receiptId;
    try {
      const receipt = STATE.receipts.get(receiptId) || null;
      await applyReceiptToTransaction(txId, receipt || { id: receiptId });
      receiptCard.style.opacity = '0.5';
      setTimeout(() => { receiptCard.remove(); checkEmpty(); }, 300);
      showToast('영수증 품목과 상세분류를 연결했어요.', 1600, 'success');
    } catch (err) {
      showToast(err.message || '영수증 매칭 실패', 2400, 'error');
    }
    return;
  }
  const card = event.target.closest('[data-tx-id]');
  if (!card) return;
  const txId = card.dataset.txId;
  if (action === 'confirm') {
    try {
      const actualMerchant = String(card.querySelector('[data-role="actual-merchant"]')?.value || '').trim();
      const patch = { needsReview: false };
      if (actualMerchant) {
        patch.actualMerchant = actualMerchant;
        patch.originalMerchant = card.querySelector('.review-title')?.textContent || null;
        patch.merchant = actualMerchant;
      }
      if (actualMerchant || card.querySelector('[data-role="actual-merchant"]')) {
        patch.paymentRail = 'naverpay';
        patch.paymentRailResolved = true;
      }
      await updateTransaction(txId, patch);
      card.style.opacity = '0.5';
      setTimeout(() => { card.remove(); checkEmpty(); }, 300);
    } catch (err) { showToast(err.message, 2400, 'error'); }
  } else if (action === 'open') {
    window.openTxEditModal?.(txId);
  }
}

function checkEmpty() {
  const list = $('#review-list');
  if (list && list.children.length === 0) renderReview();
}
