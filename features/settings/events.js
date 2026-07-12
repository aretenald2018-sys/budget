const boundRoots = new WeakSet();

export function bindSettingsEvents(root, onAction) {
  if (!root || boundRoots.has(root)) return;
  boundRoots.add(root);
  root.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-settings-action]');
    if (!target || !root.contains(target)) return;
    onAction(target.dataset.settingsAction, target, event);
  });
}
