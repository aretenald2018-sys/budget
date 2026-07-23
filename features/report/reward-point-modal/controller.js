import {
  deleteRewardPointEntry,
  saveRewardPointEntry,
} from '../../../data.js';
import { showToast } from '../../../utils/toast.js';
import {
  buildRewardPointModalModel,
  findRewardPointEntry,
  normalizeRewardPointModalId,
  rewardPointDateInput,
} from './state.js';
import { rewardPointModalHtml } from './view.js';

export function createRewardPointModalController(options = {}) {
  const getSnapshot = typeof options.getSnapshot === 'function' ? options.getSnapshot : () => ({});
  const refresh = typeof options.refresh === 'function' ? options.refresh : async () => {};

  function open(pointItemId) {
    const modal = ensureModal();
    render(modal, pointItemId);
    if (!modal.classList.contains('open')) window.openModal('reward-point-modal');
  }

  function ensureModal() {
    let modal = document.getElementById('reward-point-modal');
    if (!modal) {
      const container = document.getElementById('modals-container') || document.body;
      container.insertAdjacentHTML('beforeend', `
        <div class="tds-modal-overlay reward-point-modal" id="reward-point-modal" role="dialog" aria-modal="true" aria-labelledby="reward-point-modal-title">
          <div class="tds-modal-sheet reward-point-modal-sheet">
            <div class="tds-modal-handle"></div>
            <div class="tds-modal-content reward-point-modal-content" id="reward-point-modal-body"></div>
          </div>
        </div>
      `);
      modal = document.getElementById('reward-point-modal');
    }
    bind(modal);
    return modal;
  }

  function bind(modal) {
    if (!modal || modal.dataset.rewardPointModalBound) return;
    modal.dataset.rewardPointModalBound = 'true';
    modal.addEventListener('click', event => {
      if (event.target === modal) return; // backdrop 닫기는 modal-manager 전역 계약이 처리
      const actionTarget = event.target?.closest?.('[data-reward-point-entry-action]');
      if (!actionTarget || !modal.contains(actionTarget)) return;
      event.preventDefault();
      const action = actionTarget.dataset.rewardPointEntryAction;
      if (action === 'close') window.closeModal('reward-point-modal');
      else if (action === 'reset') resetForm(modal);
      else if (action === 'edit') edit(modal, actionTarget.dataset.rewardPointEntryId);
      else if (action === 'delete') remove(modal, actionTarget.dataset.rewardPointEntryId);
    });
    modal.addEventListener('submit', event => {
      const form = event.target?.closest?.('[data-reward-point-form]');
      if (!form || !modal.contains(form)) return;
      event.preventDefault();
      save(modal, form);
    });
  }

  function render(modal, pointItemId) {
    const body = modal?.querySelector('#reward-point-modal-body');
    if (!body) return;
    const model = buildRewardPointModalModel(getSnapshot(), pointItemId, modal.dataset.rewardPointId);
    modal.dataset.rewardPointId = model.selectedId;
    body.innerHTML = rewardPointModalHtml(model);
  }

  function edit(modal, entryId) {
    const entry = findRewardPointEntry(getSnapshot(), entryId);
    const form = modal?.querySelector('[data-reward-point-form]');
    if (!entry || !form) return;
    const pointItemId = normalizeRewardPointModalId(entry.pointItemId);
    if (pointItemId) form.elements.pointItemId.value = pointItemId;
    form.elements.entryId.value = String(entry.id);
    form.elements.amount.value = Math.max(0, Math.round(Number(entry.amount) || 0)) || '';
    form.elements.usedAt.value = rewardPointDateInput(entry.usedAt);
    form.elements.note.value = String(entry.note || '');
    form.querySelector('[type=submit]').textContent = '사용 기록 수정';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetForm(modal) {
    const form = modal?.querySelector('[data-reward-point-form]');
    if (!form) return;
    form.reset();
    form.elements.entryId.value = '';
    form.elements.usedAt.value = rewardPointDateInput(new Date());
    form.elements.pointItemId.value = modal.dataset.rewardPointId || form.elements.pointItemId.value;
    form.querySelector('[type=submit]').textContent = '사용 기록';
  }

  async function save(modal, form) {
    const submit = form.querySelector('[type=submit]');
    if (submit?.disabled) return;
    const fd = new FormData(form);
    const option = form.elements.pointItemId?.selectedOptions?.[0];
    const entryId = String(fd.get('entryId') || '').trim();
    try {
      if (submit) submit.disabled = true;
      await saveRewardPointEntry({
        id: entryId || undefined,
        pointItemId: fd.get('pointItemId'),
        pointItemLabel: option?.dataset?.pointLabel || option?.textContent,
        amount: fd.get('amount'),
        usedAt: fd.get('usedAt'),
        note: fd.get('note'),
      });
      modal.dataset.rewardPointId = normalizeRewardPointModalId(fd.get('pointItemId')) || modal.dataset.rewardPointId;
      showToast(entryId ? '포인트 사용 이력을 수정했어요.' : '포인트 사용을 기록했어요.', 1400, 'success');
      await refreshView(modal);
    } catch (err) {
      showToast(err.message || '포인트 사용 기록 저장 실패', 2400, 'error');
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function remove(modal, entryId) {
    const entry = findRewardPointEntry(getSnapshot(), entryId);
    if (!entry || !window.confirm('이 포인트 사용 이력을 삭제할까요?')) return;
    try {
      await deleteRewardPointEntry(entry.id);
      showToast('포인트 사용 이력을 삭제했어요.', 1400, 'success');
      await refreshView(modal);
    } catch (err) {
      showToast(err.message || '포인트 사용 이력 삭제 실패', 2400, 'error');
    }
  }

  async function refreshView(modal) {
    await refresh();
    if (modal?.classList.contains('open')) render(modal, modal.dataset.rewardPointId);
  }

  return { open };
}
