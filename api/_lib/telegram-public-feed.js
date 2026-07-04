import { getAdminDb, FieldValue, Timestamp, userScope } from './firebase-admin.js';
import {
  TELEGRAM_PUBLIC_SOURCES,
  TELEGRAM_PUBLIC_SOURCE_VERSION,
  telegramPublicPermalink,
  telegramPublicSourceUrl,
} from '../../utils/telegram-sources.js';

const DEFAULT_FETCH_TIMEOUT_MS = 12000;
const DEFAULT_MAX_MESSAGES_PER_SOURCE = 20;
const DEFAULT_MAX_MESSAGES_PER_PAGE = 40;
const DEFAULT_MAX_PAGES = 1;
const DEFAULT_CONCURRENCY = 4;
const TELEGRAM_PREVIEW_HEADERS = Object.freeze({
  'User-Agent': 'Mozilla/5.0 (compatible; BudgetNewsfeedBot/1.0; +https://aretenald2018-sys.github.io/budget/)',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6',
});

export async function syncTelegramPublicFeed(options = {}) {
	const sources = selectSources(options.sources || TELEGRAM_PUBLIC_SOURCES, options);
	const maxMessages = clampInt(options.maxMessages, 1, 40, DEFAULT_MAX_MESSAGES_PER_SOURCE);
	const maxMessagesPerPage = clampInt(options.maxMessagesPerPage || options.maxMessages, 1, 80, DEFAULT_MAX_MESSAGES_PER_PAGE);
	const maxPages = clampInt(options.maxPages, 1, 240, DEFAULT_MAX_PAGES);
	const since = normalizeSinceDate(options.since || process.env.TELEGRAM_PUBLIC_SINCE);
	const backfill = !!options.backfill || maxPages > 1;
	const dryRun = !!options.dryRun;
	const now = options.now instanceof Date ? options.now : new Date();
	const fetchImpl = options.fetchImpl || fetch;
  const logger = options.logger || console;
  const state = dryRun ? {} : await loadTelegramPublicFeedState();

	const fetched = await mapWithConcurrency(
		sources,
		clampInt(options.concurrency, 1, 8, DEFAULT_CONCURRENCY),
		source => fetchTelegramPublicSource(source, { fetchImpl, maxMessages, maxMessagesPerPage, maxPages, since, backfill, now }),
	);
  const sourceResults = fetched.map(result => normalizeSettledSourceResult(result, state));

  if (!dryRun) {
    await persistTelegramPublicFeedRun(sourceResults, { now });
  }

  const summary = summarizeSync(sourceResults, { dryRun, selectedSources: sources.length });
  logger.log(JSON.stringify(summary, null, 2));
  return { ...summary, sourceResults };
}

export async function fetchTelegramPublicSource(source, options = {}) {
	const fetchImpl = options.fetchImpl || fetch;
	const maxMessages = clampInt(options.maxMessages, 1, 40, DEFAULT_MAX_MESSAGES_PER_SOURCE);
	const maxMessagesPerPage = clampInt(options.maxMessagesPerPage || options.maxMessages, 1, 80, DEFAULT_MAX_MESSAGES_PER_PAGE);
	const maxPages = clampInt(options.maxPages, 1, 240, DEFAULT_MAX_PAGES);
	const since = normalizeSinceDate(options.since);
	const backfill = !!options.backfill || maxPages > 1 || !!since;
	const fetchedAt = options.now instanceof Date ? options.now : new Date();
	const url = telegramPublicSourceUrl(source);
	const timeoutMs = clampInt(options.timeoutMs, 1000, 60000, DEFAULT_FETCH_TIMEOUT_MS);
	const pages = [];
	const collected = [];
	let title = '';
	let beforeMessageId = String(options.beforeMessageId || '').trim();
	let reachedSince = false;

	for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
		const pageUrl = telegramPublicSourcePageUrl(source, beforeMessageId);
		const response = await fetchWithTimeout(pageUrl, { fetchImpl, timeoutMs });
		const html = await response.text();
		if (!response.ok) {
			throw new Error(`${source.id} preview fetch failed: HTTP ${response.status}`);
		}
		if (isTelegramContactPage(html)) {
			throw new Error(`${source.id} has no public Telegram preview`);
		}
		if (!title) title = extractPreviewTitle(html);

		const pageMessages = parseTelegramPublicPreviewHtml(html, { source, fetchedAt })
			.slice(-(backfill ? maxMessagesPerPage : maxMessages));
		if (!pageMessages.length) break;

		collected.push(...pageMessages);
		const oldest = pageMessages[0];
		const latest = pageMessages[pageMessages.length - 1];
		const oldestPostedAt = normalizeDate(oldest.postedAt);
		const latestPostedAt = normalizeDate(latest.postedAt);
		pages.push({
			beforeMessageId: beforeMessageId || null,
			fetched: pageMessages.length,
			oldestMessageId: oldest.messageId,
			latestMessageId: latest.messageId,
			oldestPostedAt,
			latestPostedAt,
		});

		reachedSince = !!(since && pageMessages.some(message => {
			const postedAt = normalizeDate(message.postedAt);
			return postedAt && postedAt < since;
		}));
		if (!backfill || reachedSince) break;
		if (!oldest?.messageId || String(oldest.messageId) === beforeMessageId) break;
		beforeMessageId = String(oldest.messageId);
	}

	let messages = dedupeBy(collected, message => message.messageId)
		.sort((a, b) => Number(a.messageId) - Number(b.messageId));
	if (since) {
		messages = messages.filter(message => {
			const postedAt = normalizeDate(message.postedAt);
			return postedAt && postedAt >= since;
		});
	}
	if (!backfill && !since) messages = messages.slice(-maxMessages);

	return {
		source,
		url,
		fetchedAt,
		title,
		messages,
		pages,
		pagesFetched: pages.length,
		backfill,
		backfillComplete: since ? reachedSince : null,
		since,
	};
}

export function parseTelegramPublicPreviewHtml(html, context = {}) {
  const source = context.source || {};
  const fetchedAt = context.fetchedAt instanceof Date ? context.fetchedAt : new Date();
  return telegramMessageBlocks(String(html || ''))
    .map(block => parseTelegramMessageBlock(block, source, fetchedAt))
    .filter(Boolean)
    .sort((a, b) => Number(a.messageId) - Number(b.messageId));
}

export function normalizeTelegramFeedItem(message, source) {
  const postedAt = normalizeDate(message.postedAt) || new Date();
  const receivedAt = normalizeDate(message.receivedAt) || new Date();
  const text = cleanText(message.text || '');
  const title = firstContentLine(text) || source.title || source.handle || 'Telegram';
  const messageId = String(message.messageId || '').trim();
  return {
    id: `telegram_public_${source.id}_${messageId}`,
    provider: 'telegram',
    sourceType: 'telegram_public',
    sourceId: source.id,
    sourceHandle: source.handle,
    sourceTitle: source.title,
    sourceCategory: source.category,
    sourceKind: source.kind || 'telegram_public',
    messageId,
    postedAt,
    receivedAt,
    collectedAt: receivedAt,
    text,
    title: clip(title, 140),
    url: telegramPublicPermalink(source, messageId),
    attachments: message.attachments || [],
    links: message.links || [],
    hidden: false,
    sourceVersion: TELEGRAM_PUBLIC_SOURCE_VERSION,
  };
}

async function loadTelegramPublicFeedState() {
  const docRef = getAdminDb()
    .collection('users')
    .doc(userScope())
    .collection('integrations')
    .doc('telegram_public_feed');
  const snap = await docRef.get();
  return snap.exists ? (snap.data() || {}) : {};
}

async function persistTelegramPublicFeedRun(sourceResults, { now }) {
  const db = getAdminDb();
  const uid = userScope();
  const batch = db.batch();
  let opCount = 0;
  const collectionRef = db.collection('users').doc(uid).collection('newsfeed_items');

  for (const result of sourceResults) {
    if (!result.ok) continue;
    for (const item of result.itemsToSave) {
      batch.set(collectionRef.doc(item.id), serializeFeedItemForFirestore(item), { merge: true });
      opCount += 1;
      if (opCount >= 430) {
        await batch.commit();
        return persistRemainingAfterBatchLimit(sourceResults, { now, alreadySaved: opCount });
      }
    }
  }

  batch.set(integrationDocRef(db, uid), buildIntegrationStatus(sourceResults, now), { merge: true });
  await batch.commit();
}

async function persistRemainingAfterBatchLimit(sourceResults, { now, alreadySaved }) {
  const db = getAdminDb();
  const uid = userScope();
  const collectionRef = db.collection('users').doc(uid).collection('newsfeed_items');
  let skipped = 0;
  let batch = db.batch();
  let opCount = 0;

  for (const result of sourceResults) {
    if (!result.ok) continue;
    for (const item of result.itemsToSave) {
      if (skipped < alreadySaved) {
        skipped += 1;
        continue;
      }
      batch.set(collectionRef.doc(item.id), serializeFeedItemForFirestore(item), { merge: true });
      opCount += 1;
      if (opCount >= 430) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }
  }

  batch.set(integrationDocRef(db, uid), buildIntegrationStatus(sourceResults, now), { merge: true });
  await batch.commit();
}

function integrationDocRef(db, uid) {
  return db.collection('users').doc(uid).collection('integrations').doc('telegram_public_feed');
}

function buildIntegrationStatus(sourceResults, now) {
	const sources = {};
	for (const result of sourceResults) {
		sources[result.source.id] = {
      id: result.source.id,
      title: result.source.title,
      handle: result.source.handle,
      category: result.source.category,
      ok: result.ok,
			latestMessageId: result.latestMessageId || result.previousLatestMessageId || null,
			latestPostedAt: result.latestPostedAt ? Timestamp.fromDate(result.latestPostedAt) : null,
			oldestMessageId: result.oldestMessageId || null,
			oldestPostedAt: result.oldestPostedAt ? Timestamp.fromDate(result.oldestPostedAt) : null,
			fetchedCount: result.fetchedCount || 0,
			savedCount: result.itemsToSave?.length || 0,
			pagesFetched: result.pagesFetched || 0,
			backfillComplete: result.backfillComplete ?? null,
			error: result.error || null,
			checkedAt: Timestamp.fromDate(now),
		};
  }
  return {
    sourceType: 'telegram_public',
    sourceVersion: TELEGRAM_PUBLIC_SOURCE_VERSION,
    sourceCount: sourceResults.length,
    lastRunAt: Timestamp.fromDate(now),
    lastSuccessAt: sourceResults.some(result => result.ok) ? Timestamp.fromDate(now) : null,
    updatedAt: FieldValue.serverTimestamp(),
    sources,
  };
}

function normalizeSettledSourceResult(result, state) {
  if (result.status === 'rejected') {
    const source = result.reason?.source || { id: 'unknown', title: 'unknown', handle: '' };
    return {
      ok: false,
      source,
      fetchedCount: 0,
      itemsToSave: [],
      error: result.reason?.message || String(result.reason),
    };
  }

  const value = result.value;
  const source = value.source;
	const previousLatestMessageId = String(state?.sources?.[source.id]?.latestMessageId || '');
	const previousLatestNumber = Number(previousLatestMessageId) || 0;
	const items = value.messages.map(message => normalizeTelegramFeedItem(message, source));
	const itemsToSave = value.backfill ? items : previousLatestNumber
		? items.filter(item => (Number(item.messageId) || 0) > previousLatestNumber)
		: items;
	const latestItem = items.reduce((acc, item) => {
		if (!acc) return item;
		return (Number(item.messageId) || 0) > (Number(acc.messageId) || 0) ? item : acc;
	}, null);
	const oldestItem = items.reduce((acc, item) => {
		if (!acc) return item;
		return (Number(item.messageId) || 0) < (Number(acc.messageId) || 0) ? item : acc;
	}, null);

	return {
		ok: true,
    source,
    title: value.title,
    fetchedAt: value.fetchedAt,
		fetchedCount: items.length,
		itemsToSave,
		latestMessageId: latestItem?.messageId || previousLatestMessageId || null,
		latestPostedAt: latestItem?.postedAt || null,
		oldestMessageId: oldestItem?.messageId || null,
		oldestPostedAt: oldestItem?.postedAt || null,
		pagesFetched: value.pagesFetched || 0,
		backfillComplete: value.backfillComplete ?? null,
		previousLatestMessageId,
		error: null,
	};
}

function summarizeSync(sourceResults, { dryRun, selectedSources }) {
  const saved = sourceResults.reduce((sum, result) => sum + (result.itemsToSave?.length || 0), 0);
  const fetched = sourceResults.reduce((sum, result) => sum + (result.fetchedCount || 0), 0);
  const failed = sourceResults.filter(result => !result.ok).length;
  return {
    ok: failed === 0,
    dryRun,
    sourceVersion: TELEGRAM_PUBLIC_SOURCE_VERSION,
    selectedSources,
    fetched,
    saved,
    failed,
    sources: sourceResults.map(result => ({
      id: result.source.id,
      title: result.source.title,
      handle: result.source.handle,
      ok: result.ok,
      fetched: result.fetchedCount || 0,
      saved: result.itemsToSave?.length || 0,
      pagesFetched: result.pagesFetched || 0,
      latestMessageId: result.latestMessageId || null,
      oldestMessageId: result.oldestMessageId || null,
      backfillComplete: result.backfillComplete ?? null,
      error: result.error || null,
    })),
  };
}

function serializeFeedItemForFirestore(item) {
  return {
    ...item,
    postedAt: Timestamp.fromDate(item.postedAt),
    receivedAt: Timestamp.fromDate(item.receivedAt),
    collectedAt: Timestamp.fromDate(item.collectedAt),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function fetchWithTimeout(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      headers: TELEGRAM_PREVIEW_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await mapper(items[index], index) };
      } catch (err) {
        err.source = items[index];
        results[index] = { status: 'rejected', reason: err };
      }
    }
  }));
  return results;
}

function selectSources(sources, options) {
  let selected = [...sources];
  const only = normalizeCsv(options.onlySources || process.env.TELEGRAM_PUBLIC_ONLY_SOURCES);
  if (only.length) {
    const allowed = new Set(only);
    selected = selected.filter(source => allowed.has(source.id) || allowed.has(source.handle));
  }
  const limitSources = clampInt(options.limitSources || process.env.TELEGRAM_PUBLIC_LIMIT_SOURCES, 0, 500, 0);
  return limitSources > 0 ? selected.slice(0, limitSources) : selected;
}

function telegramPublicSourcePageUrl(source, beforeMessageId) {
	const url = new URL(telegramPublicSourceUrl(source));
	if (beforeMessageId) url.searchParams.set('before', beforeMessageId);
	return url.href;
}

function telegramMessageBlocks(html) {
  const marker = /<div class="[^"]*\btgme_widget_message\b[^"]*\bjs-widget_message\b[^"]*"/g;
  const starts = [...String(html || '').matchAll(marker)].map(match => match.index).filter(index => Number.isInteger(index));
  const blocks = [];
  for (let i = 0; i < starts.length; i += 1) {
    blocks.push(html.slice(starts[i], starts[i + 1] || html.length));
  }
  return blocks;
}

function parseTelegramMessageBlock(block, source, fetchedAt) {
  const dataPost = attrValue(block, 'data-post');
  if (!dataPost) return null;
  const messageId = dataPost.split('/').pop();
  if (!/^\d+$/.test(messageId)) return null;
  const textHtml = firstClassBlock(block, 'tgme_widget_message_text') || '';
  const text = cleanText(htmlToText(textHtml));
  const postedAt = normalizeDate(attrValue(block, 'datetime'));
  return {
    messageId,
    sourceId: source.id,
    postedAt: postedAt || fetchedAt,
    postedAtSource: postedAt ? 'telegram' : 'fetched',
    receivedAt: fetchedAt,
    text,
    links: extractLinks(textHtml, source),
    attachments: extractAttachments(block),
  };
}

function firstClassBlock(html, className) {
  const classIndex = html.indexOf(className);
  if (classIndex < 0) return '';
  const openStart = html.lastIndexOf('<', classIndex);
  const openEnd = html.indexOf('>', classIndex);
  if (openStart < 0 || openEnd < 0) return '';
  let depth = 1;
  let cursor = openEnd + 1;
  while (depth > 0 && cursor < html.length) {
    const nextOpen = html.indexOf('<div', cursor);
    const nextClose = html.indexOf('</div>', cursor);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + 4;
    } else {
      depth -= 1;
      if (depth === 0) return html.slice(openEnd + 1, nextClose);
      cursor = nextClose + 6;
    }
  }
  return '';
}

function attrValue(html, name) {
  const re = new RegExp(`\\b${escapeRegExp(name)}=["']([^"']*)["']`, 'i');
  const match = String(html || '').match(re);
  return match ? decodeHtmlEntities(match[1]) : '';
}

function extractLinks(html, source) {
  const links = [];
  const re = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(re)) {
    const href = decodeHtmlEntities(match[1]);
    if (!href || href.startsWith('#')) continue;
    const url = absolutizeTelegramUrl(href, source);
    if (!url) continue;
    links.push({
      url,
      label: clip(cleanText(htmlToText(match[2])), 140),
    });
  }
  return dedupeBy(links, link => link.url);
}

function extractAttachments(block) {
  const attachments = [];
  const imageMatch = block.match(/background-image:url\(['"]?([^'")]+)['"]?\)/i);
  if (imageMatch) {
    attachments.push({ type: 'image', url: decodeHtmlEntities(imageMatch[1]) });
  }
  if (/\btgme_widget_message_video\b/.test(block)) attachments.push({ type: 'video' });
  if (/\btgme_widget_message_document\b/.test(block)) attachments.push({ type: 'document' });
  return attachments;
}

function parseTelegramDataViewDate(block) {
  const dataView = attrValue(block, 'data-view');
  if (!dataView) return null;
  try {
    const normalized = dataView.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    const seconds = Number(json?.t);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return new Date(seconds * 1000);
  } catch {
    return null;
  }
}

function htmlToText(html) {
  return decodeHtmlEntities(String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
}

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function firstContentLine(value) {
  return String(value || '').split(/\n+/).map(line => line.trim()).find(Boolean) || '';
}

function decodeHtmlEntities(value) {
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    const lower = entity.toLowerCase();
    if (lower === 'amp') return '&';
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    if (lower === 'nbsp') return ' ';
    if (lower.startsWith('#x')) return decodeCodePoint(parseInt(lower.slice(2), 16), entity);
    if (lower.startsWith('#')) return decodeCodePoint(parseInt(lower.slice(1), 10), entity);
    return `&${entity};`;
  });
}

function decodeCodePoint(value, originalEntity) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return `&${originalEntity};`;
  try {
    return String.fromCodePoint(value);
  } catch {
    return `&${originalEntity};`;
  }
}

function extractPreviewTitle(html) {
  const match = String(html || '').match(/<meta property="og:title" content="([^"]*)"/i)
    || String(html || '').match(/<title>([^<]*)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]).trim() : '';
}

function isTelegramContactPage(html) {
  return /^Telegram: Contact\b/.test(extractPreviewTitle(html));
}

function absolutizeTelegramUrl(href, source) {
  const value = String(href || '').trim();
  if (!value) return '';
  try {
    const url = /^https?:\/\//i.test(value)
      ? new URL(value)
      : new URL(value, value.startsWith('/') ? 'https://t.me' : telegramPublicSourceUrl(source));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSinceDate(value) {
	if (!value) return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	const text = String(value || '').trim();
	if (!text) return null;
	const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
		? new Date(`${text}T00:00:00+09:00`)
		: new Date(text);
	return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCsv(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clip(value, max) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
