const boundRoots = new WeakSet();

export function bindFinanceEvents(root, onAction) {
  if (!root || boundRoots.has(root)) return;
  boundRoots.add(root);

  root.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-finance-action]');
    if (!target || !root.contains(target)) return;
    if (target.hasAttribute('data-finance-backdrop') && event.target !== target) return;
    onAction(target.dataset.financeAction, target, event);
  });

  root.addEventListener('change', event => {
    const target = event.target?.closest?.('[data-finance-change]');
    if (!target || !root.contains(target)) return;
    onAction(target.dataset.financeChange, target, event);
  });
}
