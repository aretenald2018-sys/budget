import {
  updateTransaction,
  markRawMessageSkipped,
  applyReceiptToTransaction,
} from '../../data.js';
import { reviewState as STATE } from './state.js';
import { showToast } from '../../utils/toast.js';
import { $ } from '../../utils/dom.js';

let renderReview = async () => {};

export function bindReviewController(root, renderer) {
  renderReview = renderer;
  if (!root || root.dataset.reviewEventsBound === 'true') return;
  root.dataset.reviewEventsBound = 'true';
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
}

// 필터 칩: STATE.filter 기준으로 칩 활성/카드 표시를 동기화한다 (재렌더 없이 토글)
export function applyReviewFilter(root) {
  const scope = root || $('#tab-review');
  if (!scope) return;
  const filter = STATE.filter || 'all';
  scope.querySelectorAll('[data-review-filter]').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.reviewFilter === filter);
  });
  let visible = 0;
  scope.querySelectorAll('[data-review-kind]').forEach(card => {
    const show = filter === 'all' || card.dataset.reviewKind === filter;
    card.classList.toggle('hidden', !show);
    if (show) visible += 1;
  });
  scope.querySelector('#review-filter-empty')?.classList.toggle('hidden', visible > 0);
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
  const filterChip = event.target.closest('[data-review-filter]');
  if (filterChip) {
    STATE.filter = filterChip.dataset.reviewFilter || 'all';
    applyReviewFilter(filterChip.closest('#tab-review'));
    return;
  }
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
