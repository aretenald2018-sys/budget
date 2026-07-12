const boundRoots = new WeakSet();

export function bindWineEvents(root, onAction) {
  if (!root || boundRoots.has(root)) return;
  boundRoots.add(root);
  root.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-wine-action]');
    if (!target || !root.contains(target)) return;
    onAction(target.dataset.wineAction, target, event);
  });
}
