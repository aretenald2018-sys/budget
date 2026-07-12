export function parseTransactionAmount(value) {
  const normalized = String(value || '').replace(/[^\d.-]/g, '');
  return Math.round(Math.abs(Number(normalized)));
}

export function replaceAbortableBinding(bindings, root) {
  bindings.get(root)?.abort();
  const controller = new AbortController();
  bindings.set(root, controller);
  return controller.signal;
}
