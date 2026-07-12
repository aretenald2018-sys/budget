import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '_site');
const publicDownloadsDir = path.join(root, 'public', 'downloads');
const publicApkIcon = path.join(root, 'public', 'android-apk.svg');
const releasePath = path.join(root, 'release.json');

const rootFiles = [
  'index.html',
  'release.json',
  'manifest.webmanifest',
  'app-icon.svg',
  'app-icon-192.png',
  'app-icon-512.png',
  'style.css',
  'config.js',
  'data.js',
  'app.js',
  'modal-manager.js',
  'render-finance.js',
  'render-home.js',
  'render-newsfeed.js',
  'render-report.js',
  'render-review.js',
  'render-settings.js',
  'render-settle.js',
  'render-tx.js',
];

const directories = [
  'data',
  'domain',
  'features',
  'modals',
  'public',
  'styles',
  'utils',
];

async function main() {
  const release = await validateReleaseContract();
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await validateApkDownloadMetadata(release);

  for (const file of rootFiles) {
    await copyFile(file);
  }
  for (const dir of directories) {
    await fs.cp(path.join(root, dir), path.join(outDir, dir), {
      recursive: true,
      filter: source => shouldCopyDirectorySource(dir, source),
    });
  }
  await copyOptional(publicDownloadsDir, path.join(outDir, 'downloads'));
  await copyOptional(publicApkIcon, path.join(outDir, 'android-apk.svg'));
  await fs.writeFile(path.join(outDir, '.nojekyll'), '', 'utf8');
  await validateArtifactAllowlist();
  console.log(`GitHub Pages artifact ready: ${outDir}`);
}

async function validateReleaseContract() {
  const release = JSON.parse(await fs.readFile(releasePath, 'utf8'));
  if (release.schemaVersion !== 1 || !release.releaseId || !release.cache) {
    throw new Error('release.json must define schemaVersion 1, releaseId, and cache.');
  }
  const requiredCacheKeys = ['appEntry', 'appModule', 'surface', 'data', 'modal', 'rewardWidget', 'rewardEntry', 'newsfeed', 'telegramSource', 'android', 'apk'];
  for (const key of requiredCacheKeys) {
    if (!String(release.cache[key] || '').trim()) throw new Error(`release.json is missing cache.${key}.`);
  }
  const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  for (const token of [
    `manifest.webmanifest?v=${release.releaseId}`,
    `style.css?v=${release.cache.surface}&release=${release.releaseId}`,
    `app.js?v=${release.cache.appEntry}&release=${release.releaseId}`,
    `android=${release.cache.android}`,
    `apk=${release.cache.apk}`,
  ]) {
    if (!index.includes(token)) throw new Error(`index.html is missing release contract token: ${token}.`);
  }
  const apkVersion = JSON.parse(await fs.readFile(path.join(root, 'android', 'apk-version.json'), 'utf8'));
  if (apkVersion.cacheBust !== release.cache.apk) {
    throw new Error(`android/apk-version.json cacheBust must match release.json cache.apk (${release.cache.apk}).`);
  }
  return release;
}

async function validateApkDownloadMetadata(release) {
  const apkPath = path.join(publicDownloadsDir, 'budget.apk');
  const metadataPath = path.join(publicDownloadsDir, 'budget-apk.json');
  const versionPath = path.join(root, 'android', 'apk-version.json');
  if (!(await exists(apkPath)) || !(await exists(metadataPath))) {
    throw new Error('Android APK artifact is missing. Run npm.cmd run apk:build before npm.cmd run pages:build.');
  }
  const expected = JSON.parse(await fs.readFile(versionPath, 'utf8'));
  const actual = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  for (const key of ['versionCode', 'versionName', 'cacheBust']) {
    if (String(actual[key]) !== String(expected[key])) {
      throw new Error(`Android APK metadata is stale: ${key} is ${actual[key]}, expected ${expected[key]}. Run npm.cmd run apk:build before npm.cmd run pages:build.`);
    }
  }
  if (actual.cacheBust !== release.cache.apk) {
    throw new Error(`Android APK metadata cacheBust must match release.json cache.apk (${release.cache.apk}).`);
  }
}

function shouldCopyDirectorySource(directory, source) {
  if (source.endsWith('.md')) return false;
  if (directory !== 'public') return true;
  if (source === publicApkIcon) return false;
  return source !== publicDownloadsDir && !source.startsWith(`${publicDownloadsDir}${path.sep}`);
}

async function validateArtifactAllowlist() {
  const allowed = new Set([...rootFiles, ...directories, 'downloads', 'android-apk.svg', '.nojekyll']);
  const entries = await fs.readdir(outDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!allowed.has(entry.name)) throw new Error(`Pages artifact contains an unapproved top-level entry: ${entry.name}.`);
  }
  for (const forbidden of ['api', 'android', 'docs', 'scripts', 'test', '.github', '.env', 'node_modules']) {
    if (await exists(path.join(outDir, forbidden))) throw new Error(`Pages artifact leaked private/server path: ${forbidden}.`);
  }
  for (const duplicate of ['public/downloads', 'public/android-apk.svg']) {
    if (await exists(path.join(outDir, duplicate))) throw new Error(`Pages artifact duplicated a root public asset: ${duplicate}.`);
  }
  for (const required of ['index.html', 'release.json', 'app.js', 'data.js', 'downloads/budget.apk', 'downloads/budget-apk.json']) {
    if (!(await exists(path.join(outDir, required)))) throw new Error(`Pages artifact is missing required release file: ${required}.`);
  }
}

async function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(outDir, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function copyOptional(source, target) {
  try {
    const stat = await fs.stat(source);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (stat.isDirectory()) {
      await fs.cp(source, target, { recursive: true });
    } else {
      await fs.copyFile(source, target);
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
