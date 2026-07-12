// ================================================================
// modals/category-modal.js — 카테고리 추가·수정
// ================================================================

import { saveCategory, deleteCategory, getCategoryById, listTransactions } from '../data.js?v=20260712-domain-rules-r2';
import { showToast } from '../utils/toast.js';
import { $ } from '../utils/dom.js';

export const MODAL_HTML = `
<div class="tds-modal-overlay" id="category-modal" onclick="if(event.target===this)closeModal('category-modal')">
  <div class="tds-modal-sheet">
    <div class="tds-modal-handle"></div>
    <div class="tds-modal-content" style="text-align:left">
      <div class="tds-modal-title" id="category-modal-title">카테고리 추가</div>

      <form id="category-form">
        <input type="hidden" name="id">

        <div class="form-group">
          <label>이름</label>
          <input class="tds-input" name="name" required placeholder="식비">
        </div>

        <div class="form-group">
          <label>이모지</label>
          <input class="tds-input" name="emoji" maxlength="4" placeholder="🍱">
        </div>

        <div class="form-group">
          <label>유형</label>
          <div class="tds-segmented category-kind-pills" data-radio-group="kind">
            <label class="segmented-item active"><input type="radio" name="kind" value="expense" checked>지출</label>
            <label class="segmented-item"><input type="radio" name="kind" value="income">수입</label>
          </div>
        </div>

        <div class="form-group">
          <label>월 예산 (원, 0이면 미설정)</label>
          <input class="tds-input" name="target" type="number" min="0" step="10000" placeholder="0">
        </div>

        <div class="form-group">
          <label>관리 방식</label>
          <div class="intent-row category-tier-pills" data-radio-group="tier" id="category-tier-select">
            <label class="intent-pill"><span class="em">⚙</span><input type="radio" name="tier" value="fixed">고정</label>
            <label class="intent-pill active"><span class="em">📊</span><input type="radio" name="tier" value="variable" checked>변동</label>
            <label class="intent-pill"><span class="em">⚖</span><input type="radio" name="tier" value="balance">균형</label>
            <label class="intent-pill"><span class="em">💰</span><input type="radio" name="tier" value="budget">예산</label>
          </div>
          <div class="st4" style="margin-top:4px">균형 카테고리는 술·와인, 야식처럼 횟수와 금액을 부드럽게 같이 봅니다.</div>
        </div>

        <div id="category-balance-fields" style="display:none">
          <div class="form-group">
            <label>격주 금액 기준 (원)</label>
            <input class="tds-input" name="targetBiweekly" type="number" min="0" step="10000" placeholder="0">
          </div>
          <div class="form-group">
            <label>격주 횟수 기준</label>
            <input class="tds-input" name="countTarget" type="number" min="0" step="1" placeholder="0">
          </div>
        </div>

        <div class="form-group">
          <label>자동분류 키워드 (콤마, 가맹점명 부분 일치)</label>
          <input class="tds-input" name="autoMatch" placeholder="GS25,세븐일레븐,편의점">
          <div class="st4" id="category-keyword-helper" style="margin-top:4px">파싱된 거래의 가맹점명에 이 키워드가 포함되면 자동으로 이 카테고리로 분류됩니다.</div>
        </div>

        <div class="flex gap-md" style="margin-top:24px">
          <button type="button" class="tds-btn ghost" id="category-delete-btn" style="display:none">삭제</button>
          <button type="button" class="tds-btn secondary" onclick="closeModal('category-modal')">취소</button>
          <button type="submit" class="tds-btn" style="flex:1">저장</button>
        </div>
      </form>
    </div>
  </div>
</div>
`;

export function openCategoryModal(categoryId = null) {
  const form = $('#category-form');
  form.reset();
  form.querySelector('[name=id]').value = '';
  $('#category-delete-btn').style.display = 'none';
  $('#category-modal-title').textContent = '카테고리 추가';

  if (categoryId) {
    const cat = getCategoryById(categoryId);
    if (!cat) { showToast('카테고리를 찾을 수 없음', 2000, 'error'); return; }
    form.querySelector('[name=id]').value = cat.id;
    form.querySelector('[name=name]').value = cat.name || '';
    form.querySelector('[name=emoji]').value = cat.emoji || '';
    setCategoryRadio(form, 'kind', cat.kind || 'expense');
    form.querySelector('[name=target]').value = cat.target || 0;
    setCategoryRadio(form, 'tier', cat.tier || 'variable');
    form.querySelector('[name=targetBiweekly]').value = cat.targetBiweekly || 0;
    form.querySelector('[name=countTarget]').value = cat.countTarget || 0;
    form.querySelector('[name=autoMatch]').value = (cat.autoMatch || []).join(',');
    $('#category-delete-btn').style.display = '';
    $('#category-modal-title').textContent = '카테고리 수정';
  }
  syncCategoryPills(form);
  syncBalanceFields();
  previewKeywordImpact();
  window.openModal('category-modal');
}

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'category-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const obj = Object.fromEntries(fd.entries());
  obj.target = Number(obj.target) || 0;
  obj.tier = obj.tier || 'variable';
  obj.targetBiweekly = Number(obj.targetBiweekly) || 0;
  obj.countTarget = Number(obj.countTarget) || 0;
  if (obj.tier !== 'balance') {
    obj.targetBiweekly = 0;
    obj.countTarget = 0;
  }
  obj.autoMatch = (obj.autoMatch || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!obj.id) delete obj.id;
  try {
    await saveCategory(obj);
    showToast('저장됨', 1500, 'success');
    window.closeModal('category-modal');
    if (window.refreshSettings) window.refreshSettings();
    if (window.refreshCurrentTab) window.refreshCurrentTab();
  } catch (err) {
    showToast(err.message, 3000, 'error');
  }
});

document.addEventListener('change', (e) => {
  if (!e.target.closest('#category-form')) return;
  if (e.target.name === 'kind' || e.target.name === 'tier') {
    syncCategoryPills(e.target.form);
    syncBalanceFields();
  }
});

let keywordPreviewTimer = null;
document.addEventListener('input', (e) => {
  if (e.target.name !== 'autoMatch' || e.target.closest('#category-form') == null) return;
  clearTimeout(keywordPreviewTimer);
  keywordPreviewTimer = setTimeout(previewKeywordImpact, 220);
});

function syncBalanceFields() {
  const form = $('#category-form');
  const fields = $('#category-balance-fields');
  if (!form || !fields) return;
  fields.style.display = form.querySelector('input[name="tier"]:checked')?.value === 'balance' ? '' : 'none';
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

async function previewKeywordImpact() {
  const form = $('#category-form');
  const helper = $('#category-keyword-helper');
  if (!form || !helper) return;
  const keywords = String(form.querySelector('[name=autoMatch]')?.value || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (!keywords.length) {
    helper.textContent = '파싱된 거래의 가맹점명에 이 키워드가 포함되면 자동으로 이 카테고리로 분류됩니다.';
    return;
  }
  helper.textContent = '영향 받을 거래를 확인 중...';
  try {
    const txs = await listTransactions({ max: 1000 });
    const normalized = keywords.map(normalizeKeywordText);
    const matched = txs.filter(tx => {
      const text = normalizeKeywordText([tx.merchant, tx.counterparty, tx.memo, tx.body].filter(Boolean).join(' '));
      return normalized.some(key => key && text.includes(key));
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

document.addEventListener('click', async (e) => {
  if (e.target.id !== 'category-delete-btn') return;
  const id = $('#category-form [name=id]').value;
  if (!id) return;
  if (!confirm('이 카테고리를 삭제할까요? 이 카테고리로 분류된 거래들은 미분류로 남습니다.')) return;
  try {
    await deleteCategory(id);
    showToast('삭제됨', 1500, 'success');
    window.closeModal('category-modal');
    if (window.refreshSettings) window.refreshSettings();
    if (window.refreshCurrentTab) window.refreshCurrentTab();
  } catch (err) {
    showToast(err.message, 3000, 'error');
  }
});

window.openCategoryModal = openCategoryModal;
