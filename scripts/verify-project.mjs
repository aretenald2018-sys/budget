import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['.git', '.vercel', '.claude', '_site', 'node_modules', 'secrets', 'docx_render_check', 'memory', '%SystemDrive%']);
const failures = [];
const CANONICAL_API_ORIGIN = 'https://budget-snowy-iota.vercel.app';
const LEGACY_API_ORIGIN = 'https://budget-api-liart.vercel.app';
const CANONICAL_INGEST_URL = `${CANONICAL_API_ORIGIN}/api/ingest`;
const LEGACY_INGEST_URL = `${LEGACY_API_ORIGIN}/api/ingest`;

function fail(message) {
  failures.push(message);
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

function stripUrlSuffix(specifier) {
  return specifier.split(/[?#]/)[0];
}

function isLocalSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

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
  const forbidden = /\b(GEMINI_API_KEY|INGEST_TOKEN|FIREBASE_SERVICE_ACCOUNT|GMAIL_CLIENT_SECRET|GMAIL_REFRESH_TOKEN)\b/g;
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

async function checkApiOriginContracts() {
  const expectedFiles = [
    ['config.js', CANONICAL_API_ORIGIN],
    ['index.html', CANONICAL_API_ORIGIN],
    ['render-settings.js', CANONICAL_INGEST_URL],
    [path.join('android', 'src', 'com', 'aretenald', 'budget', 'NativeIngestStore.java'), CANONICAL_INGEST_URL],
  ];

  for (const [file, expected] of expectedFiles) {
    const target = path.join(root, file);
    const text = await fs.readFile(target, 'utf8');
    if (!text.includes(expected)) fail(`Canonical API origin missing from ${file}`);
  }

  const nativeStore = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'NativeIngestStore.java'), 'utf8');
  if (!nativeStore.includes(LEGACY_INGEST_URL)) {
    fail('Native ingest store should retain legacy ingest URL migration.');
  }
  if (!nativeStore.includes('normalizeApiUrl')) {
    fail('Native ingest store should normalize saved API URLs.');
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

async function checkDeploymentConfig() {
  const gitignorePath = path.join(root, '.gitignore');
  const gitignore = await fs.readFile(gitignorePath, 'utf8');
  if (/^config\.js$/m.test(gitignore)) {
    fail('config.js is ignored, but GitHub Pages deploys need it in the repository.');
  }
  if (!gitignore.includes('_site/')) {
    fail('.gitignore must exclude the generated _site/ Pages artifact.');
  }

  const configPath = path.join(root, 'config.js');
  const config = await fs.readFile(configPath, 'utf8');
  if (!/export\s+const\s+firebaseConfig\s*=/.test(config)) {
    fail('config.js must export firebaseConfig for data.js.');
  }

  if (await exists(path.join(root, 'vercel.json'))) fail('vercel.json should not remain after the GitHub Pages migration.');
  if (await exists(path.join(root, '.vercelignore'))) fail('.vercelignore should not remain after the GitHub Pages migration.');

  const validateWorkflow = path.join(root, '.github', 'workflows', 'validate.yml');
  const pagesWorkflow = path.join(root, '.github', 'workflows', 'pages.yml');
  const backendWorkflow = path.join(root, '.github', 'workflows', 'budget-backend.yml');
  if (!(await exists(validateWorkflow))) fail('Missing GitHub validation workflow.');
  if (!(await exists(pagesWorkflow))) fail('Missing GitHub Pages deployment workflow.');
  if (!(await exists(backendWorkflow))) fail('Missing GitHub Actions backend workflow.');

  const pagesText = await fs.readFile(pagesWorkflow, 'utf8');
  if (!pagesText.includes('actions/deploy-pages')) fail('pages.yml must deploy with GitHub Pages.');
  if (!pagesText.includes('npm run pages:build')) fail('pages.yml must build the static Pages artifact.');
  if (!pagesText.includes('npm run apk:build')) fail('pages.yml must build the Android APK before the Pages artifact.');
  if (!pagesText.includes('android-actions/setup-android')) fail('pages.yml must install the Android SDK for APK builds.');

  const backendText = await fs.readFile(backendWorkflow, 'utf8');
  for (const token of ['repository_dispatch', 'budget_ingest', 'budget_sync', 'scripts/github-ingest.mjs', 'scripts/github-sync-latest.mjs']) {
    if (!backendText.includes(token)) fail(`budget-backend.yml is missing ${token}.`);
  }

  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts || {};
  if (!scripts['apk:build']) fail('package.json must expose npm run apk:build.');
  if (!scripts['pages:build']) fail('package.json must expose npm run pages:build.');
  if (String(scripts.deploy || '').includes('vercel')) fail('package.json still has a Vercel deploy script.');

  for (const file of [
    'android/AndroidManifest.xml',
    'android/src/com/aretenald/budget/MainActivity.java',
    'scripts/build-android-apk.mjs',
    'public/android-apk.svg',
  ]) {
    if (!(await exists(path.join(root, file)))) fail(`Missing Android APK support file: ${file}`);
  }
  const settingsText = await fs.readFile(path.join(root, 'render-settings.js'), 'utf8');
  if (!settingsText.includes('./downloads/budget.apk')) fail('Settings screen must expose the Android APK download link.');
  if (!settingsText.includes('./android-apk.svg')) fail('Settings screen must use the Pages-root Android APK icon path.');
  const androidManifest = await fs.readFile(path.join(root, 'android', 'AndroidManifest.xml'), 'utf8');
  if (androidManifest.includes('android.intent.action.SEND') || androidManifest.includes('text/plain')) {
    fail('Android APK must not register text/plain ACTION_SEND after the selection share target removal.');
  }
  const mainActivity = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'MainActivity.java'), 'utf8');
  if (mainActivity.includes('appendQueryParameter("shareTarget", "cart")') || mainActivity.includes('Intent.EXTRA_TEXT')) {
    fail('Android APK must not forward shared text into the retired cart share target URL.');
  }
}

async function checkPagesBuild() {
  const result = spawnSync(process.execPath, ['scripts/build-pages.mjs'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    fail(`GitHub Pages artifact build failed:\n${result.stderr || result.stdout}`);
    return;
  }
  for (const file of ['index.html', 'app.js', 'config.js', 'utils/runtime.js', '.nojekyll']) {
    if (!(await exists(path.join(root, '_site', file)))) fail(`Pages artifact missing ${file}.`);
  }
  if (!(await exists(path.join(root, '_site', 'android-apk.svg')))) fail('Pages artifact missing android-apk.svg.');
  if (await exists(path.join(root, '_site', 'render-cart.js'))) fail('Pages artifact must not include retired render-cart.js.');
  if (await exists(path.join(root, '_site', 'choice'))) fail('Pages artifact must not include retired choice/ browser modules.');
  if (await exists(path.join(root, 'public', 'downloads', 'budget.apk'))) {
    for (const file of ['downloads/budget.apk', 'downloads/budget-apk.json']) {
      if (!(await exists(path.join(root, '_site', file)))) fail(`Pages artifact missing ${file}.`);
    }
  }
  if (await exists(path.join(root, '_site', 'api'))) fail('Pages artifact must not include Vercel-style api/ functions.');
}

async function checkRequestPayloadSmoke() {
  const moduleUrl = pathToFileURL(path.join(root, 'api', '_lib', 'request-payload.js')).href;
  const { normalizeIncomingPayload, parseRequestBody } = await import(moduleUrl);

  const cases = [
    normalizeIncomingPayload({ sender: 'KB', body: 'KB 12,000원 승인', receivedAt: '2026-05-05T12:00:00+09:00' }),
    normalizeIncomingPayload({ notification_title: 'Naver Pay', notification_text: ['결제', '8,900원'] }),
    normalizeIncomingPayload({ mmsSubject: '영수증', mmsText: '편의점 3,000원' }),
  ];
  if (!cases.every(item => item.body && item.source)) {
    fail('Payload normalizer smoke test did not produce body/source.');
  }

  const form = parseRequestBody({ body: 'sender=KB&body=12%2C000%EC%9B%90', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  if (form.sender !== 'KB' || !form.body.includes('12,000')) {
    fail('Form-like MacroDroid payload parsing regressed.');
  }

  try {
    normalizeIncomingPayload({ body: '[sms_message]' });
    fail('Unresolved MacroDroid placeholder should be rejected.');
  } catch (err) {
    if (err.statusCode !== 400) fail('Unresolved MacroDroid placeholder should throw statusCode 400.');
  }
}

async function checkServerParserSmoke() {
  const moduleUrl = pathToFileURL(path.join(root, 'api', '_lib', 'server-parser.js')).href;
  const { parseRawMessage } = await import(moduleUrl);
  const parsed = await parseRawMessage({
    source: 'notif',
    sender: '하나Pay',
    app: '하나Pay',
    body: '(결제) 2,200원 씨유문정엠스테이트점 / 신용(일시불,2*0*) / 07.03 08:40 / 누적이용금액 2,669,049원',
    receivedAt: new Date('2026-07-03T08:40:00+09:00'),
  }, [], []);
  if (parsed.type !== 'card_payment'
    || parsed.amount !== 2200
    || parsed.merchant !== '씨유문정엠스테이트점'
    || parsed.occurredAt !== '2026-07-03T08:40:00+09:00') {
    fail('HanaPay card payment notification parser smoke failed.');
  }
}

async function checkTossKimTaewooSelfTransferExclusion() {
  const moduleUrl = pathToFileURL(path.join(root, 'utils', 'self-transfer.js')).href;
  const {
    SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON,
    applyTossKimTaewooSelfTransferExclusion,
    isTossKimTaewooSelfTransfer,
  } = await import(moduleUrl);

  const selfTransfer = {
    type: 'transfer_out',
    merchant: '토스 김태우',
    body: '토스 김태우 55,000원 송금',
  };
  if (!isTossKimTaewooSelfTransfer(selfTransfer)) {
    fail('Toss Kim Taewoo self-transfer should be detected.');
  }
  const excluded = applyTossKimTaewooSelfTransferExclusion(selfTransfer);
  if (
    excluded.excludedFromBudget !== true ||
    excluded.excludeFromBudget !== true ||
    excluded.excludeReason !== SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON
  ) {
    fail('Toss Kim Taewoo self-transfer should be marked budget-excluded.');
  }

  const nonMatches = [
    { type: 'transfer_out', merchant: '토스 김윤슬', body: '토스 김윤슬 55,000원 송금' },
    { type: 'transfer_out', merchant: '토스 경찰청＿', body: '토스 경찰청＿ 55,000원 송금' },
    { type: 'card_payment', merchant: '토스페이먼츠', body: '토스페이먼츠 55,000원 승인' },
  ];
  if (nonMatches.some(isTossKimTaewooSelfTransfer)) {
    fail('Toss Kim Taewoo exclusion should not match nearby Toss merchants.');
  }
}

async function main() {
  const files = await walk(root);
  const jsFiles = files.filter(file => /\.(js|mjs)$/.test(file));
  const sourceFiles = files.filter(file => /\.(js|mjs|html)$/.test(file));

  await checkSyntax(jsFiles);
  await checkIndexAssets();
  await checkLocalImports(sourceFiles);
  await checkCssImports();
  await checkBrowserContracts(files);
  await checkApiOriginContracts();
  await checkRetiredRefactorArtifacts();
  await checkFileSizeGuard();
  await checkDeploymentConfig();
  await checkPagesBuild();
  await checkRequestPayloadSmoke();
  await checkServerParserSmoke();
  await checkTossKimTaewooSelfTransferExclusion();

  if (failures.length) {
    console.error(`verify-project failed with ${failures.length} issue(s):`);
    for (const item of failures) console.error(`- ${item}`);
    process.exit(1);
  }
  console.log(`verify-project passed (${jsFiles.length} JS files checked).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
