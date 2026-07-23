import { saveBudgetAdjustment } from '../../data.js';
import { showToast } from '../../utils/toast.js';
import { effectiveTargetFor, usedFor } from '../report/budget-summary/state.js';
import { buildFundCardModels, fundsState, localISODate } from './state.js';
import { fundDetailModalHtml, reallocationModalHtml } from './view.js';

let fundActionsBound = false;

export function bindFundActions() {
  if (fundActionsBound || typeof document === 'undefined') return;
  fundActionsBound = true;

  document.addEventListener('click', event => {
    const actionTarget = event.target?.closest?.('[data-fund-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.fundAction;
    if (action === 'toggle-expand') toggleFundPanel(actionTarget);
    else if (action === 'open-fund') openFundDetail(actionTarget.dataset.fundId);
    else if (action === 'close-detail') window.closeModal?.('fund-detail-modal');
    else if (action === 'open-reallocation') openReallocation(actionTarget.dataset);
    else if (action === 'close-realloc') window.closeModal?.('fund-realloc-modal');
  });

  document.addEventListener('submit', event => {
    const depositForm = event.target?.closest?.('[data-fund-deposit-form]');
    if (depositForm) {
      event.preventDefault();
      saveFundDeposit(depositForm);
      return;
    }
    const reallocForm = event.target?.closest?.('[data-fund-realloc-form]');
    if (reallocForm) {
      event.preventDefault();
      saveReallocation(reallocForm);
    }
  });
}

function toggleFundPanel(button) {
  const section = button.closest('.fund-cards-section');
  const panel = section?.querySelector('.fund-cards-panel');
  if (!panel) return;
  const expanded = panel.hasAttribute('hidden');
  panel.toggleAttribute('hidden', !expanded);
  fundsState.expanded = expanded;
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  button.innerHTML = button.innerHTML.replace(expanded ? '▸' : '▾', expanded ? '▾' : '▸');
}

function currentFundModels() {
  return buildFundCardModels(fundsState.funds, fundsState.drawTxsByFund, fundsState.adjustments, new Date());
}

function openFundDetail(fundId) {
  const model = currentFundModels().find(item => item.id === fundId);
  const body = ensureModal('fund-detail-modal');
  if (!body) return;
  body.innerHTML = fundDetailModalHtml(model, { draws: model?.recentDraws || [] });
  window.openModal?.('fund-detail-modal');
}

function openReallocation(dataset = {}) {
  const target = {
    kind: dataset.targetKind === 'fund' ? 'fund' : 'category',
    id: dataset.targetId || null,
    label: dataset.targetLabel || '',
  };
  const suggestedAmount = Math.max(0, Math.round(Number(dataset.suggestAmount) || 0));
  const body = ensureModal('fund-realloc-modal');
  if (!body) return;
  window.closeModal?.('fund-detail-modal');
  body.innerHTML = reallocationModalHtml({
    target,
    suggestedAmount,
    sources: reallocationSources(target),
  });
  window.openModal?.('fund-realloc-modal');
}

// 출처 후보: 여유가 남은 조절비 카테고리 + 잔액이 남은 충당금 + 예산 외 입금. 여유 큰 순.
function reallocationSources(target) {
  const { categories, byCategory, monthKey, mode, periodAdjustments } = fundsState;
  const categorySources = (categories || [])
    .filter(cat => !(target.kind === 'category' && (cat.id === target.id || cat.name === target.label)))
    .map(cat => ({
      key: `category:${cat.id || cat.name}`,
      kind: 'category',
      id: cat.id || null,
      label: cat.name,
      icon: cat.emoji || '',
      slack: effectiveTargetFor(cat, monthKey, mode, periodAdjustments) - usedFor(cat, byCategory),
    }))
    .filter(source => source.slack > 0);
  const fundSources = currentFundModels()
    .filter(model => model.balance > 0)
    .filter(model => !(target.kind === 'fund' && model.id === target.id))
    .map(model => ({
      key: `fund:${model.id}`,
      kind: 'fund',
      id: model.id,
      label: model.name,
      icon: model.emoji,
      slack: model.balance,
    }));
  return [...categorySources, ...fundSources]
    .sort((a, b) => b.slack - a.slack)
    .concat([{ key: 'external', kind: 'external', id: null, label: '예산 외 입금', icon: '💼', slack: 0 }]);
}

async function saveReallocation(form) {
  const submit = form.querySelector('[type=submit]');
  if (submit?.disabled) return;
  const fd = new FormData(form);
  const selected = form.querySelector('input[name=sourceKey]:checked');
  if (!selected) {
    showToast('가져올 곳을 선택하세요.', 2200, 'error');
    return;
  }
  const amount = Math.round(Number(String(fd.get('amount') || '').replace(/[^0-9]/g, '')) || 0);
  try {
    if (submit) submit.disabled = true;
    await saveBudgetAdjustment({
      monthKey: fundsState.monthKey,
      scope: fundsState.mode === 'month' ? 'month' : 'cycle',
      cycleStartDate: fundsState.mode === 'month' ? null : fundsState.cycleStartDate,
      from: {
        kind: selected.dataset.sourceKind,
        id: selected.dataset.sourceId || null,
        label: selected.dataset.sourceLabel || null,
      },
      to: {
        kind: form.dataset.targetKind,
        id: form.dataset.targetId || null,
        label: form.dataset.targetLabel || null,
      },
      amount,
      note: fd.get('note'),
      occurredAt: new Date(),
    });
    showToast('재배분 완료 — 결정으로 기록했어요.', 1800, 'success');
    window.closeModal?.('fund-realloc-modal');
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '재배분 기록 실패', 2600, 'error');
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function saveFundDeposit(form) {
  const submit = form.querySelector('[type=submit]');
  if (submit?.disabled) return;
  const fd = new FormData(form);
  const amount = Math.round(Number(String(fd.get('amount') || '').replace(/[^0-9]/g, '')) || 0);
  try {
    if (submit) submit.disabled = true;
    await saveBudgetAdjustment({
      monthKey: fundsState.monthKey || undefined,
      scope: fundsState.mode === 'month' ? 'month' : 'cycle',
      cycleStartDate: fundsState.mode === 'month' ? null : (fundsState.cycleStartDate || localISODate()),
      from: { kind: 'external', id: null, label: '예산 외 입금' },
      to: { kind: 'fund', id: form.dataset.fundId, label: form.dataset.fundLabel },
      amount,
      note: '직접 입금',
      occurredAt: new Date(),
    });
    showToast('충당금에 입금을 기록했어요.', 1600, 'success');
    window.closeModal?.('fund-detail-modal');
    window.refreshCurrentTab?.();
  } catch (err) {
    showToast(err.message || '입금 기록 실패', 2600, 'error');
  } finally {
    if (submit) submit.disabled = false;
  }
}

function ensureModal(modalId) {
  let modal = document.getElementById(modalId);
  if (!modal) {
    const container = document.getElementById('modals-container') || document.body;
    container.insertAdjacentHTML('beforeend', `
      <div class="tds-modal-overlay" id="${modalId}" role="dialog" aria-modal="true">
        <div class="tds-modal-sheet">
          <div class="tds-modal-handle"></div>
          <div class="tds-modal-content" style="text-align:left" id="${modalId}-body"></div>
        </div>
      </div>
    `);
    modal = document.getElementById(modalId);
  }
  return document.getElementById(`${modalId}-body`);
}
