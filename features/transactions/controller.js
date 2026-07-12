import { bindTransactionEvents } from './events.js';
import { transactionState as STATE } from './state.js';

export function bindTransactionController(root, handlers = {}) {
  bindTransactionEvents(root, {
    'shift-month': target => handlers.shiftMonth?.(Number(target.dataset.monthDelta) || 0),
    'clear-day': () => handlers.clearDay?.(),
    'select-day': target => handlers.selectDay?.(Number(target.dataset.day) || 0),
    'select-reimbursement': () => handlers.selectReimbursement?.(),
    'open-review-guide': () => handlers.openReviewGuide?.(),
    'open-detail': target => window.openTxEditModal?.(target.dataset.txId),
    add: () => window.openTxAddModal?.(),
  });

  if (!STATE.scrollBound) {
    window.addEventListener('scroll', () => {
      if (window.getCurrentTab && window.getCurrentTab() !== 'tx') return;
      const remaining = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (remaining < 200) handlers.loadMore?.();
    });
    STATE.scrollBound = true;
  }
}
