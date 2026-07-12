export function bindTransactionEvents(root, handlers = {}) {
  if (!root || root.dataset.txEventsBound) return;
  root.dataset.txEventsBound = 'true';
  root.addEventListener('click', event => {
    const actionTarget = event.target?.closest?.('[data-tx-action]');
    if (!actionTarget || !root.contains(actionTarget)) return;
    const handler = handlers[actionTarget.dataset.txAction];
    if (typeof handler !== 'function') return;
    event.preventDefault();
    handler(actionTarget, event);
  });
}
