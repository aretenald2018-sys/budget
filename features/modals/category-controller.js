import {
  SUGGESTED_CATEGORY_GROUPS,
  UNCATEGORIZED_CATEGORY_NAME,
  deleteCategory,
  getCategories,
  getCategoryById,
  listTransactions,
  saveCategory,
} from '../../data.js';
import { groupNameOf, groupOptionsFrom, groupOrderFor, nextGroupOrder } from '../../domain/categories/groups.js';
import { budgetRhythmHint } from '../../domain/budget/model.js';
import { $, escHtml, isFormWithId } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

const NEW_GROUP_VALUE = '__new__';

let keywordPreviewTimer = null;

export function openCategoryModalController(categoryId = null) {
  const form = $('#category-form');
  if (!form) return;
  form.reset();
  form.querySelector('[name=id]').value = '';
  $('#category-delete-btn').style.display = 'none';
  $('#category-modal-title').textContent = '카테고리 추가';
  renderGroupOptions('');

  if (categoryId) {
    const category = getCategoryById(categoryId);
    if (!category) {
      showToast('카테고리를 찾을 수 없음', 2000, 'error');
      return;
    }
    form.querySelector('[name=id]').value = category.id;
    form.querySelector('[name=name]').value = category.name || '';
    form.querySelector('[name=emoji]').value = category.emoji || '';
    renderGroupOptions(groupNameOf(category));
    setCategoryRadio(form, 'kind', category.kind || 'expense');
    form.querySelector('[name=target]').value = category.target || 0;
    setCategoryRadio(form, 'budgetRhythm', category.budgetRhythm || 'spread');
    form.querySelector('[name=autoMatch]').value = (category.autoMatch || []).join(',');
    $('#category-delete-btn').style.display = '';
    $('#category-modal-title').textContent = '카테고리 수정';
  }
  syncCategoryPills(form);
  syncRhythmHint();
  syncGroupFields();
  previewKeywordImpact();
  window.openModal('category-modal');
}

// 그룹 선택지 = 실제 카테고리 데이터에서 유도한 그룹 + 추천 그룹 + 미분류 + 새 그룹.
function renderGroupOptions(selected = '') {
  const select = $('#category-parent-select');
  if (!select) return;
  const names = groupOptionsFrom(getCategories(), {
    uncategorizedName: UNCATEGORIZED_CATEGORY_NAME,
    suggested: SUGGESTED_CATEGORY_GROUPS,
  });
  const current = String(selected || '').trim();
  if (current && !names.includes(current)) names.unshift(current);
  select.innerHTML = [
    ...names.map(name => `<option value="${escHtml(name)}"${name === current ? ' selected' : ''}>${escHtml(name)}</option>`),
    `<option value="${NEW_GROUP_VALUE}">+ 새 그룹 만들기…</option>`,
  ].join('');
  if (!current) select.value = names[0] || UNCATEGORIZED_CATEGORY_NAME;
}

// 수입 카테고리는 그룹 개념이 없다. '새 그룹 만들기' 를 고르면 이름 입력칸을 연다.
function syncGroupFields() {
  const form = $('#category-form');
  const wrap = $('#category-parent-group');
  const select = $('#category-parent-select');
  const draft = $('#category-parent-draft');
  if (!form || !wrap || !select || !draft) return;
  const isExpense = form.querySelector('input[name="kind"]:checked')?.value !== 'income';
  wrap.style.display = isExpense ? '' : 'none';
  draft.style.display = isExpense && select.value === NEW_GROUP_VALUE ? '' : 'none';
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

// 비용 성격이 '써도 되는 돈' 계산을 어떻게 바꾸는지 그 자리에서 설명한다.
// (예전에는 아무 계산에도 쓰이지 않는 '관리 방식'(tier) 만 있었고, 실제 레버인
//  budgetRhythm 은 UI 가 아예 없어서 고정비를 지정할 방법이 없었다.)
function syncRhythmHint() {
  const form = $('#category-form');
  const hint = $('#category-rhythm-hint');
  const group = $('#category-rhythm-group');
  if (!form || !hint || !group) return;
  const isExpense = form.querySelector('input[name="kind"]:checked')?.value !== 'income';
  group.style.display = isExpense ? '' : 'none';
  const value = form.querySelector('input[name="budgetRhythm"]:checked')?.value || 'spread';
  hint.textContent = budgetRhythmHint(value);
}

async function saveCategoryFromModal(event) {
  // form.id 로 폼을 식별하면 안 된다. HTMLFormElement 는 자식 컨트롤을 name 으로
  // 노출하고(named getter) 그 이름이 내장 속성을 덮어쓴다. 이 폼에는
  // <input type="hidden" name="id"> 가 있어서 form.id 가 문자열이 아니라 그 input
  // 이었고, 비교가 항상 실패해 preventDefault 가 안 걸렸다. 그 결과 '저장'이
  // 네이티브 GET 전송이 돼 ?id=&name=... 로 페이지가 통째로 새로고침됐다
  // (= 카테고리가 추가되지 않고 앱이 초기화됨).
  if (!isFormWithId(event.target, 'category-form')) return;
  event.preventDefault();
  const fd = new FormData(event.target);
  const category = Object.fromEntries(fd.entries());
  const groupResult = resolveGroupFromForm(category);
  delete category.parentDraft;
  category.budgetRhythm = ['fixed', 'spread', 'front_loaded'].includes(category.budgetRhythm)
    ? category.budgetRhythm
    : 'spread';
  if (groupResult.error) {
    showToast(groupResult.error, 2400, 'error');
    return;
  }
  category.parent = groupResult.parent;
  if (groupResult.parentOrder != null) category.parentOrder = groupResult.parentOrder;
  category.target = Number(category.target) || 0;
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

// 폼 값 → 저장할 { parent, parentOrder }. 새 그룹이면 이름을 검증하고 순서를 새로 딴다.
function resolveGroupFromForm(category = {}) {
  if (category.kind === 'income') return { parent: null, parentOrder: null };
  const categories = getCategories();
  const picked = String(category.parent || '').trim();
  if (picked === NEW_GROUP_VALUE) {
    const draft = String(category.parentDraft || '').trim().slice(0, 20);
    if (!draft) return { error: '새 그룹 이름을 입력하세요.' };
    return {
      parent: draft,
      parentOrder: groupOrderFor(categories, draft, { uncategorizedName: UNCATEGORIZED_CATEGORY_NAME })
        || nextGroupOrder(categories, { uncategorizedName: UNCATEGORIZED_CATEGORY_NAME }),
    };
  }
  const parent = picked || UNCATEGORIZED_CATEGORY_NAME;
  return {
    parent,
    parentOrder: groupOrderFor(categories, parent, { uncategorizedName: UNCATEGORIZED_CATEGORY_NAME }),
  };
}

function syncCategoryForm(event) {
  if (!event.target.closest('#category-form')) return;
  if (['kind', 'budgetRhythm'].includes(event.target.name)) {
    syncCategoryPills(event.target.form);
    syncRhythmHint();
  }
  if (event.target.name === 'kind' || event.target.name === 'parent') syncGroupFields();
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
