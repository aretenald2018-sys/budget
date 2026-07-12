import {
  saveCategorySubcategory,
  updateTransaction,
} from '../../../data.js?v=20260712-domain-rules-r2';
import { showToast } from '../../../utils/toast.js';
import {
  isUnassignedSubcategory,
  normalizeSubcategoryOptions,
  subcategoryOptionsForCategory,
} from './state.js';
import { subcategoryClassifierHtml } from './view.js';

export function createSubcategoryClassifierController(options = {}) {
  const getContext = typeof options.getContext === 'function' ? options.getContext : () => ({});
  const patchTransactions = typeof options.patchTransactions === 'function' ? options.patchTransactions : () => {};
  const updateCategories = typeof options.updateCategories === 'function' ? options.updateCategories : () => {};
  const refreshDrill = typeof options.refreshDrill === 'function' ? options.refreshDrill : () => {};
  const refreshReport = typeof options.refreshReport === 'function' ? options.refreshReport : () => {};

  function open() {
    const context = getContext();
    const drill = context.drill;
    if (!drill || drill.type !== 'category') return;
    const txs = (context.transactions || []).filter(tx => isUnassignedSubcategory(tx.subcategory));
    if (!txs.length) {
      showToast('분류할 미지정 거래가 없습니다.', 1600, 'warning');
      refreshDrill();
      return;
    }

    const category = (context.categories || []).find(cat => cat.name === drill.categoryName);
    const subcategories = subcategoryOptionsForCategory(category);
    const modal = ensureModal();
    modal.querySelector('.tds-modal-title').textContent = [category?.emoji, '상세분류 지정'].filter(Boolean).join(' ');
    modal.querySelector('#report-subcategory-classify-body').innerHTML = subcategoryClassifierHtml(txs, subcategories, drill.mode);
    window.openModal('report-subcategory-classify-modal');
    sync(modal);
  }

  function ensureModal() {
    let modal = document.getElementById('report-subcategory-classify-modal');
    if (!modal) {
      const container = document.getElementById('modals-container') || document.body;
      container.insertAdjacentHTML('beforeend', `
        <div class="tds-modal-overlay report-subcategory-classify-modal" id="report-subcategory-classify-modal" role="dialog" aria-modal="true">
          <div class="tds-modal-sheet report-subcategory-classify-sheet">
            <div class="tds-modal-handle"></div>
            <div class="tds-modal-content" style="text-align:left">
              <div class="tds-modal-title">상세분류 지정</div>
              <div id="report-subcategory-classify-body"></div>
            </div>
          </div>
        </div>
      `);
      modal = document.getElementById('report-subcategory-classify-modal');
    }
    bind(modal);
    return modal;
  }

  function bind(modal) {
    if (!modal || modal.dataset.reportSubcategoryBound) return;
    modal.dataset.reportSubcategoryBound = 'true';
    modal.addEventListener('click', event => {
      if (event.target === modal) {
        close();
        return;
      }
      const actionTarget = closestActionTarget(event.target, modal);
      const action = actionTarget?.dataset.reportAction;
      if (action === 'close-subcategory-classifier') close();
      else if (action === 'save-subcategory-classifier') save(modal);
    });
    modal.addEventListener('change', event => {
      const target = event.target;
      if (target?.dataset?.reportAction === 'toggle-subcategory-all') {
        modal.querySelectorAll('input[name="txIds"]').forEach(input => { input.checked = target.checked; });
      }
      if (target?.name === 'txIds' || target?.name === 'subcategory' || target?.dataset?.reportAction === 'toggle-subcategory-all') {
        sync(modal);
      }
    });
    modal.addEventListener('submit', event => event.preventDefault());
  }

  function sync(modal = document.getElementById('report-subcategory-classify-modal')) {
    if (!modal) return;
    const txInputs = Array.from(modal.querySelectorAll('input[name="txIds"]'));
    const checkedCount = txInputs.filter(input => input.checked).length;
    const allInput = modal.querySelector('[data-report-action="toggle-subcategory-all"]');
    if (allInput) {
      allInput.checked = txInputs.length > 0 && checkedCount === txInputs.length;
      allInput.indeterminate = checkedCount > 0 && checkedCount < txInputs.length;
    }
    const selectedCount = modal.querySelector('[data-selected-count]');
    if (selectedCount) selectedCount.textContent = `${checkedCount}건 선택`;
    const select = modal.querySelector('select[name="subcategory"]');
    const saveButton = modal.querySelector('[data-report-action="save-subcategory-classifier"]');
    if (saveButton && saveButton.dataset.saving !== 'true') {
      saveButton.disabled = !checkedCount || !String(select?.value || '').trim();
    }
  }

  async function save(modal) {
    const subcategory = String(modal.querySelector('select[name="subcategory"]')?.value || '').trim();
    const txIds = Array.from(modal.querySelectorAll('input[name="txIds"]:checked')).map(input => input.value);
    if (!subcategory) {
      showToast('상세분류를 선택하세요.', 1600, 'warning');
      sync(modal);
      return;
    }
    if (!txIds.length) {
      showToast('분류할 거래를 선택하세요.', 1600, 'warning');
      sync(modal);
      return;
    }

    const saveButton = modal.querySelector('[data-report-action="save-subcategory-classifier"]');
    if (saveButton?.dataset.saving === 'true') return;
    if (saveButton) {
      saveButton.dataset.saving = 'true';
      saveButton.disabled = true;
      saveButton.textContent = '저장 중';
    }

    try {
      await ensureSubcategoryExists(subcategory);
      await Promise.all(txIds.map(txId => updateTransaction(txId, { subcategory })));
      patchTransactions(txIds, { subcategory });
      showToast(`${txIds.length}건 상세분류 저장됨`, 1500, 'success');
      close();
      refreshDrill();
      refreshReport();
    } catch (err) {
      showToast(err.message || '상세분류 저장 실패', 2600, 'error');
    } finally {
      if (saveButton) {
        delete saveButton.dataset.saving;
        saveButton.textContent = '확인';
        sync(modal);
      }
    }
  }

  async function ensureSubcategoryExists(subcategory) {
    const context = getContext();
    const drill = context.drill;
    if (!drill || drill.type !== 'category') return;
    const category = (context.categories || []).find(cat => cat.name === drill.categoryName);
    const currentSubs = normalizeSubcategoryOptions(category?.subcategories);
    if (currentSubs.some(sub => sub.name === subcategory)) return;
    const saved = await saveCategorySubcategory(drill.categoryName, { name: subcategory });
    updateCategories((context.categories || []).map(cat => cat.name === drill.categoryName
      ? { ...cat, subcategories: [...currentSubs, saved] }
      : cat));
  }

  function close() {
    window.closeModal('report-subcategory-classify-modal');
  }

  return { open };
}

function closestActionTarget(target, root) {
  const element = target?.closest ? target : target?.parentElement;
  const actionTarget = element?.closest?.('[data-report-action]');
  return actionTarget && root?.contains?.(actionTarget) ? actionTarget : null;
}
