import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { BUDGET_APK_CACHE_VERSION, RELEASE_CONTRACT, RELEASE_ID } from '../scripts/verify/config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('release.json owns the deployed web cache contract', async () => {
  const release = JSON.parse(await fs.readFile(path.join(root, 'release.json'), 'utf8'));
  assert.deepEqual(RELEASE_CONTRACT, release);
  assert.equal(RELEASE_ID, release.releaseId);
  assert.match(RELEASE_ID, /^\d{8}-[a-z0-9-]+-r\d+$/);
  assert.equal(release.schemaVersion, 2);
  for (const key of ['appEntry', 'appModule', 'surface', 'data', 'modal', 'rewardWidget', 'rewardEntry', 'newsfeed', 'android']) {
    assert.equal(release.cache[key], RELEASE_ID);
  }
  assert.equal(BUDGET_APK_CACHE_VERSION, release.cache.apk);
});

test('source entrypoints have no manually-owned cache queries', async () => {
  const [index, apkVersion] = await Promise.all([
    fs.readFile(path.join(root, 'index.html'), 'utf8'),
    fs.readFile(path.join(root, 'android', 'apk-version.json'), 'utf8').then(JSON.parse),
  ]);
  assert.match(index, /href="\.\/manifest\.webmanifest"/);
  assert.match(index, /href="\.\/style\.css"/);
  assert.match(index, /src="\.\/app\.js"/);
  assert.doesNotMatch(index, /(?:manifest\.webmanifest|style\.css|app\.js)\?/);
  assert.equal(apkVersion.cacheBust, BUDGET_APK_CACHE_VERSION);
});
