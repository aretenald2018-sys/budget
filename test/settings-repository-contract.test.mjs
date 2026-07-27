import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings repository owns the ISO date normalizer used by app settings', async () => {
  const source = await readFile(new URL('../data/repositories/settings.js', import.meta.url), 'utf8');
  assert.match(source, /function\s+normalizeISODate\s*\(value\)/);
  assert.match(source, /base\.biweeklyStartDate\s*=\s*normalizeISODate\(value\.biweeklyStartDate\)/);
  // 오늘 카드(dailyReward.selectedDateKey)는 적립 규칙과 무관해 제거됐다.
  assert.doesNotMatch(source, /selectedDateKey/);
});

test('settings repository normalizes the safeToSpend preferences', async () => {
  const source = await readFile(new URL('../data/repositories/settings.js', import.meta.url), 'utf8');
  assert.match(source, /safeToSpend:\s*\{\s*\n?\s*enabled:\s*true/);
  assert.match(source, /function\s+normalizeSafeToSpendSettings/);
  assert.match(source, /\['period',\s*'daily'\]\.includes\(pacingMode\)/);
  assert.match(source, /safeToSpend:\s*normalizeSafeToSpendSettings\(settings\?\.safeToSpend\)/);
  assert.match(source, /base\.safeToSpend\s*=\s*normalizeSafeToSpendSettings\(value\.safeToSpend\)/);
});
