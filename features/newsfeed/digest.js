import { TELEGRAM_PUBLIC_SOURCES } from '../../utils/telegram-sources.js?v=20260704-telegram-public-sources';
import { compareFeedItems, normalizeNewsfeedDate } from './state.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildDigestPayload(snapshot, mode) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const range = digestDateRange(items, mode);
  if (!range) throw new Error('복사할 뉴스가 없습니다.');
  const matchingItems = items.filter(item => {
    const postedAt = normalizeNewsfeedDate(item.postedAt);
    if (!postedAt) return false;
    const key = kstDateKey(postedAt);
    return key >= range.startKey && key <= range.endKey;
  }).sort(compareFeedItems);
  if (!matchingItems.length) throw new Error('해당 기간의 뉴스가 없습니다.');

  const attachmentCounts = countAttachments(matchingItems);
  const failedSources = Array.isArray(snapshot?.sources) ? snapshot.sources.filter(source => source && source.ok === false) : [];
  const failedSourceCount = Number(snapshot?.failed || failedSources.length || 0);
  const metadata = {
    title: '뉴스피드 다이제스트',
    range_type: mode === 'weekly' ? 'weekly' : 'daily',
    range_start_kst: `${range.startKey}T00:00:00+09:00`,
    range_end_kst: `${range.endKey}T23:59:59+09:00`,
    generated_at: normalizeIso(snapshot?.generatedAt),
    since: snapshot?.since || null,
    source_count: Number(snapshot?.sourceCount || TELEGRAM_PUBLIC_SOURCES.length || 0),
    item_count: matchingItems.length,
    snapshot_total: Number(snapshot?.snapshotTotal || items.length || 0),
    truncated: !!snapshot?.truncated,
    backfill_complete: snapshot?.backfillComplete ?? null,
    failed_source_count: failedSourceCount,
    attachment_counts: attachmentCounts,
    limitations: {
      document_body_ingested: false,
      video_body_ingested: false,
      file_bytes_ingested: false,
    },
  };
  const rows = matchingItems.map((item, index) => digestItemText(item, index + 1)).join('\n\n');
  const text = [
    '# 뉴스피드 다이제스트',
    '',
    'limitations: document_body_ingested=false; video_body_ingested=false; file_bytes_ingested=false',
    '',
    '```json',
    JSON.stringify(metadata, null, 2),
    '```',
    '',
    '## 메시지 전수',
    '',
    rows,
    '',
  ].join('\n');
  return {
    text,
    itemCount: matchingItems.length,
    rangeLabel: mode === 'weekly' ? `${range.startKey}~${range.endKey}` : range.endKey,
    payloadBytes: textByteLength(text),
  };
}

export function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString('ko-KR')}KB`;
  return `${bytes.toLocaleString('ko-KR')}B`;
}

function digestDateRange(items, mode) {
  const latest = items
    .map(item => normalizeNewsfeedDate(item.postedAt))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  if (!latest) return null;
  const endKey = kstDateKey(latest);
  const startKey = mode === 'weekly' ? shiftKstDateKey(endKey, -6) : endKey;
  return { startKey, endKey };
}

function digestItemText(item, index) {
  const postedAt = normalizeNewsfeedDate(item.postedAt);
  const links = Array.isArray(item.links) ? item.links.filter(link => link?.url) : [];
  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  return [
    `### ${index}. ${item.sourceTitle || 'Telegram'} - ${item.title || firstLine(item.text) || '제목 없음'}`,
    `- posted_at_kst: ${postedAt ? formatKstDateTime(postedAt) : 'unknown'}`,
    `- source: ${item.sourceTitle || 'Telegram'} (${item.sourceCategory || '뉴스'})`,
    `- message_id: ${item.messageId || 'unknown'}`,
    `- url: ${item.url || 'unknown'}`,
    links.length ? `- links:\n${links.map(link => `  - ${link.label || link.url}: ${link.url}`).join('\n')}` : '- links: none',
    attachments.length ? `- attachments:\n${attachments.map(formatDigestAttachment).join('\n')}` : '- attachments: none',
    '- text:',
    '----- BEGIN TEXT -----',
    String(item.text || '').trim() || '(본문 없음)',
    '----- END TEXT -----',
  ].join('\n');
}

function formatDigestAttachment(attachment) {
  const type = attachment?.type || 'file';
  const parts = [`type=${type}`];
  if (attachment?.title) parts.push(`title=${attachment.title}`);
  if (attachment?.size) parts.push(`size=${attachment.size}`);
  if (attachment?.url) parts.push(`url=${attachment.url}`);
  if (type === 'document' || type === 'video') parts.push('body=not_ingested');
  return `  - ${parts.join('; ')}`;
}

function countAttachments(items) {
  return items.reduce((acc, item) => {
    for (const attachment of Array.isArray(item.attachments) ? item.attachments : []) {
      const type = attachment?.type || 'file';
      acc[type] = (acc[type] || 0) + 1;
    }
    return acc;
  }, {});
}

function kstDateKey(date) {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftKstDateKey(key, days) {
  const start = new Date(`${key}T00:00:00+09:00`);
  return kstDateKey(new Date(start.getTime() + days * DAY_MS));
}

function formatKstDateTime(date) {
  return `${new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}

function normalizeIso(value) {
  const date = normalizeNewsfeedDate(value);
  return date ? date.toISOString() : null;
}

function textByteLength(text) {
  if (typeof Blob !== 'undefined') return new Blob([text]).size;
  return new TextEncoder().encode(text).length;
}

function firstLine(value) {
  return String(value || '').trim().split(/\r?\n/).find(Boolean) || '';
}
