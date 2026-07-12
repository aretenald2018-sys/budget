import {
  applySharedPayment,
  deleteCategorySubcategory,
  deleteTransaction,
  getCategories,
  saveCategorySubcategory,
  saveTransaction,
  updateTransaction,
} from '../../../data.js';
import { parseTransactionAmount, replaceAbortableBinding } from './binding-state.js';
import { subcategoryEditorHtml } from './view.js';
import { showToast } from '../../../utils/toast.js';

const rootBindings = new WeakMap();
let reopenTransactionDetail = null;

export function configureTransactionModalController({ reopenDetail } = {}) {
  if (typeof reopenDetail === 'function') reopenTransactionDetail = reopenDetail;
}

export function replaceRootBinding(root) {
  return replaceAbortableBinding(rootBindings, root);
}

export function bindTransactionAddController(root) {
  const signal = replaceRootBinding(root);
  root.querySelectorAll('.tx-add-type input').forEach(input => {
    input.addEventListener('change', () => {
      root.querySelectorAll('.tx-add-type .segmented-item').forEach(label => {
        label.classList.toggle('active', label.querySelector('input')?.checked);
      });
    }, { signal });
  });
  root.querySelector('#tx-add-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    const amount = parseTransactionAmount(fd.get('amount'));
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
  }, { signal });
}

export function bindTransactionDetailController(root) {
  const signal = replaceRootBinding(root);
  root.addEventListener('click', event => {
    const actionTarget = event.target?.closest?.('[data-tx-editor-action]');
    if (!actionTarget || !root.contains(actionTarget)) return;
    const txId = actionTarget.dataset.txId || root.querySelector('#tx-edit-form')?.dataset.txId;
    switch (actionTarget.dataset.txEditorAction) {
      case 'delete':
        deleteTransactionFromModal(txId);
        break;
      case 'cancel':
        window.closeModal?.('tx-edit-modal');
        break;
      case 'shared-payment':
        applySharedPaymentFromModal(txId, Number(actionTarget.dataset.peopleCount) || 2);
        break;
      default:
        break;
    }
  }, { signal });

  const categorySelect = root.querySelector('[name=category]');
  categorySelect?.addEventListener('change', () => {
    renderSubcategoryEditor(root, categorySelect.value, '');
  }, { signal });

  const refundInput = root.querySelector('[name=reimbursementExpected]');
  refundInput?.addEventListener('change', () => {
    refundInput.closest('.tx-refund-panel')?.classList.toggle('active', refundInput.checked);
  }, { signal });

  root.querySelector('#tx-subcategory-editor')?.addEventListener('click', event => {
    saveSubcategoryFromEditor(root, event);
  }, { signal });
  root.querySelector('#tx-subcategory-editor')?.addEventListener('change', event => {
    if (event.target?.name !== 'subcategory') return;
    const draft = root.querySelector('[name=subcategoryDraft]');
    if (draft) draft.value = event.target.value || '';
    const summaryValue = root.querySelector('#tx-subcategory-details summary strong');
    if (summaryValue) summaryValue.textContent = event.target.value || '미지정';
  }, { signal });
}

async function saveEditedTransaction(event) {
  if (event.target.id !== 'tx-edit-form') return;
  event.preventDefault();
  const txId = event.target.dataset.txId;
  const fd = new FormData(event.target);
  const amount = parseTransactionAmount(fd.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('금액을 1원 이상으로 입력하세요.', 2200, 'error');
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
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '거래 저장 실패', 3000, 'error');
  }
}

function retryTransactionDetail(event) {
  const actionTarget = event.target?.closest?.('[data-tx-modal-action]');
  if (actionTarget?.dataset.txModalAction === 'retry-detail') {
    reopenTransactionDetail?.(actionTarget.dataset.txId);
  }
}

async function saveSubcategoryFromEditor(root, event) {
  const action = event.target?.dataset?.subcategoryAction;
  if (!action) return;
  const categoryName = root.querySelector('[name=category]')?.value || '';
  const select = root.querySelector('[name=subcategory]');
  const selectedId = select?.selectedOptions?.[0]?.dataset?.id || '';
  const draftName = String(root.querySelector('[name=subcategoryDraft]')?.value || '').trim();
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
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '상세분류 저장 실패', 2600, 'error');
  }
}

function renderSubcategoryEditor(root, categoryName, selectedName) {
  const holder = root.querySelector('#tx-subcategory-editor');
  if (!holder) return;
  holder.innerHTML = subcategoryEditorHtml(getCategories(), categoryName, selectedName);
  const summaryValue = root.querySelector('#tx-subcategory-details summary strong');
  if (summaryValue) summaryValue.textContent = selectedName || '미지정';
}

async function deleteTransactionFromModal(txId) {
  if (!confirm('이 거래를 삭제할까요?')) return;
  try {
    await deleteTransaction(txId);
    showToast('삭제됨', 1500, 'success');
    window.closeModal('tx-edit-modal');
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '거래 삭제 실패', 3000, 'error');
  }
}

async function applySharedPaymentFromModal(txId, peopleCount) {
  try {
    const rememberRule = !!document.getElementById(`shared-remember-${txId}`)?.checked;
    await applySharedPayment(txId, peopleCount, { rememberRule });
    showToast(rememberRule ? '공동 결제 규칙까지 저장됨' : '내 부담액으로 반영됨', 1600, 'success');
    await reopenTransactionDetail?.(txId);
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '공동 결제 반영 실패', 3000, 'error');
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('submit', saveEditedTransaction);
  document.addEventListener('click', retryTransactionDetail);
}
