import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '_site');

const rootFiles = [
  'index.html',
  'manifest.webmanifest',
  'app-icon.svg',
  'style.css',
  'config.js',
  'data.js',
  'app.js',
  'client-parse.js',
  'match.js',
  'modal-manager.js',
  'parse.js',
  'wine-data.js',
  'render-cart.js',
  'render-finance.js',
  'render-home.js',
  'render-report.js',
  'render-review.js',
  'render-settings.js',
  'render-settle.js',
  'render-tx.js',
];

const directories = [
  'modals',
  'public',
  'urge',
  'utils',
];

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  for (const file of rootFiles) {
    await copyFile(file);
  }
  for (const dir of directories) {
    await fs.cp(path.join(root, dir), path.join(outDir, dir), {
      recursive: true,
      filter: source => !source.endsWith('.md'),
    });
  }
  await fs.writeFile(path.join(outDir, '.nojekyll'), '', 'utf8');
  console.log(`GitHub Pages artifact ready: ${outDir}`);
}

async function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(outDir, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
