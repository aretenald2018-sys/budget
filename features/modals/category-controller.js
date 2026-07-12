import { deleteCategory, getCategoryById, listTransactions, saveCategory } from '../../data.js';
import { $ } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

let keywordPreviewTimer = null;

export function openCategoryModalController(categoryId = null) {
  const form = $('#category-form');
  if (!form) return;
  form.reset();
  form.querySelector('[name=id]').value = '';
  $('#category-delete-btn').style.display = 'none';
  $('#category-modal-title').textContent = '카테고리 추가';

  if (categoryId) {
    const category = getCategoryById(categoryId);
    if (!category) {
      showToast('카테고리를 찾을 수 없음', 2000, 'error');
      return;
    }
    form.querySelector('[name=id]').value = category.id;
    form.querySelector('[name=name]').value = category.name || '';
    form.querySelector('[name=emoji]').value = category.emoji || '';
    setCategoryRadio(form, 'kind', category.kind || 'expense');
    form.querySelector('[name=target]').value = category.target || 0;
    setCategoryRadio(form, 'tier', category.tier || 'variable');
    form.querySelector('[name=targetBiweekly]').value = category.targetBiweekly || 0;
    form.querySelector('[name=countTarget]').value = category.countTarget || 0;
    form.querySelector('[name=autoMatch]').value = (category.autoMatch || []).join(',');
    $('#category-delete-btn').style.display = '';
    $('#category-modal-title').textContent = '카테고리 수정';
  }
  syncCategoryPills(form);
  syncBalanceFields();
  previewKeywordImpact();
  window.openModal('category-modal');
}

function setCategoryRadio(form, name, value) {
  const input = Array.from(form.querySelectorAll(`input[name="${name}"]`)).find(item => item.value === value);
  if (input) input.checked = true;
}

function syncCategoryPills(form = $('#category-form')) {
  if (!form) return;
  form.querySelectorAll('[data-radio-group]').forEach(group => {
    const name = group.dataset.radioGroup;
    group.querySelectorAll('label').forEach(label => {
      label.classList.toggle('active', !!label.querySelector(`input[name="${name}"]`)?.checked);
    });
  });
}

function syncBalanceFields() {
  const form = $('#category-form');
  const fields = $('#category-balance-fields');
  if (!form || !fields) return;
  fields.style.display = form.querySelector('input[name="tier"]:checked')?.value === 'balance' ? '' : 'none';
}

async function saveCategoryFromModal(event) {
  if (event.target.id !== 'category-form') return;
  event.preventDefault();
  const fd = new FormData(event.target);
  const category = Object.fromEntries(fd.entries());
  category.target = Number(category.target) || 0;
  category.tier = category.tier || 'variable';
  category.targetBiweekly = Number(category.targetBiweekly) || 0;
  category.countTarget = Number(category.countTarget) || 0;
  if (category.tier !== 'balance') {
    category.targetBiweekly = 0;
    category.countTarget = 0;
  }
  category.autoMatch = (category.autoMatch || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!category.id) delete category.id;
  try {
    await saveCategory(category);
    showToast('저장됨', 1500, 'success');
    window.closeModal('category-modal');
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '카테고리 저장 실패', 3000, 'error');
  }
}

function syncCategoryForm(event) {
  if (!event.target.closest('#category-form')) return;
  if (event.target.name === 'kind' || event.target.name === 'tier') {
    syncCategoryPills(event.target.form);
    syncBalanceFields();
  }
}

function queueKeywordPreview(event) {
  if (event.target.name !== 'autoMatch' || event.target.closest('#category-form') == null) return;
  clearTimeout(keywordPreviewTimer);
  keywordPreviewTimer = setTimeout(previewKeywordImpact, 220);
}

async function previewKeywordImpact() {
  const form = $('#category-form');
  const helper = $('#category-keyword-helper');
  if (!form || !helper) return;
  const keywords = String(form.querySelector('[name=autoMatch]')?.value || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (!keywords.length) {
    helper.textContent = '파싱된 거래의 가맹점명에 이 키워드가 포함되면 자동으로 이 카테고리로 분류됩니다.';
    return;
  }
  helper.textContent = '영향 받을 거래를 확인 중...';
  try {
    const transactions = await listTransactions({ max: 1000 });
    const normalized = keywords.map(normalizeKeywordText);
    const matched = transactions.filter(transaction => {
      const text = normalizeKeywordText([
        transaction.merchant,
        transaction.counterparty,
        transaction.memo,
        transaction.body,
      ].filter(Boolean).join(' '));
      return normalized.some(keyword => keyword && text.includes(keyword));
    });
    helper.textContent = matched.length
      ? `최근 거래 ${matched.length}건이 이 키워드에 걸립니다. 저장 후 같은 소비처 자동분류 기준으로 쓰입니다.`
      : '최근 거래에는 바로 걸리는 항목이 없습니다. 다음 거래부터 자동분류 기준으로 쓰입니다.';
  } catch {
    helper.textContent = '영향 미리보기를 불러오지 못했습니다. 저장은 그대로 가능합니다.';
  }
}

function normalizeKeywordText(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

async function deleteCategoryFromModal(event) {
  if (event.target.id !== 'category-delete-btn') return;
  const id = $('#category-form [name=id]').value;
  if (!id || !confirm('이 카테고리를 삭제할까요? 이 카테고리로 분류된 거래들은 미분류로 남습니다.')) return;
  try {
    await deleteCategory(id);
    showToast('삭제됨', 1500, 'success');
    window.closeModal('category-modal');
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '카테고리 삭제 실패', 3000, 'error');
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('submit', saveCategoryFromModal);
  document.addEventListener('change', syncCategoryForm);
  document.addEventListener('input', queueKeywordPreview);
  document.addEventListener('click', deleteCategoryFromModal);
}
