import test from 'node:test';
import assert from 'node:assert/strict';

import { calendarCells } from '../utils/tx-calendar.js';

test('transaction calendar uses delegated day actions', () => {
  const html = calendarCells({ 3: 12000 }, { 3: 2200 }, new Date(2026, 6, 1), new Date(2026, 6, 31), 3);
  assert.match(html, /data-tx-action="select-day" data-day="3"/);
  assert.match(html, /\(\+2,200\)/);
  assert.doesNotMatch(html, /onclick=/);
});
