// ================================================================
// modals/tx-edit-modal.js — 거래 상세/수정
// 영수증 품목 표시, 카테고리 변경, 메모, 분류 확정 (needsReview=false)
// ================================================================

import {
  saveTransaction, getTransaction, updateTransaction, deleteTransaction,
  getAccounts, getCategories, getReceipt, applySharedPayment,
  saveCategorySubcategory, deleteCategorySubcategory,
  UNCATEGORIZED_CATEGORY_NAME, isReimbursementExpected,
} from '../data.js?v=20260701-toss-kim-taewoo';
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
  window.openModal('tx-edit-modal');
  const body = $('#tx-edit-body');
  body.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';

  const tx = await getTransaction(txId);
  if (!tx) {
    body.innerHTML = '<div class="empty-state">거래를 찾을 수 없음</div>';
    return;
  }

  const accounts = getAccounts();
  const categories = getCategories();
  const account = accounts.find(a => a.id === tx.accountId);
  const categoryOptions = groupedCategoryOptions(categories, tx.category);

  // 영수증 (있으면)
  let receiptHtml = '';
  if (tx.receiptIds?.length) {
    const receipts = await Promise.all(tx.receiptIds.map(id => getReceipt(id)));
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
    <form id="tx-edit-form" data-tx-id="${tx.id}">
      <div class="tx-receipt-form">
        ${sharedPaymentHtml(tx)}
        ${reimbursementPanel(tx)}

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
              <option value="${a.id}" ${tx.accountId === a.id ? 'selected' : ''}>
                ${escHtml(a.alias)}${a.last4 ? ` (${a.last4})` : ''}
              </option>
            `).join('')}
          </select>
        </label>

        <label class="tx-receipt-row">
          <span>가맹점 / 상대</span>
          <input class="tds-input" name="merchant" value="${escHtml(tx.merchant || tx.counterparty || '')}">
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
        <button type="button" class="tds-btn ghost" onclick="window.deleteTx('${tx.id}')">삭제</button>
        <button type="button" class="tds-btn secondary" onclick="closeModal('tx-edit-modal')">취소</button>
        <button type="submit" class="tds-btn" style="flex:1">저장</button>
      </div>
    </form>
  `;
  bindTxDetailEditor(body);
}

export function openTxAddModal() {
  ensureTxAddModal();
  window.openModal('tx-add-modal');
  const body = $('#tx-add-body');
  const accounts = getAccounts();
  const categories = getCategories();
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
        <button type="button" class="tds-btn secondary" onclick="closeModal('tx-add-modal')">취소</button>
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

function reimbursementPanel(tx) {
  const checked = isReimbursementExpected(tx);
  return `
    <label class="tx-refund-panel ${checked ? 'active' : ''}">
      <input type="checkbox" name="reimbursementExpected" ${checked ? 'checked' : ''}>
      <span>
        <strong>${checked ? '환급예정금액으로 분리됨' : '실손/병원비 환급 예정으로 처리'}</strong>
        <em>체크하면 홈 히어로와 월간 캘린더 소비금액에서는 빠지고, 환급예정금액으로 따로 집계됩니다.</em>
      </span>
    </label>
  `;
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
  const categorySelect = root.querySelector('[name=category]');
  categorySelect?.addEventListener('change', () => {
    renderSubcategoryEditor(root, categorySelect.value, '');
  });

  const refundInput = root.querySelector('[name=reimbursementExpected]');
  refundInput?.addEventListener('change', () => {
    refundInput.closest('.tx-refund-panel')?.classList.toggle('active', refundInput.checked);
    const title = refundInput.closest('.tx-refund-panel')?.querySelector('strong');
    if (title) title.textContent = refundInput.checked ? '환급예정금액으로 분리됨' : '실손/병원비 환급 예정으로 처리';
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
