// ================================================================
// modals/tx-edit-modal.js — 거래 상세/수정
// 영수증 품목 표시, 카테고리 변경, 메모, 분류 확정 (needsReview=false)
// ================================================================

import {
  saveTransaction, getTransaction, updateTransaction, deleteTransaction,
  getAccounts, getCategories, getReceipt, getAppSettings, applySharedPayment,
  saveCategorySubcategory, deleteCategorySubcategory,
  UNCATEGORIZED_CATEGORY_NAME, isReimbursementExpected,
} from '../data.js?v=20260710-gps-route-fidelity';
import { showToast } from '../utils/toast.js';
import { fmtKRW, fmtDateTime } from '../utils/format.js';
import { $, escHtml } from '../utils/dom.js';

const TYPE_LABELS = {
  card_payment: '카드 결제',
  transfer_out: '이체 (출금)',
  transfer_in: '이체 (입금)',
  internal_transfer: '내부 이체',
  settlement_in: '정산 받음',
  settlement_out: '정산 보냄',
};

export const MODAL_HTML = `
<div class="tds-modal-overlay" id="tx-edit-modal" onclick="if(event.target===this)closeModal('tx-edit-modal')">
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
    const pointItems = await loadRewardPointItems(tx.rewardPointEntry);
    const categoryOptions = groupedCategoryOptions(categories, tx.category);

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

    const isAmountPos = tx.type === 'transfer_in' || tx.type === 'settlement_in';
    body.innerHTML = `
      <div class="tx-receipt-head">
        <div>
          <span>${TYPE_LABELS[tx.type] || tx.type} · ${fmtDateTime(tx.occurredAt)}</span>
          <strong>${escHtml(tx.merchant || tx.counterparty || '미분류')}</strong>
        </div>
        <em class="${isAmountPos ? 'amount-pos' : 'amount-neg'}">
          ${isAmountPos ? '+' : '-'}${fmtKRW(tx.amount).replace('-', '')}
        </em>
      </div>
      <form id="tx-edit-form" data-tx-id="${escAttr(tx.id)}">
        <div class="tx-receipt-form">
          ${sharedPaymentHtml(tx)}
          ${reimbursementPanel(tx)}
          ${rewardPointEntryPanel(tx, pointItems)}

          <label class="tx-receipt-row">
            <span>금액</span>
            <input class="tds-input" name="amount" inputmode="numeric" value="${Number(tx.amount) || 0}" required>
          </label>

          <label class="tx-receipt-row">
            <span>카테고리</span>
            <select class="tds-select" name="category">
              <option value="" ${!tx.category || tx.category === UNCATEGORIZED_CATEGORY_NAME ? 'selected' : ''}>미분류</option>
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
              ${accounts.map(a => `
                <option value="${escAttr(a.id)}" ${tx.accountId === a.id ? 'selected' : ''}>
                  ${escHtml(a.alias)}${a.last4 ? ` (${escHtml(a.last4)})` : ''}
                </option>
              `).join('')}
            </select>
          </label>

          <label class="tx-receipt-row">
            <span>가맹점 / 상대</span>
            <input class="tds-input" name="merchant" value="${escAttr(tx.merchant || tx.counterparty || '')}">
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
          <button type="button" class="tds-btn ghost" onclick="window.deleteTx(${jsStringArg(tx.id)})">삭제</button>
          <button type="button" class="tds-btn secondary" onclick="closeModal('tx-edit-modal')">취소</button>
          <button type="submit" class="tds-btn" style="flex:1">저장</button>
        </div>
      </form>
    `;
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
      <button type="button" class="tds-btn secondary sm" style="margin-top:12px" onclick="window.openTxEditModal(${jsStringArg(txId)})">다시 시도</button>
    </div>
  `;
}

function escAttr(value) {
  return escHtml(value);
}

function jsStringArg(value) {
  return escHtml(JSON.stringify(String(value ?? '')));
}

export async function openTxAddModal(options = {}) {
  ensureTxAddModal();
  window.openModal('tx-add-modal');
  const body = $('#tx-add-body');
  body.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  const accounts = getAccounts();
  const categories = getCategories();
  const pointItems = await loadRewardPointItems();
  const initialRewardPointEntry = resolveInitialRewardPointEntry(options);
  const modal = document.getElementById('tx-add-modal');
  const title = modal?.querySelector('.tds-modal-title');
  if (title) title.textContent = initialRewardPointEntry.forceRewardPointEnabled ? '포인트 정산 추가' : '거래 추가';
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
          <input class="tds-input tx-add-amount" name="amount" inputmode="numeric" placeholder="0" value="${initialRewardPointEntry.amount ? escAttr(initialRewardPointEntry.amount) : ''}" required>
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
          <input class="tds-input" name="merchant" placeholder="${initialRewardPointEntry.forceRewardPointEnabled ? '예: 와인 구매' : '예: CU 동교점'}" required>
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
        ${rewardPointEntryPanel({}, pointItems, {
          forceRewardPointEnabled: initialRewardPointEntry.forceRewardPointEnabled,
          selectedPointItemId: initialRewardPointEntry.pointItemId,
          amount: initialRewardPointEntry.amount,
        })}
        <label class="tx-receipt-block">
          <span>메모</span>
          <textarea class="tds-textarea" name="memo" placeholder="필요하면 짧게 남겨요"></textarea>
        </label>
      </div>
      <div class="flex gap-md" style="margin-top:20px">
        <button type="button" class="tds-btn secondary" onclick="closeModal('tx-add-modal')">취소</button>
        <button type="submit" class="tds-btn" style="flex:1">저장</button>
      </div>
    </form>
  `;
  bindTxAddModal(body);
}

function resolveInitialRewardPointEntry(options = {}) {
  const source = options?.rewardPointEntry || options?.rewardPoint || {};
  const pointItemId = normalizeRewardPointIdForModal(source.pointItemId || source.itemId || source.key || options?.rewardPointItemId);
  const amount = parseAmount(source.amount || options?.amount);
  return {
    pointItemId,
    amount,
    forceRewardPointEnabled: !!(
      source.forceRewardPointEnabled
      || source.enabled
      || options?.forceRewardPointEnabled
      || options?.source === 'reward-settings'
      || options?.rewardPointEntry
      || options?.rewardPoint
    ),
  };
}

function ensureTxAddModal() {
  if (document.getElementById('tx-add-modal')) return;
  const container = document.getElementById('modals-container') || document.body;
  container.insertAdjacentHTML('beforeend', `
    <div class="tds-modal-overlay" id="tx-add-modal" onclick="if(event.target===this)closeModal('tx-add-modal')">
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
  bindRewardPointPanel(root);
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
    const rewardPointEntry = readRewardPointEntryForm(e.currentTarget, amount);
    if (rewardPointEntry?.error) {
      showToast(rewardPointEntry.error, 2200, 'error');
      return;
    }
    if (rewardPointEntry) payload.rewardPointEntry = rewardPointEntry;
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

function reimbursementPanel(tx) {
  const checked = isReimbursementExpected(tx);
  const helpText = '체크하면 홈 히어로와 월간 캘린더 소비금액에서는 빠지고, 환급예정금액으로 따로 집계됩니다.';
  return `
    <div class="tx-refund-panel ${checked ? 'active' : ''}">
      <label class="tx-refund-check">
        <input type="checkbox" name="reimbursementExpected" ${checked ? 'checked' : ''}>
        <span>환급예정</span>
      </label>
      <span class="tx-refund-help" tabindex="0" aria-label="${escAttr(helpText)}" title="${escAttr(helpText)}" data-tooltip="${escAttr(helpText)}">?</span>
    </div>
  `;
}

async function loadRewardPointItems(selectedEntry = null) {
  try {
    const settings = await getAppSettings();
    return normalizeModalRewardPointItems(settings?.rewardSavings?.pointItems, selectedEntry);
  } catch (err) {
    console.warn('[tx-edit-modal] reward point settings load failed', err);
    return normalizeModalRewardPointItems([], selectedEntry);
  }
}

function normalizeModalRewardPointItems(value = [], selectedEntry = null) {
  const selectedId = normalizeRewardPointIdForModal(selectedEntry?.pointItemId);
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item, index) => ({
      id: normalizeRewardPointIdForModal(item?.id || item?.key),
      label: String(item?.label || `포인트 ${index + 1}`).trim().slice(0, 32) || `포인트 ${index + 1}`,
      enabled: item?.enabled !== false && item?.enabled !== 'false',
      order: Number.isFinite(Number(item?.order)) ? Number(item.order) : (index + 1) * 10,
    }))
    .filter(item => item.id && (item.enabled || item.id === selectedId))
    .sort((a, b) => a.order - b.order);
  if (selectedId && !normalized.some(item => item.id === selectedId)) {
    normalized.push({
      id: selectedId,
      label: String(selectedEntry?.pointItemLabel || selectedId).trim().slice(0, 32) || selectedId,
      enabled: true,
      order: normalized.length * 10 + 10,
    });
  }
  return normalized;
}

function rewardPointEntryPanel(tx = {}, pointItems = [], options = {}) {
  const entry = normalizeExistingRewardPointEntry(tx.rewardPointEntry, tx.amount);
  const selectedPointItemId = normalizeRewardPointIdForModal(options.selectedPointItemId);
  const selectedId = entry?.pointItemId || selectedPointItemId;
  const checked = !!entry || (!!options.forceRewardPointEnabled && !!pointItems.length);
  const disabled = !pointItems.length;
  const amount = entry?.amount || parseAmount(options.amount);
  const helpText = disabled
    ? '설정에서 포인트 항목을 추가하면 거래에 정산을 연결할 수 있어요.'
    : '선택한 포인트 항목의 월간 잔액에서 차감됩니다.';
  return `
    <div class="tx-point-panel ${checked ? 'active' : ''} ${disabled ? 'disabled' : ''}">
      <label class="tx-point-check">
        <input type="checkbox" name="rewardPointEnabled" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span>포인트 정산</span>
      </label>
      <div class="tx-point-fields" aria-hidden="${checked ? 'false' : 'true'}">
        <label>
          <span>항목</span>
          <select class="tds-select" name="rewardPointItemId" ${disabled ? 'disabled' : ''}>
            ${rewardPointOptionsHtml(pointItems, selectedId)}
          </select>
        </label>
        <label>
          <span>차감액</span>
          <input class="tds-input" name="rewardPointAmount" inputmode="numeric" value="${amount ? escAttr(amount) : ''}" placeholder="거래 금액" ${disabled ? 'disabled' : ''}>
        </label>
      </div>
      <div class="tx-point-help">${escHtml(helpText)}</div>
    </div>
  `;
}

function rewardPointOptionsHtml(pointItems, selectedId) {
  return pointItems.map(item => `
    <option value="${escAttr(item.id)}" data-point-label="${escAttr(item.label)}" ${item.id === selectedId ? 'selected' : ''}>
      ${escHtml(item.label)}
    </option>
  `).join('');
}

function normalizeExistingRewardPointEntry(entry, fallbackAmount) {
  if (!entry || typeof entry !== 'object') return null;
  const pointItemId = normalizeRewardPointIdForModal(entry.pointItemId || entry.itemId || entry.key);
  const amount = parseAmount(entry.amount ?? fallbackAmount);
  if (!pointItemId || amount <= 0) return null;
  return {
    pointItemId,
    pointItemLabel: String(entry.pointItemLabel || entry.label || pointItemId).trim().slice(0, 32) || pointItemId,
    amount,
  };
}

function readRewardPointEntryForm(form, fallbackAmount) {
  const enabled = !!form.querySelector('[name=rewardPointEnabled]')?.checked;
  if (!enabled) return null;
  const select = form.querySelector('[name=rewardPointItemId]');
  const pointItemId = normalizeRewardPointIdForModal(select?.value);
  if (!pointItemId) return { error: '정산할 포인트 항목을 선택하세요.' };
  const selectedOption = select?.selectedOptions?.[0];
  const amountInput = form.querySelector('[name=rewardPointAmount]');
  const amount = parseAmount(amountInput?.value || fallbackAmount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: '포인트 차감액을 1P 이상으로 입력하세요.' };
  return {
    pointItemId,
    pointItemLabel: String(selectedOption?.dataset?.pointLabel || selectedOption?.textContent || pointItemId).trim().slice(0, 32) || pointItemId,
    direction: 'spend',
    amount,
  };
}

function bindRewardPointPanel(root) {
  const input = root.querySelector('[name=rewardPointEnabled]');
  input?.addEventListener('change', () => {
    const panel = input.closest('.tx-point-panel');
    panel?.classList.toggle('active', input.checked);
    panel?.querySelector('.tx-point-fields')?.setAttribute('aria-hidden', input.checked ? 'false' : 'true');
    const amountInput = panel?.querySelector('[name=rewardPointAmount]');
    const txAmountInput = root.querySelector('[name=amount]');
    if (input.checked && amountInput && txAmountInput && !String(amountInput.value || '').trim()) {
      amountInput.value = txAmountInput.value || '';
    }
  });
}

function normalizeRewardPointIdForModal(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 48);
}

function getTypeEmoji(type) {
  return ({
    card_payment: '💳',
    transfer_out: '↗️',
    transfer_in: '↙️',
    internal_transfer: '🔄',
    settlement_in: '💰',
    settlement_out: '💸',
  })[type] || '📦';
}

function sharedPaymentHtml(tx) {
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
          ${[2, 3, 4].map(n => `<button type="button" class="tds-btn sm secondary" onclick="window.applySharedPaymentFromModal('${tx.id}', ${n}, false)">${n}명</button>`).join('')}
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
        ${[2, 3, 4].map(n => `<button type="button" class="tds-btn sm secondary" onclick="window.applySharedPaymentFromModal('${tx.id}', ${n}, false)">${n}명</button>`).join('')}
      </div>
      <label class="tx-shared-remember">
        <input type="checkbox" id="shared-remember-${tx.id}">
        다음에도 자동
      </label>
    </div>
  `;
}

function isShareableTx(tx) {
  return ['card_payment', 'transfer_out'].includes(tx.type) && Number(tx.amount) > 0;
}

function groupedCategoryOptions(categories, selectedName) {
  const expense = categories
    .filter(c => c.kind === 'expense' && c.name !== UNCATEGORIZED_CATEGORY_NAME)
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
  const income = categories.filter(c => c.kind === 'income');
  const groups = {};
  for (const cat of expense) {
    const parent = cat.parent || '기타';
    if (!groups[parent]) groups[parent] = [];
    groups[parent].push(cat);
  }
  const expenseHtml = Object.entries(groups).map(([parent, rows]) => `
    <optgroup label="${escHtml(parent)}">
      ${rows.map(c => `<option value="${escHtml(c.name)}" ${selectedName === c.name ? 'selected' : ''}>${c.emoji || ''} ${escHtml(c.name)}</option>`).join('')}
    </optgroup>
  `).join('');
  const incomeHtml = income.length ? `
    <optgroup label="수입">
      ${income.map(c => `<option value="${escHtml(c.name)}" ${selectedName === c.name ? 'selected' : ''}>${c.emoji || ''} ${escHtml(c.name)}</option>`).join('')}
    </optgroup>
  ` : '';
  return expenseHtml + incomeHtml;
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
  const rewardPointEntry = readRewardPointEntryForm(e.target, amount);
  if (rewardPointEntry?.error) {
    showToast(rewardPointEntry.error, 2200, 'error');
    return;
  }
  patch.rewardPointEntry = rewardPointEntry || null;
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

function bindTxDetailEditor(root) {
  bindRewardPointPanel(root);

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

function subcategoryEditorHtml(categories, categoryName, selectedName) {
  const cat = categories.find(c => c.name === categoryName);
  const subs = normalizeSubcategories(cat?.subcategories);
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

function renderSubcategoryEditor(root, categoryName, selectedName) {
  const holder = root.querySelector('#tx-subcategory-editor');
  if (!holder) return;
  holder.innerHTML = subcategoryEditorHtml(getCategories(), categoryName, selectedName);
  const summaryValue = root.querySelector('#tx-subcategory-details summary strong');
  if (summaryValue) summaryValue.textContent = selectedName || '미지정';
}

function normalizeSubcategories(value) {
  return Array.isArray(value)
    ? value.map((item, index) => typeof item === 'string'
      ? { id: `legacy_${index}`, name: item }
      : { id: item.id || `legacy_${index}`, name: item.name || '' })
      .filter(item => item.name)
    : [];
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
