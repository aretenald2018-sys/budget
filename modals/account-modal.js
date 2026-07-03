// ================================================================
// modals/account-modal.js — 본인 계좌/카드 추가·수정
// ================================================================

import { saveAccount, deleteAccount, getAccountById } from '../data.js?v=20260703-daily-reward-loop';
import { showToast } from '../utils/toast.js';
import { $, escHtml } from '../utils/dom.js';

export const MODAL_HTML = `
<div class="tds-modal-overlay" id="account-modal" onclick="if(event.target===this)closeModal('account-modal')">
  <div class="tds-modal-sheet">
    <div class="tds-modal-handle"></div>
    <div class="tds-modal-content" style="text-align:left">
      <div class="tds-modal-title" id="account-modal-title">계좌 추가</div>

      <form id="account-form">
        <input type="hidden" name="id">

        <div class="form-group">
          <label>유형</label>
          <div class="intent-row account-type-pills" data-radio-group="type">
            <label class="intent-pill active"><span class="em">💳</span><input type="radio" name="type" value="card" checked required>카드</label>
            <label class="intent-pill"><span class="em">🏦</span><input type="radio" name="type" value="bank">은행</label>
            <label class="intent-pill"><span class="em">📱</span><input type="radio" name="type" value="kakaopay">간편결제</label>
          </div>
        </div>

        <div class="form-group">
          <label>발급사 / 은행 (예: 신한카드, 카카오뱅크)</label>
          <input class="tds-input" name="issuer" required placeholder="신한카드">
        </div>

        <div class="form-group">
          <label>식별 번호 끝 4자리 (선택)</label>
          <input class="tds-input" name="last4" maxlength="4" pattern="[0-9]{0,4}" placeholder="1234">
        </div>

        <div class="form-group">
          <label>표시 이름</label>
          <input class="tds-input" name="alias" required placeholder="신한 The More">
        </div>

        <div class="form-group">
          <label>SMS/알림 매칭 키워드 (콤마 구분, 발신자명/카드명 등)</label>
          <input class="tds-input" name="matchKeywords" placeholder="신한,The More,1544-7000">
          <div class="st4" style="margin-top:4px">파싱 시 이 키워드가 본문에 있으면 이 계좌로 매칭됩니다.</div>
        </div>

        <div class="flex gap-md" style="margin-top:24px">
          <button type="button" class="tds-btn ghost" id="account-delete-btn" style="display:none">삭제</button>
          <button type="button" class="tds-btn secondary" onclick="closeModal('account-modal')">취소</button>
          <button type="submit" class="tds-btn" style="flex:1">저장</button>
        </div>
      </form>
    </div>
  </div>
</div>
`;

export function openAccountModal(accountId = null) {
  const form = $('#account-form');
  form.reset();
  form.querySelector('[name=id]').value = '';
  $('#account-delete-btn').style.display = 'none';
  $('#account-modal-title').textContent = '계좌 추가';

  if (accountId) {
    const acc = getAccountById(accountId);
    if (!acc) { showToast('계좌를 찾을 수 없음', 2000, 'error'); return; }
    form.querySelector('[name=id]').value = acc.id;
    setAccountRadio(form, 'type', acc.type || 'card');
    form.querySelector('[name=issuer]').value = acc.issuer || '';
    form.querySelector('[name=last4]').value = acc.last4 || '';
    form.querySelector('[name=alias]').value = acc.alias || '';
    form.querySelector('[name=matchKeywords]').value = (acc.matchKeywords || []).join(',');
    $('#account-delete-btn').style.display = '';
    $('#account-modal-title').textContent = '계좌 수정';
  }
  syncAccountPills(form);

  window.openModal('account-modal');
}

document.addEventListener('change', (e) => {
  if (!e.target.closest('#account-form') || e.target.name !== 'type') return;
  syncAccountPills(e.target.form);
});

function setAccountRadio(form, name, value) {
  const input = Array.from(form.querySelectorAll(`input[name="${name}"]`)).find(item => item.value === value);
  if (input) input.checked = true;
}

function syncAccountPills(form = $('#account-form')) {
  if (!form) return;
  form.querySelectorAll('[data-radio-group]').forEach(group => {
    const name = group.dataset.radioGroup;
    group.querySelectorAll('label').forEach(label => {
      label.classList.toggle('active', !!label.querySelector(`input[name="${name}"]`)?.checked);
    });
  });
}

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'account-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const obj = Object.fromEntries(fd.entries());
  obj.matchKeywords = (obj.matchKeywords || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!obj.id) delete obj.id;
  try {
    await saveAccount(obj);
    showToast('저장됨', 1500, 'success');
    window.closeModal('account-modal');
    if (window.refreshSettings) window.refreshSettings();
  } catch (err) {
    showToast(err.message, 3000, 'error');
  }
});

document.addEventListener('click', async (e) => {
  if (e.target.id !== 'account-delete-btn') return;
  const id = $('#account-form [name=id]').value;
  if (!id) return;
  if (!confirm('이 계좌를 삭제할까요? 기존 거래는 유지됩니다.')) return;
  try {
    await deleteAccount(id);
    showToast('삭제됨', 1500, 'success');
    window.closeModal('account-modal');
    if (window.refreshSettings) window.refreshSettings();
  } catch (err) {
    showToast(err.message, 3000, 'error');
  }
});

window.openAccountModal = openAccountModal;
