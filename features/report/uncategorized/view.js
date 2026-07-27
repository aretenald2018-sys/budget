// ================================================================
// features/report/uncategorized/view.js — 미분류 일괄 정리 블록(순수 빌더)
//
// 미분류 거래를 소비처(가맹점/상대) 단위로 묶어 한 번에 카테고리를 지정한다.
// 소비처 단위로 묶는 이유: transactions.js 의 applyMerchantCategoryMemory 가
// 같은 소비처의 최근 카테고리를 학습하므로, 한 번 정리하면 다음부터 자동 분류가
// 같이 좋아진다.
// ================================================================

import { escHtml } from '../../../utils/dom.js';
import { fmtKRW } from '../../../utils/format.js';

export const UNCATEGORIZED_BULK_LIMIT = 12;

// 미분류 거래 → [{ key, label, count, total, txIds }] (금액 큰 순).
export function groupUncategorizedByParty(txs = []) {
  const groups = new Map();
  for (const tx of Array.isArray(txs) ? txs : []) {
    const label = String(tx.merchant || tx.counterparty || '').trim() || '이름 없는 결제';
    const key = label.replace(/\s+/g, '').toLowerCase();
    const current = groups.get(key) || { key, label, count: 0, total: 0, txIds: [] };
    current.count += 1;
    current.total += Number(tx.amount) || 0;
    current.txIds.push(tx.id);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

export function uncategorizedBulkHtml(txs = [], categories = []) {
  const groups = groupUncategorizedByParty(txs).slice(0, UNCATEGORIZED_BULK_LIMIT);
  if (!groups.length) return '';
  const options = categories
    .filter(category => category.kind === 'expense' && category.name !== '미분류')
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99))
    .map(category => `<option value="${escHtml(category.name)}">${category.emoji || ''} ${escHtml(category.name)}</option>`)
    .join('');
  if (!options) return '';
  const hidden = Math.max(0, groupUncategorizedByParty(txs).length - groups.length);
  return `
    <div class="report-uncat-bulk">
      <div class="report-uncat-head">
        <strong>소비처별로 한 번에 정리</strong>
        <span>카테고리를 정하면 다음부터 같은 소비처가 자동 분류돼요</span>
      </div>
      ${groups.map(group => `
        <div class="report-uncat-row" data-uncat-key="${escHtml(group.key)}">
          <div class="report-uncat-main">
            <strong>${escHtml(group.label)}</strong>
            <small>${group.count}건 · ${fmtKRW(group.total)}</small>
          </div>
          <select class="tds-select" data-uncat-select aria-label="${escHtml(group.label)} 카테고리">
            <option value="">카테고리 선택</option>
            ${options}
          </select>
          <button type="button" class="tds-btn sm" data-report-action="apply-uncategorized" data-uncat-key="${escHtml(group.key)}">적용</button>
        </div>
      `).join('')}
      ${hidden ? `<div class="report-uncat-more">소비처 ${hidden}곳은 정리 후 이어서 표시돼요.</div>` : ''}
    </div>
  `;
}
