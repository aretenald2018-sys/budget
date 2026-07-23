import { escHtml } from '../../utils/dom.js';
import { fmtKRW, fmtDateTime } from '../../utils/format.js';
import { isFundCovered } from '../../domain/transactions/budget.js';

const TYPE_EMOJI = { card_payment: '💳', transfer_out: '↗️', transfer_in: '↙️', internal_transfer: '🔄', settlement_in: '💰', settlement_out: '💸' };

// 충당금 처리되어 예산 집계에서 빠진 거래 — 카테고리 드릴에 회색 이력으로만 표시.
export function fundCoveredTxsForCategory(source = [], categoryName) {
  return (Array.isArray(source) ? source : [])
    .filter(tx => tx.type === 'card_payment' || tx.type === 'transfer_out')
    .filter(isFundCovered)
    .filter(tx => (tx.category || '미분류') === categoryName)
    .sort((a, b) => dateMs(b.occurredAt) - dateMs(a.occurredAt));
}

export function fundCoveredDrillHtml(txs = []) {
  if (!txs.length) return '';
  return `
    <div class="report-drill-fund-note">충당금으로 처리되어 예산 집계에서 빠진 지출</div>
    ${txs.map(fundCoveredRow).join('')}
  `;
}

function fundCoveredRow(tx) {
  const meta = [tx.fundLabel ? `충당금 · ${tx.fundLabel}` : '충당금 처리됨', fmtDateTime(tx.occurredAt)].filter(Boolean).join(' · ');
  return `
    <div class="report-tx-row fund-covered">
      <div class="report-tx-open" role="button" tabindex="0" data-report-action="open-tx-detail" data-tx-id="${escHtml(tx.id)}">
        <span class="tx-icon">${TYPE_EMOJI[tx.type] || '📦'}</span>
        <span class="report-tx-body">
          <strong>${escHtml(tx.merchant || tx.counterparty || '미분류')}</strong>
          <small>${escHtml(meta)}</small>
        </span>
        <span class="amount-neg">-${fmtKRW(tx.amount)}</span>
      </div>
    </div>
  `;
}

function dateMs(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
