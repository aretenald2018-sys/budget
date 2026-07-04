import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  fetchTelegramPublicSource,
  normalizeTelegramFeedItem,
} from '../api/_lib/telegram-public-feed.js';
import {
  TELEGRAM_PUBLIC_SOURCES,
  TELEGRAM_PUBLIC_SOURCE_VERSION,
} from '../utils/telegram-sources.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(root, 'public', 'newsfeed', 'telegram-public-feed.json');
const UNKNOWN_POSTED_AT = '2000-01-01T00:00:00.000Z';
const DEFAULT_SINCE = '2026-06-01';
const DEFAULT_ITEM_LIMIT = 20000;
const args = parseArgs(process.argv.slice(2));

writeStaticTelegramFeed({
	outFile: args.out || process.env.TELEGRAM_STATIC_OUT || defaultOut,
	maxMessages: args.maxMessages || process.env.TELEGRAM_STATIC_MAX_PER_SOURCE || process.env.TELEGRAM_PUBLIC_MAX_PER_SOURCE,
	maxMessagesPerPage: args.maxMessagesPerPage || process.env.TELEGRAM_PUBLIC_MAX_PER_PAGE,
	maxPages: args.maxPages || process.env.TELEGRAM_STATIC_MAX_PAGES || process.env.TELEGRAM_PUBLIC_MAX_PAGES,
	since: args.since || process.env.TELEGRAM_STATIC_SINCE || process.env.TELEGRAM_PUBLIC_SINCE || DEFAULT_SINCE,
	itemLimit: args.itemLimit || args.maxItems || process.env.TELEGRAM_STATIC_ITEM_LIMIT || process.env.TELEGRAM_STATIC_MAX_ITEMS,
	limitSources: args.limitSources || process.env.TELEGRAM_PUBLIC_LIMIT_SOURCES,
	onlySources: args.onlySources || process.env.TELEGRAM_PUBLIC_ONLY_SOURCES,
	concurrency: args.concurrency || process.env.TELEGRAM_PUBLIC_CONCURRENCY,
}).catch(err => {
  console.error('[telegram-feed-static]', err);
  process.exit(1);
});

async function writeStaticTelegramFeed(options = {}) {
  const generatedAt = new Date();
	const previousSnapshot = await readExistingSnapshot(options.outFile);
	const previousItems = new Map((previousSnapshot?.items || []).map(item => [item.id, item]));
	const sources = selectSources(TELEGRAM_PUBLIC_SOURCES, options);
	const selectedSourceIds = new Set(sources.map(source => source.id));
	const maxMessages = clampInt(options.maxMessages, 1, 40, 20);
	const maxMessagesPerPage = clampInt(options.maxMessagesPerPage || options.maxMessages, 1, 80, 40);
	const maxPages = clampInt(options.maxPages, 1, 240, 1);
	const since = normalizeSinceDate(options.since);
	const itemLimit = clampInt(options.itemLimit, 1, 100000, DEFAULT_ITEM_LIMIT);
	const concurrency = clampInt(options.concurrency, 1, 8, 4);
	const results = await mapWithConcurrency(sources, concurrency, source => fetchTelegramPublicSource(source, {
		maxMessages,
		maxMessagesPerPage,
		maxPages,
		since,
		backfill: maxPages > 1,
		now: generatedAt,
	}));

	const sourceRows = results.map(result => sourceRowFromResult(result));
	const mergedItems = new Map();
	for (const previousItem of previousItems.values()) {
		if (selectedSourceIds.has(previousItem.sourceId) && isSinceItem(previousItem, since)) {
			mergedItems.set(previousItem.id, previousItem);
		}
	}
	for (const result of results) {
		if (result.status !== 'fulfilled') continue;
		for (const message of result.value.messages) {
			const item = normalizeTelegramFeedItem(message, result.value.source);
			if (!isSinceItem(item, since)) continue;
			mergedItems.set(item.id, stableStaticFeedItem(item, message, previousItems.get(item.id)));
		}
	}
	const allItems = [...mergedItems.values()].sort(compareStaticItems);
	const truncated = allItems.length > itemLimit;
	const items = truncated ? allItems.slice(0, itemLimit) : allItems;
	if (!items.length) throw new Error('No Telegram static feed items were fetched.');

	const payload = {
		sourceType: 'telegram_public_static',
		sourceVersion: TELEGRAM_PUBLIC_SOURCE_VERSION,
		generatedAt: generatedAt.toISOString(),
		since: since ? since.toISOString() : null,
		sourceCount: sources.length,
		fetched: sourceRows.reduce((sum, row) => sum + row.fetched, 0),
		failed: sourceRows.filter(row => !row.ok).length,
		maxMessages,
		maxMessagesPerPage,
		maxPages,
		itemLimit,
		truncated,
		pagesFetched: sourceRows.reduce((sum, row) => sum + row.pagesFetched, 0),
		backfillComplete: sourceRows.every(row => !row.ok || row.backfillComplete !== false),
		sources: sourceRows,
		items,
	};

  if (isSameSnapshotContent(previousSnapshot, payload)) {
    console.log(JSON.stringify({
      ok: true,
      unchanged: true,
      outFile: options.outFile,
			sourceVersion: payload.sourceVersion,
			sources: payload.sourceCount,
			fetched: payload.fetched,
			items: payload.items.length,
			truncated: payload.truncated,
			pagesFetched: payload.pagesFetched,
			failed: payload.failed,
		}, null, 2));
		return;
  }

  await fs.mkdir(path.dirname(options.outFile), { recursive: true });
  await fs.writeFile(options.outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: payload.failed === 0,
    outFile: options.outFile,
    sourceVersion: payload.sourceVersion,
		sources: payload.sourceCount,
		fetched: payload.fetched,
		items: payload.items.length,
		truncated: payload.truncated,
		pagesFetched: payload.pagesFetched,
		failed: payload.failed,
	}, null, 2));
}

async function readExistingSnapshot(outFile) {
  try {
    return JSON.parse(await fs.readFile(outFile, 'utf8'));
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

function stableStaticFeedItem(item, message, previousItem) {
  const postedAt = message.postedAtSource === 'telegram'
    ? item.postedAt
    : UNKNOWN_POSTED_AT;
  const receivedAt = message.postedAtSource === 'telegram' ? previousItem?.receivedAt || postedAt : postedAt;
  const collectedAt = message.postedAtSource === 'telegram' ? previousItem?.collectedAt || postedAt : postedAt;
  return {
    ...item,
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map(attachment => ({ type: attachment?.type || 'file' }))
      : [],
    postedAt,
    receivedAt,
    collectedAt,
  };
}

function compareStaticItems(a, b) {
  const dateDiff = normalizeDate(b.postedAt).getTime() - normalizeDate(a.postedAt).getTime();
  if (dateDiff) return dateDiff;
  const sourceDiff = String(a.sourceId || '').localeCompare(String(b.sourceId || ''));
  if (sourceDiff) return sourceDiff;
  return Number(b.messageId || 0) - Number(a.messageId || 0);
}

function isSameSnapshotContent(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot) return false;
  const comparablePrevious = comparableSnapshot(previousSnapshot);
  const comparableNext = comparableSnapshot(nextSnapshot);
  return JSON.stringify(comparablePrevious) === JSON.stringify(comparableNext);
}

function comparableSnapshot(snapshot) {
  return {
    sourceType: snapshot.sourceType,
		sourceVersion: snapshot.sourceVersion,
		sourceCount: snapshot.sourceCount,
		fetched: snapshot.fetched,
		failed: snapshot.failed,
		since: snapshot.since,
		maxMessages: snapshot.maxMessages,
		maxMessagesPerPage: snapshot.maxMessagesPerPage,
		maxPages: snapshot.maxPages,
		itemLimit: snapshot.itemLimit,
		truncated: snapshot.truncated,
		pagesFetched: snapshot.pagesFetched,
		backfillComplete: snapshot.backfillComplete,
		sources: snapshot.sources,
		items: snapshot.items,
	};
}

function sourceRowFromResult(result) {
  if (result.status === 'rejected') {
    const source = result.reason?.source || { id: 'unknown', title: 'unknown', handle: '' };
    return {
      id: source.id,
      title: source.title,
      handle: source.handle,
      category: source.category || '',
			ok: false,
			fetched: 0,
			latestMessageId: null,
			oldestMessageId: null,
			latestPostedAt: null,
			oldestPostedAt: null,
			pagesFetched: 0,
			backfillComplete: null,
			error: result.reason?.message || String(result.reason),
		};
	}
	const { source, messages } = result.value;
	const latest = messages.reduce((acc, message) => {
		if (!acc) return message;
		return Number(message.messageId || 0) > Number(acc.messageId || 0) ? message : acc;
	}, null);
	const oldest = messages.reduce((acc, message) => {
		if (!acc) return message;
		return Number(message.messageId || 0) < Number(acc.messageId || 0) ? message : acc;
	}, null);
	return {
		id: source.id,
		title: source.title,
    handle: source.handle,
    category: source.category,
		ok: true,
		fetched: messages.length,
		latestMessageId: latest?.messageId || null,
		oldestMessageId: oldest?.messageId || null,
		latestPostedAt: latest?.postedAt ? normalizeDate(latest.postedAt).toISOString() : null,
		oldestPostedAt: oldest?.postedAt ? normalizeDate(oldest.postedAt).toISOString() : null,
		pagesFetched: result.value.pagesFetched || 0,
		backfillComplete: result.value.backfillComplete ?? null,
		error: null,
	};
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
  const only = normalizeCsv(options.onlySources);
  if (only.length) {
    const allowed = new Set(only);
    selected = selected.filter(source => allowed.has(source.id) || allowed.has(source.handle));
  }
  const limitSources = clampInt(options.limitSources, 0, 500, 0);
  return limitSources > 0 ? selected.slice(0, limitSources) : selected;
}

function parseArgs(argv) {
  const result = {
    out: '',
    limitSources: '',
		onlySources: '',
		maxMessages: '',
		maxItems: '',
		itemLimit: '',
		maxMessagesPerPage: '',
		maxPages: '',
		since: '',
		concurrency: '',
	};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (key in result) result[key] = match[2];
  }
  return result;
}

function normalizeCsv(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeDate(value) {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? new Date(0) : value;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? new Date(0) : date;
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

function isSinceItem(item, since) {
	if (!since) return true;
	return normalizeDate(item.postedAt).getTime() >= since.getTime();
}
