import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { firestoreDb as _db, scope as _scope } from '../core/firebase.js';
import { normalizeDate as normalizeTxDate } from '../shared/normalize.js';

const STATIC_NEWSFEED_URL = './public/newsfeed/telegram-public-feed.json';
const STATIC_NEWSFEED_CACHE_MS = 2 * 60 * 1000;
let _staticNewsfeedSnapshotPromise = null;
let _staticNewsfeedSnapshotFetchedAt = 0;

export async function listNewsfeedItems(opts = {}) {
	try {
		const firestoreItems = await listFirestoreNewsfeedItems(opts);
		if (!shouldFallbackToStaticNewsfeed(firestoreItems, opts)) return firestoreItems;
		const fallbackItems = await listStaticNewsfeedItems(opts).catch(() => null);
		return hasNewsfeedItems(fallbackItems) ? fallbackItems : firestoreItems;
	} catch (err) {
		try {
			const fallbackItems = await listStaticNewsfeedItems(opts);
			if (opts.page) return fallbackItems;
			if (fallbackItems.length) return fallbackItems;
		} catch {
		}
		throw err;
  }
}

async function listFirestoreNewsfeedItems(opts = {}) {
	const max = newsfeedPageSize(opts);
	const fetchMax = opts.sourceId || opts.category ? Math.min(400, Math.max(max * 4, 120)) : max;
	const ref = collection(_db, 'users', _scope(), 'newsfeed_items');
	const cursorDate = newsfeedCursorDate(opts.cursor);
	const q = cursorDate
		? query(ref, orderBy('postedAt', 'desc'), startAfter(Timestamp.fromDate(cursorDate)), limit(fetchMax))
		: query(ref, orderBy('postedAt', 'desc'), limit(fetchMax));
	const snap = await getDocs(q);
	let rows = snap.docs.map(d => normalizeNewsfeedItem({ id: d.id, ...d.data() }));
	if (opts.sourceId) rows = rows.filter(item => item.sourceId === opts.sourceId);
	if (opts.category) rows = rows.filter(item => item.sourceCategory === opts.category);
	rows = rows.filter(item => !item.hidden).slice(0, max);
	return opts.page ? newsfeedPageResult(rows, max) : rows;
}

export async function getTelegramPublicFeedStatus(opts = {}) {
  let firestoreStatus = null;
  try {
    const ref = doc(_db, 'users', _scope(), 'integrations', 'telegram_public_feed');
    const snap = await getDoc(ref);
    if (snap.exists()) firestoreStatus = { id: snap.id, ...snap.data() };
  } catch {
  }
  const fallback = await loadStaticNewsfeedSnapshot(opts).catch(() => null);
  if (!fallback) return firestoreStatus;
  const staticStatus = normalizeStaticNewsfeedStatus(fallback);
  const firestoreCount = Number(firestoreStatus?.itemCount || 0);
  return staticStatus.itemCount > firestoreCount ? staticStatus : firestoreStatus || staticStatus;
}

export async function getNewsfeedDigestSnapshot(opts = {}) {
	const snapshot = await loadStaticNewsfeedSnapshot(opts);
	const items = Array.isArray(snapshot?.items)
		? snapshot.items
			.map(normalizeNewsfeedItem)
			.filter(item => !item.hidden)
			.sort(compareNewsfeedItems)
		: [];
	return {
		sourceType: snapshot?.sourceType || 'telegram_public_static',
		sourceVersion: snapshot?.sourceVersion || '',
		generatedAt: snapshot?.generatedAt || null,
		since: snapshot?.since || null,
		sourceCount: Number(snapshot?.sourceCount || 0),
		fetched: Number(snapshot?.fetched || 0),
		failed: Number(snapshot?.failed || 0),
		maxPages: Number(snapshot?.maxPages || 0),
		itemLimit: Number(snapshot?.itemLimit || 0),
		truncated: !!snapshot?.truncated,
		pagesFetched: Number(snapshot?.pagesFetched || 0),
		backfillComplete: snapshot?.backfillComplete ?? null,
		sources: Array.isArray(snapshot?.sources) ? snapshot.sources : [],
		snapshotTotal: Array.isArray(snapshot?.items) ? snapshot.items.length : 0,
		items,
	};
}

function normalizeNewsfeedItem(item) {
  const postedAt = normalizeTxDate(item.postedAt)
    || normalizeTxDate(item.receivedAt)
    || normalizeTxDate(item.createdAt)
    || new Date(0);
  const receivedAt = normalizeTxDate(item.receivedAt)
    || normalizeTxDate(item.collectedAt)
    || postedAt;
  return {
    ...item,
    provider: item.provider || 'telegram',
    sourceType: item.sourceType || 'telegram_public',
    sourceTitle: item.sourceTitle || item.sourceHandle || 'Telegram',
    sourceCategory: item.sourceCategory || '뉴스',
    title: item.title || firstNewsfeedLine(item.text) || item.sourceTitle || 'Telegram',
    text: String(item.text || ''),
    url: String(item.url || ''),
    links: Array.isArray(item.links) ? item.links : [],
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
    postedAt,
    receivedAt,
  };
}

function firstNewsfeedLine(value) {
	return String(value || '').split(/\n+/).map(line => line.trim()).find(Boolean) || '';
}

function newsfeedPageSize(opts = {}) {
	return Math.max(1, Math.min(Math.round(Number(opts.pageSize || opts.max) || 60), 200));
}

function newsfeedPageResult(items, pageSize, meta = {}) {
	const last = items[items.length - 1] || null;
	const hasMore = typeof meta.total === 'number'
		? (meta.nextOffset || 0) < meta.total
		: items.length >= pageSize;
	return {
		items,
		nextCursor: hasMore ? newsfeedCursorForItem(last, meta) : null,
		hasMore,
		total: typeof meta.total === 'number' ? meta.total : null,
		snapshot: meta.snapshot || null,
	};
}

function newsfeedCursorForItem(item, meta = {}) {
	if (!item) return null;
	const postedAt = normalizeTxDate(item.postedAt);
	return {
		postedAt: postedAt ? postedAt.toISOString() : null,
		sourceId: item.sourceId || '',
		messageId: item.messageId || '',
		offset: typeof meta.nextOffset === 'number' ? meta.nextOffset : null,
	};
}

function newsfeedCursorDate(cursor) {
	if (!cursor) return null;
	if (cursor instanceof Date || cursor?.toDate) return normalizeTxDate(cursor);
	return normalizeTxDate(cursor.postedAt || cursor);
}

function newsfeedCursorOffset(cursor) {
	const offset = Number(cursor?.offset || 0);
	return Number.isFinite(offset) && offset > 0 ? Math.round(offset) : 0;
}

function compareNewsfeedItems(a, b) {
	const dateDiff = normalizeTxDate(b.postedAt).getTime() - normalizeTxDate(a.postedAt).getTime();
	if (dateDiff) return dateDiff;
	const sourceDiff = String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
	if (sourceDiff) return sourceDiff;
	return Number(b.messageId || 0) - Number(a.messageId || 0);
}

function shouldFallbackToStaticNewsfeed(result, opts = {}) {
	if (hasNewsfeedItems(result)) return false;
	if (newsfeedCursorOffset(opts.cursor) > 0) return true;
	return !newsfeedCursorDate(opts.cursor);
}

function hasNewsfeedItems(result) {
	const items = Array.isArray(result) ? result : result?.items;
	return Array.isArray(items) && items.length > 0;
}

async function listStaticNewsfeedItems(opts = {}) {
	const snapshot = await loadStaticNewsfeedSnapshot(opts);
	const max = newsfeedPageSize(opts);
	let rows = Array.isArray(snapshot.items) ? snapshot.items.map(normalizeNewsfeedItem) : [];
	if (opts.sourceId) rows = rows.filter(item => item.sourceId === opts.sourceId);
	if (opts.category) rows = rows.filter(item => item.sourceCategory === opts.category);
	rows = rows
		.filter(item => !item.hidden)
		.sort(compareNewsfeedItems);
	if (!opts.page) return rows.slice(0, max);

	const start = newsfeedCursorOffset(opts.cursor);
	const items = rows.slice(start, start + max);
	return newsfeedPageResult(items, max, {
		nextOffset: start + items.length,
		total: rows.length,
		snapshot,
	});
}

async function loadStaticNewsfeedSnapshot(opts = {}) {
  const now = Date.now();
  const cacheFresh = _staticNewsfeedSnapshotPromise && now - _staticNewsfeedSnapshotFetchedAt < STATIC_NEWSFEED_CACHE_MS;
  if (!opts.refreshStatic && cacheFresh) return _staticNewsfeedSnapshotPromise;

  const url = opts.refreshStatic ? `${STATIC_NEWSFEED_URL}&t=${now}` : STATIC_NEWSFEED_URL;
  _staticNewsfeedSnapshotFetchedAt = now;
  _staticNewsfeedSnapshotPromise = fetch(url, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`static newsfeed HTTP ${response.status}`);
        return response.json();
      })
      .catch(err => {
        _staticNewsfeedSnapshotPromise = null;
        _staticNewsfeedSnapshotFetchedAt = 0;
        throw err;
      });
  return _staticNewsfeedSnapshotPromise;
}

function normalizeStaticNewsfeedStatus(snapshot) {
	const generatedAt = normalizeTxDate(snapshot.generatedAt);
	return {
    id: 'telegram_public_feed_static',
    sourceType: 'telegram_public_static',
    sourceVersion: snapshot.sourceVersion || '',
    sourceCount: Number(snapshot.sourceCount || 0),
    itemCount: Array.isArray(snapshot.items) ? snapshot.items.length : Number(snapshot.itemCount || 0),
    lastRunAt: generatedAt,
    lastSuccessAt: generatedAt,
    updatedAt: generatedAt,
		staticFallback: true,
		failed: Number(snapshot.failed || 0),
		since: snapshot.since || null,
		truncated: !!snapshot.truncated,
		pagesFetched: Number(snapshot.pagesFetched || 0),
		backfillComplete: snapshot.backfillComplete ?? null,
		sources: Array.isArray(snapshot.sources) ? snapshot.sources : [],
	};
}
