import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '_site');
const publicDownloadsDir = path.join(root, 'public', 'downloads');

const rootFiles = [
  'index.html',
  'manifest.webmanifest',
  'app-icon.svg',
  'app-icon-192.png',
  'app-icon-512.png',
  'style.css',
  'config.js',
  'data.js',
  'app.js',
  'modal-manager.js',
  'wine-data.js',
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
  'modals',
  'public',
  'styles',
  'urge',
  'utils',
];

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await validateApkDownloadMetadata();

  for (const file of rootFiles) {
    await copyFile(file);
  }
  for (const dir of directories) {
    await fs.cp(path.join(root, dir), path.join(outDir, dir), {
      recursive: true,
      filter: source => !source.endsWith('.md'),
    });
  }
  await copyOptional(publicDownloadsDir, path.join(outDir, 'downloads'));
  await copyOptional(path.join(root, 'public', 'android-apk.svg'), path.join(outDir, 'android-apk.svg'));
  await fs.writeFile(path.join(outDir, '.nojekyll'), '', 'utf8');
  console.log(`GitHub Pages artifact ready: ${outDir}`);
}

async function validateApkDownloadMetadata() {
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
