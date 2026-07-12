import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ANDROID_CAPTURE_CACHE_VERSION,
  BUDGET_APK_CACHE_VERSION,
  CANONICAL_APP_ENTRY_VERSION,
  CANONICAL_DATA_MODULE_VERSION,
  RELEASE_CONTRACT,
  RELEASE_ID,
  REFACTOR_SURFACE_VERSION,
} from '../scripts/verify/config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('release.json owns the deployed cache contract', async () => {
  const release = JSON.parse(await fs.readFile(path.join(root, 'release.json'), 'utf8'));
  assert.deepEqual(RELEASE_CONTRACT, release);
  assert.equal(RELEASE_ID, release.releaseId);
  assert.match(RELEASE_ID, /^\d{8}-[a-z0-9-]+-r\d+$/);
  assert.equal(CANONICAL_APP_ENTRY_VERSION, release.cache.appEntry);
  assert.equal(REFACTOR_SURFACE_VERSION, release.cache.surface);
  assert.equal(CANONICAL_DATA_MODULE_VERSION, release.cache.data);
  assert.equal(ANDROID_CAPTURE_CACHE_VERSION, release.cache.android);
  assert.equal(BUDGET_APK_CACHE_VERSION, release.cache.apk);
  assert.equal(release.cache.android, release.cache.apk);
});

test('index and Android metadata reference the current release contract', async () => {
  const [index, apkVersion] = await Promise.all([
    fs.readFile(path.join(root, 'index.html'), 'utf8'),
    fs.readFile(path.join(root, 'android', 'apk-version.json'), 'utf8').then(JSON.parse),
  ]);
  assert.match(index, new RegExp(`manifest\\.webmanifest\\?v=${RELEASE_ID}`));
  assert.match(index, new RegExp(`style\\.css\\?v=${REFACTOR_SURFACE_VERSION}&release=${RELEASE_ID}`));
  assert.match(index, new RegExp(`app\\.js\\?v=${CANONICAL_APP_ENTRY_VERSION}&release=${RELEASE_ID}`));
  assert.equal(apkVersion.cacheBust, BUDGET_APK_CACHE_VERSION);
});
