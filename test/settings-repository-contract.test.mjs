import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings repository owns the ISO date normalizer used by app settings', async () => {
  const source = await readFile(new URL('../data/repositories/settings.js', import.meta.url), 'utf8');
  assert.match(source, /function\s+normalizeISODate\s*\(value\)/);
  assert.match(source, /base\.biweeklyStartDate\s*=\s*normalizeISODate\(value\.biweeklyStartDate\)/);
  // 1주 시작일은 2주와 별개 필드다. 같은 방식으로 정규화되고, 부분 저장에서도
  // 각자 키가 있을 때만 덮여야 주기를 오가도 반대쪽 시작일이 살아남는다.
  assert.match(source, /base\.weeklyStartDate\s*=\s*normalizeISODate\(value\.weeklyStartDate\)/);
  assert.match(source, /'weeklyStartDate'\s+in\s+value/);
  assert.match(source, /'biweeklyStartDate'\s+in\s+value/);
  // 오늘 카드(dailyReward.selectedDateKey)는 적립 규칙과 무관해 제거됐다.
  assert.doesNotMatch(source, /selectedDateKey/);
});

// 구버전 'weekly' 흡수를 걷어낸 자리 — 이게 되살아나면 1주 예산이 조용히 격주가 된다.
test('settings repository keeps weekly as a first-class budget cycle', async () => {
  const source = await readFile(new URL('../data/repositories/settings.js', import.meta.url), 'utf8');
  assert.match(source, /if\s*\(cycle === 'weekly'\)\s*return 'weekly';/);
  assert.doesNotMatch(source, /\['biweekly',\s*'weekly',\s*'custom'\]/);
});

test('settings repository normalizes the safeToSpend preferences', async () => {
  const source = await readFile(new URL('../data/repositories/settings.js', import.meta.url), 'utf8');
  assert.match(source, /safeToSpend:\s*\{\s*\n?\s*enabled:\s*true/);
  assert.match(source, /function\s+normalizeSafeToSpendSettings/);
  // pacingMode 는 어디서도 읽히지 않는 죽은 설정이라 제거했다(wiring 검사가 잡았다).
  assert.doesNotMatch(source, /pacingMode/);
  assert.match(source, /safeToSpend:\s*normalizeSafeToSpendSettings\(settings\?\.safeToSpend\)/);
  assert.match(source, /base\.safeToSpend\s*=\s*normalizeSafeToSpendSettings\(value\.safeToSpend\)/);
});
