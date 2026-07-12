import { listNewsfeedItems, getTelegramPublicFeedStatus, getNewsfeedDigestSnapshot } from './data.js?v=20260712-domain-rules';
import { $ } from './utils/dom.js';
import { showToast } from './utils/toast.js';
import {
  createNewsfeedState,
  cursorForNewsfeedItem,
  mergeNewsfeedItems,
  normalizeNewsfeedPage,
  resetNewsfeedPageState,
} from './features/newsfeed/state.js?v=20260712-newsfeed-features';
import { buildDigestPayload, formatBytes } from './features/newsfeed/digest.js?v=20260712-newsfeed-features';
import { errorStateHtml, newsfeedViewHtml } from './features/newsfeed/view.js?v=20260712-newsfeed-features';

const STATE = createNewsfeedState();
const NEWSFEED_REFRESH_MS = 2 * 60 * 1000;
const NEWSFEED_PAGE_SIZE = 60;

export async function renderNewsfeed(context = {}) {
  const root = $('#tab-newsfeed');
  if (!root) return;
  bindNewsfeed(root);
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
  renderNewsfeedView(root);
}

function bindNewsfeed(root) {
  if (STATE.bound) return;
  STATE.bound = true;
  root.addEventListener('click', event => {
    const categoryButton = event.target?.closest?.('[data-newsfeed-category]');
    if (categoryButton && root.contains(categoryButton)) {
      event.preventDefault();
      STATE.category = categoryButton.dataset.newsfeedCategory || 'all';
      resetNewsfeedPageState(STATE);
      window.refreshCurrentTab?.();
      return;
    }
    const refreshButton = event.target?.closest?.('[data-newsfeed-action="refresh"]');
    if (refreshButton && root.contains(refreshButton)) {
      event.preventDefault();
      showToast('뉴스피드를 다시 불러옵니다.', 1200, 'info');
      window.refreshCurrentTab?.();
      return;
    }
    const loadMoreButton = event.target?.closest?.('[data-newsfeed-action="load-more"]');
    if (loadMoreButton && root.contains(loadMoreButton)) {
      event.preventDefault();
      loadMoreNewsfeed(root);
      return;
    }
    const digestMenuButton = event.target?.closest?.('[data-newsfeed-action="digest-menu"]');
    if (digestMenuButton && root.contains(digestMenuButton)) {
      event.preventDefault();
      STATE.digestMenuOpen = !STATE.digestMenuOpen;
      renderNewsfeedView(root);
      return;
    }
    const digestButton = event.target?.closest?.('[data-newsfeed-digest]');
    if (digestButton && root.contains(digestButton)) {
      event.preventDefault();
      copyNewsfeedDigest(root, digestButton.dataset.newsfeedDigest || 'daily');
    }
  });
  if (!STATE.refreshTimer) {
    STATE.refreshTimer = window.setInterval(refreshNewsfeedIfActive, NEWSFEED_REFRESH_MS);
  }
}

function refreshNewsfeedIfActive() {
  if (document.hidden) return;
  if (window.getCurrentTab?.() !== 'newsfeed') return;
  window.refreshCurrentTab?.();
}

async function loadMoreNewsfeed(root) {
  if (STATE.loadingMore || !STATE.hasMore || !STATE.nextCursor) return;
  STATE.loadingMore = true;
  renderNewsfeedView(root);
  try {
    const category = STATE.category === 'all' ? '' : STATE.category;
    const page = normalizeNewsfeedPage(await listNewsfeedItems({
      page: true,
      pageSize: NEWSFEED_PAGE_SIZE,
      category,
      cursor: STATE.nextCursor,
    }));
    STATE.items = mergeNewsfeedItems(STATE.items, page.items);
    STATE.nextCursor = page.nextCursor || (page.hasMore ? cursorForNewsfeedItem(STATE.items[STATE.items.length - 1], STATE.items.length) : null);
    STATE.hasMore = page.hasMore;
    STATE.total = page.total ?? STATE.total;
  } catch (err) {
    showToast(`뉴스를 더 불러오지 못했습니다: ${err?.message || '오류'}`, 2200, 'error');
  } finally {
    STATE.loadingMore = false;
    renderNewsfeedView(root);
  }
}

async function copyNewsfeedDigest(root, mode) {
  if (STATE.digestLoadingMode) return;
  STATE.digestLoadingMode = mode;
  renderNewsfeedView(root);
  try {
    const snapshot = await getNewsfeedDigestSnapshot({ refreshStatic: true });
    const digest = buildDigestPayload(snapshot, mode);
    await writeClipboardText(digest.text);
    STATE.digestMenuOpen = false;
    showToast(`${digest.rangeLabel} ${digest.itemCount.toLocaleString('ko-KR')}건 · ${formatBytes(digest.payloadBytes)} 복사 완료`, 2600, 'success');
  } catch (err) {
    showToast(`다이제스트를 복사하지 못했습니다: ${err?.message || '오류'}`, 2600, 'error');
  } finally {
    STATE.digestLoadingMode = '';
    renderNewsfeedView(root);
  }
}

function renderNewsfeedView(root) {
  root.innerHTML = newsfeedViewHtml(STATE);
}

async function writeClipboardText(text) {
  let clipboardError = null;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      clipboardError = err;
    }
  }
  if (fallbackCopyText(text)) return;
  throw clipboardError || new Error('브라우저 클립보드 권한이 없습니다.');
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}
