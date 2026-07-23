import { escHtml } from '../../../utils/dom.js';
import { fmtDate, fmtKRW } from '../../../utils/format.js';

export function openTxReviewGuide({ reviewItems = [], monthKey = '', dependencies = {} } = {}) {
  const modal = ensureTxReviewGuideModal();
  modal.querySelector('#tx-review-guide-body').innerHTML = txReviewGuideHtml(reviewItems, monthKey, dependencies);
  window.openModal('tx-review-guide-modal');
}

export function ensureTxReviewGuideModal() {
  let modal = document.getElementById('tx-review-guide-modal');
  if (!modal) {
    const container = document.getElementById('modals-container') || document.body;
    container.insertAdjacentHTML('beforeend', `
      <div class="tds-modal-overlay tx-review-guide-modal" id="tx-review-guide-modal" role="dialog" aria-modal="true" aria-labelledby="tx-review-guide-title">
        <div class="tds-modal-sheet tx-review-guide-sheet">
          <div class="tds-modal-handle"></div>
          <div class="tds-modal-content" style="text-align:left">
            <div class="tds-modal-title" id="tx-review-guide-title">분류 검토 안내</div>
            <div id="tx-review-guide-body"></div>
          </div>
        </div>
      </div>
    `);
    modal = document.getElementById('tx-review-guide-modal');
  }
  bindTxReviewGuideModal(modal);
  return modal;
}

export function txReviewGuideHtml(reviewItems = [], monthKey = '', dependencies = {}) {
  const limited = reviewItems.slice(0, 8);
  const extraCount = Math.max(0, reviewItems.length - limited.length);
  return `
    <div class="tx-review-guide-summary">
      <strong>${monthLabel(monthKey)} 검토 ${reviewItems.length}건</strong>
      <span>아래 항목의 카테고리나 실제 사용처를 확인하면 월 합계와 리포트가 정돈됩니다.</span>
    </div>
    <div class="tx-review-guide-list">
      ${limited.length
        ? limited.map(tx => txReviewGuideRowHtml(tx, dependencies)).join('')
        : '<div class="empty-state compact"><div>검토할 거래가 없습니다</div></div>'}
      ${extraCount ? `<div class="tx-review-guide-more">나머지 ${extraCount}건은 검토 탭에서 이어서 처리하세요.</div>` : ''}
    </div>
    <div class="tx-review-guide-actions">
      <button type="button" class="tds-btn secondary" data-tx-review-action="close">닫기</button>
      <button type="button" class="tds-btn" data-tx-review-action="review-tab">검토 탭으로 이동</button>
    </div>
  `;
}

export function txReviewGuide(tx, dependencies = {}) {
  const displayCategoryName = dependencies.displayCategoryName || (item => item.category || '미분류');
  const needsPaymentRailReview = dependencies.needsPaymentRailReview || (() => false);
  if (needsPaymentRailReview(tx)) {
    return {
      icon: 'N',
      text: '네이버페이 충전/결제 내역이면 실제 사용처를 입력하고 확정하세요.',
    };
  }
  if (!tx.category || displayCategoryName(tx) === '미분류') {
    return {
      icon: 'C',
      text: '카테고리를 선택하세요. 이후 같은 소비처 자동 분류 정확도가 올라갑니다.',
    };
  }
  if (tx.type === 'transfer_in' || tx.type === 'settlement_in' || tx.type === 'settlement_out') {
    return {
      icon: '₩',
      text: '수입/정산 성격과 상대방 이름이 맞는지 확인하고 확정하세요.',
    };
  }
  return {
    icon: '?',
    text: '자동 분류 신뢰도가 낮습니다. 카테고리가 맞으면 검토를 확정하세요.',
  };
}

function bindTxReviewGuideModal(modal) {
  if (!modal || modal.dataset.txReviewGuideBound) return;
  modal.dataset.txReviewGuideBound = 'true';
  modal.addEventListener('click', (event) => {
    if (event.target === modal) return; // backdrop 닫기는 modal-manager 전역 계약이 처리
    const actionTarget = event.target?.closest?.('[data-tx-review-action]');
    if (!actionTarget || !modal.contains(actionTarget)) return;
    const action = actionTarget.dataset.txReviewAction;
    if (action === 'close') {
      closeTxReviewGuide();
    } else if (action === 'review-tab') {
      closeTxReviewGuide();
      window.switchTab?.('review');
    } else if (action === 'open-detail') {
      closeTxReviewGuide();
      window.openTxEditModal?.(actionTarget.dataset.txId);
    }
  });
}

function txReviewGuideRowHtml(tx, dependencies) {
  const displayCategoryName = dependencies.displayCategoryName || (item => item.category || '미분류');
  const getAccountById = dependencies.getAccountById || (() => null);
  const guide = txReviewGuide(tx, dependencies);
  const account = tx.accountId ? getAccountById(tx.accountId) : null;
  const meta = [
    fmtDate(tx.occurredAt),
    account?.alias,
    displayCategoryName(tx),
  ].filter(Boolean).join(' · ');
  const isPos = tx.type === 'transfer_in' || tx.type === 'settlement_in';
  const sign = isPos ? '+' : '-';
  return `
    <div class="tx-review-guide-row">
      <span class="tx-review-guide-icon">${guide.icon}</span>
      <span class="tx-review-guide-main">
        <strong>${escHtml(tx.merchant || tx.counterparty || '미분류')}</strong>
        <small>${escHtml(meta)}</small>
        <em>${escHtml(guide.text)}</em>
      </span>
      <span class="tx-review-guide-side">
        <b class="${isPos ? 'amount-pos' : 'amount-neg'}">${sign}${fmtKRW(tx.amount)}</b>
        <button type="button" data-tx-review-action="open-detail" data-tx-id="${escHtml(tx.id)}">상세</button>
      </span>
    </div>
  `;
}

function closeTxReviewGuide() {
  window.closeModal?.('tx-review-guide-modal');
}

function monthLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  return year && month ? `${year}년 ${month}월` : String(monthKey || '이번 달');
}
