import { deleteAccount, getAccountById, saveAccount } from '../../data.js';
import { $ } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

export function openAccountModalController(accountId = null) {
  const form = $('#account-form');
  if (!form) return;
  form.reset();
  form.querySelector('[name=id]').value = '';
  $('#account-delete-btn').style.display = 'none';
  $('#account-modal-title').textContent = '계좌 추가';

  if (accountId) {
    const account = getAccountById(accountId);
    if (!account) {
      showToast('계좌를 찾을 수 없음', 2000, 'error');
      return;
    }
    form.querySelector('[name=id]').value = account.id;
    setAccountRadio(form, 'type', account.type || 'card');
    form.querySelector('[name=issuer]').value = account.issuer || '';
    form.querySelector('[name=last4]').value = account.last4 || '';
    form.querySelector('[name=alias]').value = account.alias || '';
    form.querySelector('[name=matchKeywords]').value = (account.matchKeywords || []).join(',');
    $('#account-delete-btn').style.display = '';
    $('#account-modal-title').textContent = '계좌 수정';
  }
  syncAccountPills(form);
  window.openModal('account-modal');
}

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

async function saveAccountFromModal(event) {
  if (event.target.id !== 'account-form') return;
  event.preventDefault();
  const fd = new FormData(event.target);
  const account = Object.fromEntries(fd.entries());
  account.matchKeywords = (account.matchKeywords || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!account.id) delete account.id;
  try {
    await saveAccount(account);
    showToast('저장됨', 1500, 'success');
    window.closeModal('account-modal');
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '계좌 저장 실패', 3000, 'error');
  }
}

async function deleteAccountFromModal(event) {
  if (event.target.id !== 'account-delete-btn') return;
  const id = $('#account-form [name=id]').value;
  if (!id || !confirm('이 계좌를 삭제할까요? 기존 거래는 유지됩니다.')) return;
  try {
    await deleteAccount(id);
    showToast('삭제됨', 1500, 'success');
    window.closeModal('account-modal');
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '계좌 삭제 실패', 3000, 'error');
  }
}

function syncAccountType(event) {
  if (!event.target.closest('#account-form') || event.target.name !== 'type') return;
  syncAccountPills(event.target.form);
}

if (typeof document !== 'undefined') {
  document.addEventListener('change', syncAccountType);
  document.addEventListener('submit', saveAccountFromModal);
  document.addEventListener('click', deleteAccountFromModal);
}
