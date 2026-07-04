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
const args = parseArgs(process.argv.slice(2));

writeStaticTelegramFeed({
  outFile: args.out || process.env.TELEGRAM_STATIC_OUT || defaultOut,
  maxMessages: args.maxMessages || process.env.TELEGRAM_STATIC_MAX_PER_SOURCE || process.env.TELEGRAM_PUBLIC_MAX_PER_SOURCE,
  maxItems: args.maxItems || process.env.TELEGRAM_STATIC_MAX_ITEMS,
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
  const maxMessages = clampInt(options.maxMessages, 1, 40, 20);
  const maxItems = clampInt(options.maxItems, 1, 500, 240);
  const concurrency = clampInt(options.concurrency, 1, 8, 4);
  const results = await mapWithConcurrency(sources, concurrency, source => fetchTelegramPublicSource(source, {
    maxMessages,
    now: generatedAt,
  }));

  const sourceRows = results.map(result => sourceRowFromResult(result));
  const items = results
    .filter(result => result.status === 'fulfilled')
    .flatMap(result => result.value.messages.map(message => {
      const item = normalizeTelegramFeedItem(message, result.value.source);
      return stableStaticFeedItem(item, message, previousItems.get(item.id));
    }))
    .sort(compareStaticItems)
    .slice(0, maxItems);
  if (!items.length) throw new Error('No Telegram static feed items were fetched.');

  const payload = {
    sourceType: 'telegram_public_static',
    sourceVersion: TELEGRAM_PUBLIC_SOURCE_VERSION,
    generatedAt: generatedAt.toISOString(),
    sourceCount: sources.length,
    fetched: sourceRows.reduce((sum, row) => sum + row.fetched, 0),
    failed: sourceRows.filter(row => !row.ok).length,
    maxMessages,
    maxItems,
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
    maxMessages: snapshot.maxMessages,
    maxItems: snapshot.maxItems,
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
      error: result.reason?.message || String(result.reason),
    };
  }
  const { source, messages } = result.value;
  const latest = messages.reduce((acc, message) => {
    if (!acc) return message;
    return Number(message.messageId || 0) > Number(acc.messageId || 0) ? message : acc;
  }, null);
  return {
    id: source.id,
    title: source.title,
    handle: source.handle,
    category: source.category,
    ok: true,
    fetched: messages.length,
    latestMessageId: latest?.messageId || null,
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
