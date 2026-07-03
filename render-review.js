// ================================================================
// render-review.js — 리뷰 큐 (needsReview=true 거래 일괄 처리)
// ================================================================

import {
  listTransactions, updateTransaction, getCategories, getAccountById,
  listPendingRawMessages, markRawMessageSkipped, listUnmatchedReceipts,
  needsPaymentRailReview, applyReceiptToTransaction,
} from './data.js?v=20260703-daily-reward-loop';
import { fmtKRW, fmtDateTime, relTime } from './utils/format.js';
import { showToast } from './utils/toast.js';
import { $, escHtml } from './utils/dom.js';

let REVIEW_RECEIPTS = new Map();

export async function renderReview() {
  const root = $('#tab-review');
  root.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';

  const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const [reviewTxs, rawMessages, receipts, recentTxs] = await Promise.all([
    listTransactions({ from, max: 200, needsReview: true }),
    listPendingRawMessages(20).catch(() => []),
    listUnmatchedReceipts(20).catch(() => []),
    listTransactions({ from, max: 200 }).catch(() => []),
  ]);
  const txs = mergeReviewTransactions(reviewTxs, recentTxs);

  if (txs.length === 0 && rawMessages.length === 0 && receipts.length === 0) {
    root.innerHTML = `
      <div class="empty-state" style="padding:64px 20px">
        <div class="icon">✨</div>
        <div>리뷰가 필요한 거래가 없습니다</div>
        <div class="st4">파싱이 자동 처리한 거래들은 거래 내역 탭에서 확인하세요.</div>
      </div>
    `;
    return;
  }

  const cats = getCategories();
  const expenseCats = cats.filter(c => c.kind === 'expense');
  REVIEW_RECEIPTS = new Map(receipts.map(receipt => [receipt.id, receipt]));

  root.innerHTML = `
    <section class="hero review-hero">
      <div class="label">자동 처리 실패</div>
      <div class="amount">${txs.length + rawMessages.length + receipts.length}<span class="unit">건</span></div>
      <div class="sub">
        <span>거래 <b>${txs.length}</b></span>
        <span>원문 <b>${rawMessages.length}</b></span>
        <span>영수증 <b>${receipts.length}</b></span>
      </div>
      <div class="pace ${txs.length || rawMessages.length ? 'warn' : ''}">● 한 번 매핑하면 다음번부터 자동분류가 더 좋아져요</div>
    </section>

    <div class="chips">
      <button type="button" class="chip active">전체 <span class="count">${txs.length + rawMessages.length + receipts.length}</span></button>
      <button type="button" class="chip">거래 <span class="count">${txs.length}</span></button>
      <button type="button" class="chip">원문 <span class="count">${rawMessages.length}</span></button>
      <button type="button" class="chip">영수증 <span class="count">${receipts.length}</span></button>
    </div>

    <div class="insight review">
      <span class="tag">검토 컨텍스트</span>
      <div class="head">${txs.length ? '카테고리만 정해도 홈 집계가 즉시 정리됩니다' : '현재 거래 리뷰는 가볍습니다'}</div>
      <div class="body">카드 결제는 이전 소비처의 카테고리를 학습하고, 건너뛰기는 원문 상태만 바꿉니다. 원문 자체는 삭제하지 않습니다.</div>
    </div>

    <div id="review-list" class="review-list">
      ${txs.map(tx => reviewCardHtml(tx, expenseCats)).join('')}
      ${rawMessages.map(rawCardHtml).join('')}
      ${receipts.map(receipt => receiptCardHtml(receipt, receiptMatchCandidates(receipt, recentTxs))).join('')}
    </div>
  `;

  $('#review-list').addEventListener('click', _onClick);
  $('#review-list').addEventListener('change', _onChange);
}

function reviewCardHtml(tx, cats) {
  const account = tx.accountId ? getAccountById(tx.accountId) : null;
  const isPos = tx.type === 'transfer_in' || tx.type === 'settlement_in';
  const railReview = needsPaymentRailReview(tx);
  return `
    <div class="review-card" data-tx-id="${tx.id}">
      <div class="review-card-main">
        <div class="review-icon">${typeEmoji(tx.type)}</div>
        <div class="review-body">
          <div class="review-kicker">${railReview ? '네이버페이 보완' : 'SMS'} · ${typeLabel(tx.type)}</div>
          <div class="review-title">${escHtml(tx.merchant || tx.counterparty || '미분류')}</div>
          <div class="review-meta">${fmtDateTime(tx.occurredAt)}${account ? ` · ${escHtml(account.alias)}` : ''}</div>
        </div>
        <div class="review-amount ${isPos ? 'amount-pos' : 'amount-neg'}">${isPos ? '+' : '-'}${fmtKRW(tx.amount)}</div>
      </div>

      ${railReview ? `
        <div class="review-rail-panel">
          <span>충전으로 잡힌 결제</span>
          <strong>실제 사용처가 확인되면 이름을 바꿔 확정</strong>
        </div>
      ` : ''}
      <div class="review-actions">
        ${railReview ? `<input class="tds-input review-merchant-input" data-role="actual-merchant" placeholder="실제 사용처" value="${escHtml(tx.actualMerchant || '')}">` : ''}
        <select class="tds-select" data-action="set-category">
          <option value="">카테고리 선택</option>
          ${cats.map(c => `<option value="${escHtml(c.name)}" ${tx.category === c.name ? 'selected' : ''}>${c.emoji || ''} ${escHtml(c.name)}</option>`).join('')}
        </select>
        <button class="tds-btn sm" data-action="confirm">확정</button>
        <button class="tds-btn sm secondary" data-action="open">상세</button>
      </div>
    </div>
  `;
}

function mergeReviewTransactions(reviewTxs = [], recentTxs = []) {
  const rows = new Map();
  for (const tx of reviewTxs) rows.set(tx.id, tx);
  for (const tx of recentTxs) {
    if (needsPaymentRailReview(tx)) rows.set(tx.id, { ...tx, needsReview: true });
  }
  return [...rows.values()].sort((a, b) => {
    const left = normalizeDateValue(a.occurredAt)?.getTime() || 0;
    const right = normalizeDateValue(b.occurredAt)?.getTime() || 0;
    return right - left;
  });
}

function rawCardHtml(raw) {
  const title = raw.sender || raw.source || '원문 메시지';
  const body = raw.body || raw.text || raw.message || '';
  return `
    <div class="review-card raw" data-raw-id="${escHtml(raw.id)}">
      <div class="review-card-main">
        <div class="review-icon">▣</div>
        <div class="review-body">
          <div class="review-kicker">RAW · ${relTime(raw.createdAt?.toDate ? raw.createdAt.toDate() : raw.createdAt)}</div>
          <div class="review-title">${escHtml(title)}</div>
          <div class="review-meta clamp">${escHtml(body || '내용 없음')}</div>
        </div>
      </div>
      <div class="review-actions">
        <button class="tds-btn sm secondary" data-action="skip-raw">건너뛰기</button>
        <button class="tds-btn sm" onclick="switchTab('settings')" type="button">파싱 설정</button>
      </div>
    </div>
  `;
}

function receiptCardHtml(receipt, candidates = []) {
  return `
    <div class="review-card receipt" data-receipt-id="${escHtml(receipt.id)}">
      <div class="review-card-main">
        <div class="review-icon">□</div>
        <div class="review-body">
          <div class="review-kicker">GMAIL 영수증</div>
          <div class="review-title">${escHtml(receipt.merchant || '영수증')}</div>
          <div class="review-meta">${fmtDateTime(receipt.occurredAt)} · ${fmtKRW(receipt.total || receipt.amount || 0)}</div>
        </div>
      </div>
      ${candidates.length ? `
        <div class="receipt-match-panel">
          <div class="receipt-match-insight">
            <span>자동 매칭 후보</span>
            <strong>${escHtml(candidates[0].merchant || candidates[0].counterparty || '거래')} · ${fmtKRW(candidates[0].amount || 0)}</strong>
          </div>
          <div class="receipt-match-list">
            ${candidates.slice(0, 3).map(tx => `
              <button type="button" class="receipt-match-candidate" data-action="match-receipt" data-tx-id="${escHtml(tx.id)}">
                <span>${escHtml(tx.merchant || tx.counterparty || '거래')}</span>
                <em>${fmtDateTime(tx.occurredAt)} · ${fmtKRW(tx.amount || 0)}</em>
              </button>
            `).join('')}
          </div>
        </div>
      ` : `
        <div class="receipt-match-panel empty">
          <div class="receipt-match-insight"><span>자동 매칭 후보 없음</span><strong>거래 탭에서 직접 연결</strong></div>
        </div>
      `}
      <div class="review-actions">
        <button class="tds-btn sm secondary" onclick="switchTab('tx')" type="button">거래에서 매칭</button>
      </div>
    </div>
  `;
}

function receiptMatchCandidates(receipt, txs) {
  const amount = Number(receipt.total || receipt.amount || 0);
  const merchant = normalizeMatchText(receipt.merchant || receipt.title || '');
  const receiptTime = normalizeDateValue(receipt.occurredAt);
  return (txs || [])
    .filter(tx => ['card_payment', 'transfer_out'].includes(tx.type))
    .map(tx => {
      const txAmount = Number(tx.amount) || 0;
      const amountGap = Math.abs(txAmount - amount);
      const txText = normalizeMatchText([tx.merchant, tx.counterparty, tx.memo].filter(Boolean).join(' '));
      const merchantHit = merchant && txText && (txText.includes(merchant) || merchant.includes(txText));
      const txTime = normalizeDateValue(tx.occurredAt);
      const dayGap = receiptTime && txTime ? Math.abs(receiptTime - txTime) / 86400000 : 99;
      const score = (amount ? Math.max(0, 60 - amountGap / 100) : 0) + (merchantHit ? 35 : 0) + (dayGap <= 3 ? 10 : 0);
      return { ...tx, score, amountGap };
    })
    .filter(tx => tx.score >= 35 || tx.amountGap <= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function normalizeMatchText(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

function normalizeDateValue(value) {
  if (!value) return null;
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function _onChange(e) {
  if (e.target.dataset.action !== 'set-category') return;
  const card = e.target.closest('[data-tx-id]');
  const txId = card.dataset.txId;
  const category = e.target.value || null;
  try {
    await updateTransaction(txId, { category });
    showToast(`카테고리 → ${category || '없음'}`, 1200, 'success');
  } catch (err) { showToast(err.message, 2400, 'error'); }
}

async function _onClick(e) {
  const actionTarget = e.target.closest('[data-action]');
  const action = actionTarget?.dataset.action;
  const rawCard = e.target.closest('[data-raw-id]');
  if (action === 'skip-raw' && rawCard) {
    try {
      await markRawMessageSkipped(rawCard.dataset.rawId, 'review_skip');
      rawCard.style.opacity = '0.5';
      setTimeout(() => { rawCard.remove(); _checkEmpty(); }, 300);
      showToast('원문을 건너뛰었어요.', 1200, 'success');
    } catch (err) { showToast(err.message, 2400, 'error'); }
    return;
  }
  const receiptCard = e.target.closest('[data-receipt-id]');
  if (action === 'match-receipt' && receiptCard) {
    const txId = actionTarget.dataset.txId;
    const receiptId = receiptCard.dataset.receiptId;
    try {
      const receipt = REVIEW_RECEIPTS.get(receiptId) || null;
      await applyReceiptToTransaction(txId, receipt || { id: receiptId });
      receiptCard.style.opacity = '0.5';
      setTimeout(() => { receiptCard.remove(); _checkEmpty(); }, 300);
      showToast('영수증 품목과 상세분류를 연결했어요.', 1600, 'success');
    } catch (err) {
      showToast(err.message || '영수증 매칭 실패', 2400, 'error');
    }
    return;
  }
  const card = e.target.closest('[data-tx-id]');
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
      setTimeout(() => { card.remove(); _checkEmpty(); }, 300);
    } catch (err) { showToast(err.message, 2400, 'error'); }
  } else if (action === 'open') {
    window.openTxEditModal(txId);
  }
}

function _checkEmpty() {
  const list = $('#review-list');
  if (list && list.children.length === 0) {
    renderReview();
  }
}

function typeLabel(type) {
  return ({ card_payment: '카드 결제', transfer_out: '이체 출금', transfer_in: '이체 입금', internal_transfer: '내부 이체', settlement_in: '정산 받음', settlement_out: '정산 보냄' })[type] || type;
}

function typeEmoji(type) {
  return ({ card_payment: '💳', transfer_out: '↗', transfer_in: '↙', internal_transfer: '↔', settlement_in: '₩', settlement_out: '↘' })[type] || '□';
}
