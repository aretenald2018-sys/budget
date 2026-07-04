import { listNewsfeedItems, getTelegramPublicFeedStatus } from './data.js?v=20260704-newsfeed-backfill-pagination-v3';
import { TELEGRAM_PUBLIC_SOURCES } from './utils/telegram-sources.js?v=20260704-telegram-newsfeed-v2';
import { fmtDateTime, relTime } from './utils/format.js';
import { $, escHtml } from './utils/dom.js';
import { showToast } from './utils/toast.js';

const STATE = {
	category: 'all',
	bound: false,
	refreshTimer: null,
	items: [],
	nextCursor: null,
	hasMore: false,
	total: null,
	status: null,
	loadingMore: false,
};

const NEWSFEED_REFRESH_MS = 2 * 60 * 1000;
const NEWSFEED_PAGE_SIZE = 60;

const CATEGORY_ORDER = [
  '리포트 및 요약 분석',
  '종합시황',
  '국내시황/스크랩',
  '미국시황',
  'Macro',
  '섹터',
  'IB',
  '마인드 컨트롤',
  '부동산',
];

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
		root.innerHTML = errorState(page.error);
		return;
	}

	const nextPage = normalizePage(page);
	if (refreshStatic && STATE.items.length) {
		STATE.items = mergeNewsfeedItems(nextPage.items, STATE.items).slice(0, keepExpandedCount);
		STATE.hasMore = STATE.hasMore || nextPage.hasMore;
		STATE.nextCursor = STATE.hasMore ? cursorForItem(STATE.items[STATE.items.length - 1], STATE.items.length) : null;
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
			resetNewsfeedPageState();
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
		const page = normalizePage(await listNewsfeedItems({
			page: true,
			pageSize: NEWSFEED_PAGE_SIZE,
			category,
			cursor: STATE.nextCursor,
		}));
		STATE.items = mergeNewsfeedItems(STATE.items, page.items);
		STATE.nextCursor = page.nextCursor || (page.hasMore ? cursorForItem(STATE.items[STATE.items.length - 1], STATE.items.length) : null);
		STATE.hasMore = page.hasMore;
		STATE.total = page.total ?? STATE.total;
	} catch (err) {
		showToast(`뉴스를 더 불러오지 못했습니다: ${err?.message || '오류'}`, 2200, 'error');
	} finally {
		STATE.loadingMore = false;
		renderNewsfeedView(root);
	}
}

function renderNewsfeedView(root) {
	const items = STATE.items;
	root.innerHTML = `
    ${heroHtml(items, STATE.status)}
    ${filterHtml()}
    <div class="newsfeed-list" data-newsfeed-list>
      ${items.length ? items.map(feedCardHtml).join('') : emptyStateHtml(STATE.total || 0)}
    </div>
    ${paginationHtml(items)}
  `;
}

function heroHtml(items, status) {
	const sourceCount = TELEGRAM_PUBLIC_SOURCES.length;
	const lastRunAt = normalizeDate(status?.lastRunAt);
	const totalItems = Number(STATE.total || status?.itemCount || items.length || 0);
	const latestItemAt = items.map(item => normalizeDate(item.postedAt)).filter(Boolean)
		.sort((a, b) => b.getTime() - a.getTime())[0] || null;
	return `
    <section class="newsfeed-hero">
      <div class="newsfeed-hero-main">
        <div>
          <div class="label">공개 Telegram 뉴스</div>
          <div class="amount">${totalItems}<span class="unit">건</span></div>
        </div>
        <button type="button" class="newsfeed-refresh-btn" data-newsfeed-action="refresh" aria-label="뉴스피드 새로고침">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M20 12a8 8 0 0 1-13.3 6"></path><path d="M4 12a8 8 0 0 1 13.3-6"></path><path d="M17 2.8V6h-3.2"></path><path d="M7 21.2V18h3.2"></path></svg>
        </button>
      </div>
      <div class="newsfeed-hero-meta">
        <span>${sourceCount}개 공개 채널</span>
        <span>${lastRunAt ? `수집 ${relTime(lastRunAt)}` : '수집 대기'}</span>
        <span>${latestItemAt ? `최신 글 ${relTime(latestItemAt)}` : '저장된 글 없음'}</span>
        ${status?.truncated ? '<span>일부만 표시</span>' : ''}
      </div>
    </section>
  `;
}

function filterHtml() {
	const counts = new Map();
	for (const source of TELEGRAM_PUBLIC_SOURCES) {
		counts.set(source.category, (counts.get(source.category) || 0) + 1);
	}
	const categories = CATEGORY_ORDER.filter(category => counts.has(category))
		.concat([...counts.keys()].filter(category => !CATEGORY_ORDER.includes(category)).sort());
	return `
    <div class="newsfeed-filter" role="tablist" aria-label="뉴스피드 카테고리">
      ${filterButton('all', '전체', TELEGRAM_PUBLIC_SOURCES.length)}
      ${categories.map(category => filterButton(category, category, counts.get(category) || 0)).join('')}
    </div>
  `;
}

function filterButton(value, label, count) {
  const active = STATE.category === value;
  return `
    <button type="button" class="newsfeed-filter-chip ${active ? 'active' : ''}" data-newsfeed-category="${escHtml(value)}" aria-selected="${active ? 'true' : 'false'}">
      <span>${escHtml(label)}</span>
      <em>${Number(count || 0)}</em>
    </button>
  `;
}

function feedCardHtml(item) {
  const postedAt = normalizeDate(item.postedAt);
  const text = String(item.text || '').trim();
  const summary = text || '본문 없는 Telegram 메시지입니다.';
  const links = Array.isArray(item.links) ? item.links.filter(link => link?.url).slice(0, 2) : [];
  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  return `
    <article class="newsfeed-card">
      <div class="newsfeed-card-head">
        <div class="newsfeed-source-mark">${sourceInitial(item.sourceTitle)}</div>
        <div class="newsfeed-source-body">
          <div class="newsfeed-source-line">
            <strong>${escHtml(item.sourceTitle || 'Telegram')}</strong>
            <span>${escHtml(item.sourceCategory || '뉴스')}</span>
          </div>
          <div class="newsfeed-time">${postedAt ? `${fmtDateTime(postedAt)} · ${relTime(postedAt)}` : '시간 정보 없음'}</div>
        </div>
      </div>
      <a class="newsfeed-title" href="${escAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escHtml(item.title || firstLine(summary))}</a>
      <div class="newsfeed-text">${escHtml(summary)}</div>
      ${attachments.length || links.length ? `
        <div class="newsfeed-card-foot">
          ${attachments.length ? `<span class="newsfeed-pill">${attachmentsLabel(attachments)}</span>` : ''}
          ${links.map(link => `<a class="newsfeed-link-pill" href="${escAttr(link.url)}" target="_blank" rel="noopener noreferrer">${escHtml(link.label || link.url)}</a>`).join('')}
        </div>
      ` : ''}
    </article>
  `;
}

function emptyStateHtml(totalItems) {
  if (totalItems > 0) {
    return `
      <div class="empty-state newsfeed-empty">
        <div class="icon">!</div>
        <div>이 카테고리에는 아직 저장된 글이 없습니다</div>
        <div class="st4">전체 탭을 보거나 다음 수집 주기를 기다리세요.</div>
      </div>
    `;
  }
  return `
    <div class="empty-state newsfeed-empty">
      <div class="icon">!</div>
      <div>아직 수집된 뉴스가 없습니다</div>
      <div class="st4">GitHub Actions의 Telegram public feed job이 실행되면 최신 글이 여기에 쌓입니다.</div>
    </div>
  `;
}

function paginationHtml(items) {
	if (!items.length) return '';
	if (STATE.loadingMore) {
		return `
      <div class="newsfeed-pagination">
        <button type="button" class="newsfeed-load-more" disabled>
          <span class="loading-spinner mini"></span>
          <span>불러오는 중</span>
        </button>
      </div>
    `;
	}
	if (STATE.hasMore) {
		return `
      <div class="newsfeed-pagination">
        <button type="button" class="newsfeed-load-more" data-newsfeed-action="load-more">
          더 보기
        </button>
      </div>
    `;
	}
	return `
    <div class="newsfeed-pagination done">
      ${STATE.total ? `${items.length} / ${STATE.total}건 표시` : '마지막 글까지 표시했습니다'}
    </div>
  `;
}

function errorState(err) {
  return `
    <div class="empty-state newsfeed-empty">
      <div class="icon">!</div>
      <div>뉴스피드를 불러오지 못했습니다</div>
      <div class="st4">${escHtml(err?.message || 'Firestore 응답을 확인하세요.')}</div>
      <button type="button" class="tds-btn sm secondary" data-tab-retry="newsfeed">다시 시도</button>
    </div>
  `;
}

function attachmentsLabel(attachments) {
  const counts = attachments.reduce((acc, item) => {
    const type = item?.type || 'file';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts).map(([type, count]) => `${attachmentTypeLabel(type)} ${count}`).join(' · ');
}

function attachmentTypeLabel(type) {
  if (type === 'image') return '이미지';
  if (type === 'video') return '영상';
  if (type === 'document') return '문서';
  return '첨부';
}

function sourceInitial(value) {
  return escHtml(String(value || 'T').trim().slice(0, 1).toUpperCase() || 'T');
}

function firstLine(value) {
  return String(value || '').split(/\n+/).map(line => line.trim()).find(Boolean) || 'Telegram';
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizePage(value) {
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

function resetNewsfeedPageState() {
	STATE.items = [];
	STATE.nextCursor = null;
	STATE.hasMore = false;
	STATE.total = null;
	STATE.loadingMore = false;
}

function mergeNewsfeedItems(primary, secondary) {
	const byId = new Map();
	for (const item of [...primary, ...secondary]) {
		const key = item.id || `${item.sourceId}:${item.messageId}`;
		if (!key || byId.has(key)) continue;
		byId.set(key, item);
	}
	return [...byId.values()].sort(compareFeedItems);
}

function compareFeedItems(a, b) {
	const dateDiff = normalizeDate(b.postedAt)?.getTime() - normalizeDate(a.postedAt)?.getTime();
	if (dateDiff) return dateDiff;
	const sourceDiff = String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
	if (sourceDiff) return sourceDiff;
	return Number(b.messageId || 0) - Number(a.messageId || 0);
}

function cursorForItem(item, offset) {
	if (!item) return null;
	const postedAt = normalizeDate(item.postedAt);
	return {
		postedAt: postedAt ? postedAt.toISOString() : null,
		sourceId: item.sourceId || '',
		messageId: item.messageId || '',
		offset,
	};
}

function escAttr(value) {
  return escHtml(value).replace(/`/g, '&#96;');
}
