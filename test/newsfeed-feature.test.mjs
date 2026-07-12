import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDigestPayload } from '../features/newsfeed/digest.js';
import {
  createNewsfeedState,
  newsfeedState,
  cursorForNewsfeedItem,
  mergeNewsfeedItems,
  normalizeNewsfeedPage,
  resetNewsfeedPageState,
} from '../features/newsfeed/state.js';
import { feedCardHtml, newsfeedViewHtml } from '../features/newsfeed/view.js';

const items = [
  { id: 'new', sourceId: 'a', messageId: 2, postedAt: '2026-07-12T02:00:00Z', sourceTitle: '채널', sourceCategory: 'Macro', title: '<새 글>', text: '본문', url: 'https://example.com/new' },
  { id: 'old', sourceId: 'a', messageId: 1, postedAt: '2026-07-11T02:00:00Z', sourceTitle: '채널', sourceCategory: 'Macro', title: '이전 글', text: '이전 본문', url: 'https://example.com/old' },
];

test('newsfeed state normalizes pages, merges duplicates, and resets pagination', () => {
  assert.equal(newsfeedState.category, 'all');
  assert.equal(normalizeNewsfeedPage(items).total, 2);
  const merged = mergeNewsfeedItems([items[1]], items);
  assert.deepEqual(merged.map(item => item.id), ['new', 'old']);
  assert.equal(cursorForNewsfeedItem(items[0], 1).sourceId, 'a');
  const state = createNewsfeedState();
  state.items = items;
  state.hasMore = true;
  resetNewsfeedPageState(state);
  assert.deepEqual(state.items, []);
  assert.equal(state.hasMore, false);
});

test('newsfeed digest preserves daily KST range and ingestion limitations', () => {
  const digest = buildDigestPayload({
    items,
    generatedAt: '2026-07-12T03:00:00Z',
    sourceCount: 1,
    snapshotTotal: 2,
  }, 'daily');
  assert.equal(digest.itemCount, 1);
  assert.equal(digest.rangeLabel, '2026-07-12');
  assert.match(digest.text, /document_body_ingested=false/);
  assert.match(digest.text, /<새 글>/);
  assert.doesNotMatch(digest.text, /이전 본문/);
});

test('newsfeed view keeps delegated controls and escapes card titles', () => {
  const state = createNewsfeedState();
  state.items = items;
  state.total = 3;
  state.hasMore = true;
  state.digestMenuOpen = true;
  const html = newsfeedViewHtml(state);
  assert.match(html, /data-newsfeed-action="digest-menu"/);
  assert.match(html, /data-newsfeed-action="load-more"/);
  assert.match(html, /data-newsfeed-digest="daily"/);
  assert.match(feedCardHtml(items[0]), /&lt;새 글&gt;/);
});
