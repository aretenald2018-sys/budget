import { fmtKRW } from '../../../utils/format.js';
import { escHtml } from '../../../utils/dom.js';
import {
  focusRewardLabel,
  formatPointBalance,
  rewardPointDateInput,
  rewardPointDateLabel,
} from './state.js';

export function rewardPointModalHtml(model) {
  const { pointItems, selectedId, selectedBucket, selectedItem, usageEntries } = model;
  return `
    <div class="reward-point-modal-head">
      <div>
        <span class="reward-point-modal-kicker">가상 포인트</span>
        <h2 class="tds-modal-title" id="reward-point-modal-title">포인트 사용</h2>
      </div>
      <button class="reward-point-modal-close" type="button" data-reward-point-entry-action="close" aria-label="포인트 사용 닫기">×</button>
    </div>
    <div class="reward-point-modal-summary">
      <div>
        <span>${escHtml(focusRewardLabel(selectedItem?.label || '포인트'))}</span>
        <strong>${selectedBucket ? formatPointBalance(selectedBucket.monthPoints) : '-'}</strong>
      </div>
      <p>포인트 사용은 거래내역과 연결되지 않는 별도 가상 이력입니다.</p>
    </div>
    <form class="reward-point-usage-form" data-reward-point-form>
      <input type="hidden" name="entryId" value="">
      <label>
        <span>포인트 항목</span>
        <select class="tds-select" name="pointItemId" ${pointItems.length ? '' : 'disabled'}>
          ${rewardPointModalOptions(pointItems, selectedId)}
        </select>
      </label>
      <div class="reward-point-usage-grid">
        <label>
          <span>사용 포인트</span>
          <input class="tds-input" name="amount" inputmode="numeric" placeholder="0" required ${pointItems.length ? '' : 'disabled'}>
        </label>
        <label>
          <span>사용일</span>
          <input class="tds-input" name="usedAt" type="date" value="${rewardPointDateInput(new Date())}" required ${pointItems.length ? '' : 'disabled'}>
        </label>
      </div>
      <label>
        <span>메모 <small>선택</small></span>
        <input class="tds-input" name="note" maxlength="120" placeholder="예: 와인 한 병 구매" ${pointItems.length ? '' : 'disabled'}>
      </label>
      <div class="reward-point-usage-actions">
        <button class="tds-btn secondary" type="button" data-reward-point-entry-action="reset">새 사용</button>
        <button class="tds-btn" type="submit" ${pointItems.length ? '' : 'disabled'}>사용 기록</button>
      </div>
    </form>
    <section class="reward-point-history" aria-label="포인트 사용 이력">
      <div class="reward-point-history-head">
        <h3>사용 이력</h3>
        <span>${usageEntries.length}건</span>
      </div>
      <div class="reward-point-history-list">
        ${usageEntries.length ? usageEntries.map(rewardPointUsageRow).join('') : '<div class="reward-point-history-empty">아직 사용 이력이 없어요.</div>'}
      </div>
    </section>
  `;
}

function rewardPointModalOptions(items, selectedId) {
  if (!items.length) return '<option value="">포인트 항목이 없습니다</option>';
  return items.map(item => `
    <option value="${escHtml(item.id)}" data-point-label="${escHtml(item.label)}" ${item.id === selectedId ? 'selected' : ''}>${escHtml(item.label)}</option>
  `).join('');
}

function rewardPointUsageRow(entry) {
  const amount = Math.max(0, Math.round(Number(entry?.amount) || 0));
  const label = focusRewardLabel(entry?.pointItemLabel || entry?.label || entry?.pointItemId || '포인트');
  const note = String(entry?.note || '').trim();
  return `
    <article class="reward-point-history-row">
      <div class="reward-point-history-main">
        <strong>${escHtml(label)}</strong>
        <span>${escHtml([rewardPointDateLabel(entry?.usedAt), note].filter(Boolean).join(' · '))}</span>
      </div>
      <strong class="reward-point-history-amount">-${fmtKRW(amount).replace('원', '')}P</strong>
      <div class="reward-point-history-actions">
        <button type="button" data-reward-point-entry-action="edit" data-reward-point-entry-id="${escHtml(entry.id)}">수정</button>
        <button type="button" data-reward-point-entry-action="delete" data-reward-point-entry-id="${escHtml(entry.id)}">삭제</button>
      </div>
    </article>
  `;
}
