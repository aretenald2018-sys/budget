import { listNewsfeedItems, getTelegramPublicFeedStatus } from './data.js?v=20260712-domain-rules-r2';
import { $ } from './utils/dom.js';
import {
  newsfeedState as STATE,
  cursorForNewsfeedItem,
  mergeNewsfeedItems,
  normalizeNewsfeedPage,
} from './features/newsfeed/state.js?v=20260712-newsfeed-features';
import { errorStateHtml, newsfeedViewHtml } from './features/newsfeed/view.js?v=20260712-newsfeed-features';
import { bindNewsfeedController, NEWSFEED_PAGE_SIZE } from './features/newsfeed/controller.js?v=20260712-current-surface-r1';

export async function renderNewsfeed(context = {}) {
  const root = $('#tab-newsfeed');
  if (!root) return;
  bindNewsfeedController(root);
  const refreshStatic = context?.source === 'refresh';
  const keepExpandedCount = refreshStatic ? Math.max(STATE.items.length, NEWSFEED_PAGE_SIZE) : NEWSFEED_PAGE_SIZE;
  if (!refreshStatic || !STATE.items.length) {
    root.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  }

  const category = STATE.category === 'all' ? '' : STATE.category;
  const [page, status] = await Promise.all([
    listNewsfeedItems({ page: true, pageSize: NEWSFEED_PAGE_SIZE, category, refreshStatic }).catch(err => ({ error: err })),
    getTelegramPublicFeedStatus({ refreshStatic }).catch(() => null),
  ]);

  if (page?.error) {
    root.innerHTML = errorStateHtml(page.error);
    return;
  }

  const nextPage = normalizeNewsfeedPage(page);
  if (refreshStatic && STATE.items.length) {
    STATE.items = mergeNewsfeedItems(nextPage.items, STATE.items).slice(0, keepExpandedCount);
    STATE.hasMore = STATE.hasMore || nextPage.hasMore;
    STATE.nextCursor = STATE.hasMore ? cursorForNewsfeedItem(STATE.items[STATE.items.length - 1], STATE.items.length) : null;
    STATE.total = nextPage.total ?? STATE.total;
  } else {
    STATE.items = nextPage.items;
    STATE.nextCursor = nextPage.nextCursor;
    STATE.hasMore = nextPage.hasMore;
    STATE.total = nextPage.total;
  }
  STATE.status = status;
  root.innerHTML = newsfeedViewHtml(STATE);
}
