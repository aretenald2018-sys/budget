export function createNewsfeedState() {
  return {
    category: 'all',
    bound: false,
    refreshTimer: null,
    items: [],
    nextCursor: null,
    hasMore: false,
    total: null,
    status: null,
    loadingMore: false,
    digestMenuOpen: false,
    digestLoadingMode: '',
  };
}

export const newsfeedState = createNewsfeedState();

export function normalizeNewsfeedPage(value) {
  if (Array.isArray(value)) {
    return { items: value, nextCursor: null, hasMore: false, total: value.length };
  }
  return {
    items: Array.isArray(value?.items) ? value.items : [],
    nextCursor: value?.nextCursor || null,
    hasMore: !!value?.hasMore,
    total: typeof value?.total === 'number' ? value.total : null,
  };
}

export function resetNewsfeedPageState(state) {
  state.items = [];
  state.nextCursor = null;
  state.hasMore = false;
  state.total = null;
  state.loadingMore = false;
}

export function mergeNewsfeedItems(primary = [], secondary = []) {
  const byId = new Map();
  for (const item of [...primary, ...secondary]) {
    const key = item.id || `${item.sourceId}:${item.messageId}`;
    if (!key || byId.has(key)) continue;
    byId.set(key, item);
  }
  return [...byId.values()].sort(compareFeedItems);
}

export function compareFeedItems(a, b) {
  const dateDiff = normalizeNewsfeedDate(b.postedAt)?.getTime() - normalizeNewsfeedDate(a.postedAt)?.getTime();
  if (dateDiff) return dateDiff;
  const sourceDiff = String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
  if (sourceDiff) return sourceDiff;
  return Number(b.messageId || 0) - Number(a.messageId || 0);
}

export function cursorForNewsfeedItem(item, offset) {
  if (!item) return null;
  const postedAt = normalizeNewsfeedDate(item.postedAt);
  return {
    postedAt: postedAt ? postedAt.toISOString() : null,
    sourceId: item.sourceId || '',
    messageId: item.messageId || '',
    offset,
  };
}

export function normalizeNewsfeedDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
