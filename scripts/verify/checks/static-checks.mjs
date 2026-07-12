import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  root,
  fail,
  rel,
  exists,
  walk,
  lineNumber,
  stripUrlSuffix,
  isLocalSpecifier,
  shouldSkipApkArtifactChecks,
} from '../runtime.mjs';
import {
  CANONICAL_API_ORIGIN,
  LEGACY_API_ORIGIN,
  CANONICAL_DATA_MODULE_VERSION,
  CANONICAL_DATA_MODULE_SPECIFIER,
  CANONICAL_APP_MODULE_VERSION,
  REWARD_WIDGET_CACHE_VERSION,
  BUDGET_APK_CACHE_VERSION,
  REWARD_ENTRY_CRUD_VERSION,
  CANONICAL_APP_ENTRY_VERSION,
  CANONICAL_NEWSFEED_VERSION,
  CANONICAL_TELEGRAM_SOURCE_VERSION,
  CURRENT_MODAL_CACHE_VERSION,
  TX_DETAIL_COMPACT_REFUND_VERSION,
} from '../config.mjs';

async function checkSyntax(jsFiles) {
  for (const file of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0) {
      fail(`Syntax check failed: ${rel(file)}\n${result.stderr || result.stdout}`);
    }
  }
}

async function checkIndexAssets() {
  const indexPath = path.join(root, 'index.html');
  const html = await fs.readFile(indexPath, 'utf8');
  const attrRe = /\b(?:src|href)=["']([^"']+)["']/g;
  for (const match of html.matchAll(attrRe)) {
    const spec = match[1];
    if (!isLocalSpecifier(spec)) continue;
    const target = path.resolve(root, stripUrlSuffix(spec));
    if (!(await exists(target))) {
      fail(`Missing index asset: ${spec} (${rel(indexPath)}:${lineNumber(html, match.index)})`);
    }
  }

  const manifestPath = path.join(root, 'manifest.webmanifest');
  if (await exists(manifestPath)) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const iconSizes = new Set();
    for (const icon of manifest.icons || []) {
      String(icon.sizes || '').split(/\s+/).filter(Boolean).forEach(size => iconSizes.add(size));
      if (!icon.src || !isLocalSpecifier(icon.src)) continue;
      const target = path.resolve(path.dirname(manifestPath), stripUrlSuffix(icon.src));
      if (!(await exists(target))) fail(`Missing manifest icon: ${icon.src}`);
    }
    if (!iconSizes.has('192x192')) fail('Manifest must include a 192x192 icon for Android PWA installability.');
    if (!iconSizes.has('512x512')) fail('Manifest must include a 512x512 icon for Android PWA installability.');
    if (manifest.share_target) fail('Manifest share_target must stay removed with the retired selection tab.');
  }
}

async function checkLocalImports(sourceFiles) {
  const importRe = /\bimport\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportRe = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  const modalPathRe = /\bpath:\s*["']([^"']+)["']/g;

  for (const file of sourceFiles) {
    const text = await fs.readFile(file, 'utf8');
    const specs = [
      ...[...text.matchAll(importRe)].map(match => match[1]),
      ...[...text.matchAll(dynamicImportRe)].map(match => match[1]),
      ...(rel(file) === 'modal-manager.js' ? [...text.matchAll(modalPathRe)].map(match => match[1]) : []),
    ];
    for (const spec of specs) {
      if (!isLocalSpecifier(spec)) continue;
      const target = path.resolve(path.dirname(file), stripUrlSuffix(spec));
      if (!(await exists(target))) {
        fail(`Missing local import: ${spec} from ${rel(file)}`);
      }
    }
  }
}

async function checkCssImports() {
  const cssFiles = (await walk(root)).filter(file => /\.css$/.test(file));
  const importRe = /@import\s+(?:url\()?["']([^"']+)["']\)?/g;
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
  for (const file of cssFiles) {
    const text = await fs.readFile(file, 'utf8');
    for (const match of text.matchAll(importRe)) {
      if (!isLocalSpecifier(match[1])) continue;
      const target = path.resolve(path.dirname(file), stripUrlSuffix(match[1]));
      if (!(await exists(target))) fail(`Missing CSS import: ${match[1]} from ${rel(file)}`);
    }
    for (const match of text.matchAll(urlRe)) {
      const specifier = match[1].trim();
      if (!isLocalSpecifier(specifier) || specifier.startsWith('data:')) continue;
      const target = path.resolve(path.dirname(file), stripUrlSuffix(specifier));
      if (!(await exists(target))) fail(`Missing CSS url: ${specifier} from ${rel(file)}`);
    }
  }
}

async function checkBrowserContracts(files) {
  const browserFiles = files.filter(file => {
    const r = rel(file);
    return /\.(js|html)$/.test(r)
      && !r.startsWith('api/')
      && !r.startsWith('vercel-api/')
      && !r.startsWith('scripts/')
      && !r.startsWith('docs/')
      && !r.startsWith('mockups/');
  });
  const forbidden = /\b(GEMINI_API_KEY|FIREBASE_SERVICE_ACCOUNT|GMAIL_CLIENT_SECRET|GMAIL_REFRESH_TOKEN)\b/g;
  for (const file of browserFiles) {
    const text = await fs.readFile(file, 'utf8');
    for (const match of text.matchAll(forbidden)) {
      fail(`Forbidden server secret name in browser code: ${match[1]} at ${rel(file)}:${lineNumber(text, match.index)}`);
    }
    if (text.includes(LEGACY_API_ORIGIN)) {
      fail(`Browser code still points at the retired API origin: ${rel(file)}`);
    }
  }

  const retiredSelectionTokens = [
    'id="tab-cart"',
    'data-tab="cart"',
    "switchTab('cart')",
    'switchTab("cart")',
    "window.switchTab?.('cart')",
    'shareTarget=cart',
    'renderCart',
    './render-cart.js',
    '선택 탭에서 확인',
  ];
  for (const file of browserFiles) {
    const text = await fs.readFile(file, 'utf8');
    for (const token of retiredSelectionTokens) {
      if (text.includes(token)) fail(`Retired selection-tab entry "${token}" found in ${rel(file)}.`);
    }
  }
}

async function checkDataModuleImportContracts(files) {
  const browserFiles = files.filter(file => {
    const r = rel(file);
    return /\.(js|html)$/.test(r)
      && !r.startsWith('api/')
      && !r.startsWith('vercel-api/')
      && !r.startsWith('scripts/')
      && !r.startsWith('docs/')
      && !r.startsWith('mockups/');
  });
  const dataImportRe = /(?:\bfrom\s+|\bimport\(\s*)["']([^"']*data\.js(?:\?v=[^"']+)?)["']/g;
  const dataImports = [];

  for (const file of browserFiles) {
    const text = await fs.readFile(file, 'utf8');
    for (const match of text.matchAll(dataImportRe)) {
      const spec = match[1];
      if (!isLocalSpecifier(spec)) continue;
      const tail = spec.replace(/^(?:\.\.\/|\.\/)+/, '');
      if (!tail.startsWith('data.js')) continue;
      dataImports.push({ file, spec, line: lineNumber(text, match.index), tail });
      if (tail !== CANONICAL_DATA_MODULE_SPECIFIER) {
        fail(`data.js import must use ${CANONICAL_DATA_MODULE_SPECIFIER}: ${rel(file)}:${lineNumber(text, match.index)} has ${spec}`);
      }
    }
  }

  if (!dataImports.some(item => rel(item.file) === 'app.js' && item.tail === CANONICAL_DATA_MODULE_SPECIFIER)) {
    fail(`app.js must import ${CANONICAL_DATA_MODULE_SPECIFIER} so auth state is shared with render modules.`);
  }

  const indexText = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  if (!indexText.includes(`./app.js?v=${CANONICAL_APP_ENTRY_VERSION}`)) {
    fail(`index.html must cache-bust app.js with ${CANONICAL_APP_ENTRY_VERSION}.`);
  }
}

async function checkApiOriginContracts() {
  const expectedFiles = [
    ['config.js', CANONICAL_API_ORIGIN],
    ['index.html', CANONICAL_API_ORIGIN],
  ];

  for (const [file, expected] of expectedFiles) {
    const target = path.join(root, file);
    const text = await fs.readFile(target, 'utf8');
    if (!text.includes(expected)) fail(`Canonical API origin missing from ${file}`);
  }
}

async function checkRetiredRefactorArtifacts() {
  for (const file of ['match.js', 'parse.js']) {
    if (await exists(path.join(root, file))) {
      fail(`${file} is retired; do not reintroduce it at the repository root.`);
    }
  }
  for (const file of ['render-cart.js', 'styles/30-cart-board.css', 'styles/40-cart-choice.css']) {
    if (await exists(path.join(root, file))) {
      fail(`${file} is retired with the selection tab; do not reintroduce it.`);
    }
  }

  const buildPages = await fs.readFile(path.join(root, 'scripts', 'build-pages.mjs'), 'utf8');
  for (const token of ["'match.js'", '"match.js"', "'parse.js'", '"parse.js"']) {
    if (buildPages.includes(token)) {
      fail(`scripts/build-pages.mjs must not copy retired root file ${token.slice(1, -1)}.`);
    }
  }

  const retiredTokens = [
    'buySegmentHtml',
    'pactRecommendationInsight',
    'filteredItems(',
    'filterChip(',
    'pactFilterChip',
    'simpleCard(',
    'categoryManager(',
    'cartAddCategory',
    'cartRenameCategory',
    'cartRemoveCategory',
    'recipeCard(',
    'openIngredientSheet',
    'cart-simple',
    'cart-mini-btn',
    'cart-category-manager',
    'cart-card-grid',
    'cart-filter-rail',
    'cart-recipe-card',
    'cart-source-sheet',
    'cart-decision-hero',
  ];
  const filesToScan = [
    'styles/20-records.css',
    'styles/50-cart-detail.css',
  ];

  for (const relativePath of filesToScan) {
    const text = await fs.readFile(path.join(root, relativePath), 'utf8');
    for (const token of retiredTokens) {
      if (text.includes(token)) {
        fail(`Retired selection-tab artifact "${token}" found in ${relativePath}.`);
      }
    }
  }
}

async function checkFileSizeGuard() {
  const limits = new Map([
    ['style.css', 80],
  ]);
  for (const [relativePath, maxLines] of limits) {
    const file = path.join(root, relativePath);
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split('\n').length;
    if (lines > maxLines) fail(`${relativePath} is ${lines} lines; keep it under ${maxLines} by adding modules.`);
  }
  const stylesDir = path.join(root, 'styles');
  if (!(await exists(stylesDir))) fail('styles/ modules are required after the CSS split.');
}

export {
  checkSyntax,
  checkIndexAssets,
  checkLocalImports,
  checkCssImports,
  checkBrowserContracts,
  checkDataModuleImportContracts,
  checkApiOriginContracts,
  checkRetiredRefactorArtifacts,
  checkFileSizeGuard,
};
