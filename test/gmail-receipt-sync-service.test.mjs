import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGmailQuery,
  createGmailReceiptSyncService,
  parseSinceText,
} from '../api/_services/gmail-receipt-sync.js';

test('gmail receipt service runs with fake adapters and preserves replay idempotency', async () => {
  const savedPollTimes = [];
  const processed = new Set();
  const gmail = {
    async getAccessToken() { return 'fake-token'; },
    async listMessageIds(token, query, max) {
      assert.equal(token, 'fake-token');
      assert.match(query, /after:2026\/07\/11/);
      assert.equal(max, 2);
      return ['message-1'];
    },
    async getMessage(token, id) { return { id, body: 'receipt', date: '2026-07-12T01:00:00Z' }; },
    extractMessageDate(message) { return new Date(message.date); },
    extractMessageText(message) { return message.body; },
  };
  const pollState = {
    async getLastPollTime() { return new Date('2026-07-10T00:00:00Z'); },
    async setLastPollTime(date) { savedPollTimes.push(date.toISOString()); },
  };
  const service = createGmailReceiptSyncService({
    gmail,
    pollState,
    parser: async (text, date) => ({ text, occurredAt: date.toISOString() }),
    enricher: async (parsed, id) => {
      if (processed.has(id)) return { action: 'skipped', reason: 'already_processed' };
      processed.add(id);
      return { action: 'created', occurredAt: parsed.occurredAt };
    },
    logger: { error() {} },
  });
  const options = {
    sinceText: '2026-07-12',
    max: 2,
    pollStart: new Date('2026-07-12T02:00:00Z'),
  };

  const first = await service(options);
  const replay = await service(options);

  assert.equal(first.results[0].action, 'created');
  assert.equal(replay.results[0].action, 'skipped');
  assert.deepEqual(savedPollTimes, ['2026-07-12T02:00:00.000Z', '2026-07-12T02:00:00.000Z']);
});

test('gmail receipt service isolates per-message failures and advances poll state', async () => {
  let pollStateUpdated = false;
  const service = createGmailReceiptSyncService({
    gmail: {
      async getAccessToken() { return 'token'; },
      async listMessageIds() { return ['ok', 'bad']; },
      async getMessage(token, id) { return { id }; },
      extractMessageDate() { return new Date('2026-07-12T00:00:00Z'); },
      extractMessageText(message) { return message.id; },
    },
    pollState: {
      async getLastPollTime() { return new Date('2026-07-11T00:00:00Z'); },
      async setLastPollTime() { pollStateUpdated = true; },
    },
    parser: async text => {
      if (text === 'bad') throw new Error('fixture parse failure');
      return { source: 'fixture' };
    },
    enricher: async () => ({ action: 'enriched' }),
    logger: { error() {} },
  });

  const result = await service({ max: 20 });

  assert.deepEqual(result.results.map(row => row.action), ['enriched', 'error']);
  assert.equal(result.results[1].error, 'fixture parse failure');
  assert.equal(pollStateUpdated, true);
});

test('gmail receipt query and since validation remain compatible', () => {
  assert.match(buildGmailQuery(new Date('2026-07-10T00:00:00Z')), /from:no-reply@kakaopay\.com/);
  assert.equal(parseSinceText(''), '');
  assert.throws(() => parseSinceText('07/12/2026'), /YYYY-MM-DD/);
});
