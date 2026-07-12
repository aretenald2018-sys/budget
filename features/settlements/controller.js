import { settlementState as STATE } from './state.js?v=20260712-current-surface-r1';

let renderSettle = async () => {};

export function bindSettlementController(root, renderer) {
  renderSettle = renderer;
  if (root.dataset.settleEventsBound === 'true') return;
  root.dataset.settleEventsBound = 'true';
  root.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-settle-action]');
    if (!target || !root.contains(target)) return;
    if (target.dataset.settleAction === 'select-mode') {
      STATE.mode = ['in', 'out', 'all'].includes(target.dataset.mode) ? target.dataset.mode : 'in';
      renderSettle();
      return;
    }
    if (target.dataset.settleAction === 'open-transaction') {
      window.openTxEditModal?.(target.dataset.id);
    }
  });
}
