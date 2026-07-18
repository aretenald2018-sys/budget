const VALID_LAUNCH_ENTRIES = new Set(['spending', 'wine']);

export function normalizeBudgetLaunchEntry(value) {
  const entry = String(value || '').trim();
  return VALID_LAUNCH_ENTRIES.has(entry) ? entry : '';
}

export function readBudgetWebLaunchEntry(search = window.location.search) {
  return normalizeBudgetLaunchEntry(new URLSearchParams(search).get('entry'));
}

export function clearBudgetWebLaunchEntry(
  location = window.location,
  history = window.history,
  title = document.title,
) {
  const url = new URL(location.href);
  url.searchParams.delete('entry');
  history.replaceState(history.state ?? null, title, `${url.pathname}${url.search}${url.hash}`);
}

export function createBudgetLaunchEntryHandler({ switchTab, openWineCellar, clearWebEntry }) {
  if (typeof switchTab !== 'function' || typeof openWineCellar !== 'function') {
    throw new TypeError('Budget launch entry handler requires navigation callbacks.');
  }
  const clearEntry = typeof clearWebEntry === 'function' ? clearWebEntry : () => {};
  return function handleBudgetLaunchEntry(value, source = 'native') {
    const entry = normalizeBudgetLaunchEntry(value);
    if (!entry) return false;
    if (source === 'web-query') clearEntry();
    if (entry === 'spending') {
      switchTab('report');
      return true;
    }
    switchTab('home');
    void openWineCellar();
    return true;
  };
}

export function createBudgetLaunchEntryQueue({ isReady, onEntry }) {
  if (typeof isReady !== 'function' || typeof onEntry !== 'function') {
    throw new TypeError('Budget launch entry queue requires isReady and onEntry callbacks.');
  }

  const pending = [];

  function flush() {
    let delivered = 0;
    while (pending.length && isReady()) {
      const next = pending.shift();
      onEntry(next.entry, next.source);
      delivered += 1;
    }
    return delivered;
  }

  function enqueue(value, source = 'native') {
    const entry = normalizeBudgetLaunchEntry(value);
    if (!entry) return false;
    pending.push({ entry, source: String(source || '') });
    flush();
    return true;
  }

  return Object.freeze({
    enqueue,
    flush,
    pendingCount: () => pending.length,
  });
}

export function installBudgetNativeEntryReceiver(queue) {
  window.receiveBudgetNativeEntry = entry => queue.enqueue(entry, 'android-intent');
  const bufferedEntries = Array.isArray(window.__budgetNativeEntries)
    ? window.__budgetNativeEntries.splice(0)
    : [];
  bufferedEntries.forEach(entry => window.receiveBudgetNativeEntry(entry));
}
