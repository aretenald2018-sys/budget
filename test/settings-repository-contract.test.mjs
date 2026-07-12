import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings repository owns the ISO date normalizer used by app settings', async () => {
  const source = await readFile(new URL('../data/repositories/settings.js', import.meta.url), 'utf8');
  assert.match(source, /function\s+normalizeISODate\s*\(value\)/);
  assert.match(source, /base\.biweeklyStartDate\s*=\s*normalizeISODate\(value\.biweeklyStartDate\)/);
  assert.match(source, /selectedDateKey:\s*normalizeISODate\(src\.selectedDateKey\)/);
});
