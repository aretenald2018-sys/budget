import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['.git', '.vercel', '.claude', '.android-build', '_site', 'node_modules', 'secrets', 'docx_render_check', 'memory', '%SystemDrive%']);
const failures = [];
const CANONICAL_API_ORIGIN = 'https://budget-snowy-iota.vercel.app';
const LEGACY_API_ORIGIN = 'https://budget-api-liart.vercel.app';
const CANONICAL_DATA_MODULE_VERSION = '20260703-ingest-purge';
const CANONICAL_DATA_MODULE_SPECIFIER = `data.js?v=${CANONICAL_DATA_MODULE_VERSION}`;

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
  if (!indexText.includes(`./app.js?v=${CANONICAL_DATA_MODULE_VERSION}`)) {
    fail(`index.html must cache-bust app.js with ${CANONICAL_DATA_MODULE_VERSION}.`);
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
  for (const token of ['budget_recipe_sync', 'scripts/github-sync-latest.mjs', 'scripts/github-recipe-sync.mjs']) {
    if (!backendText.includes(token)) fail(`budget-backend.yml is missing ${token}.`);
  }
  for (const token of ['budget_ingest', 'budget_sync', 'scripts/github-ingest.mjs', 'INGEST_TOKEN']) {
    if (backendText.includes(token)) fail(`budget-backend.yml still contains retired phone collection token: ${token}.`);
  }

  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts || {};
  if (!scripts['apk:build']) fail('package.json must expose npm run apk:build.');
  if (!scripts['pages:build']) fail('package.json must expose npm run pages:build.');
  if (!String(scripts['apk:build']).includes('public/downloads/budget.apk')) {
    fail('package.json apk:build must publish the APK to public/downloads/budget.apk.');
  }
  if (String(scripts['apk:build']).includes('--native') || scripts['apk:build:native']) {
    fail('package.json must not expose the retired native collection APK build path.');
  }
  if (String(scripts.deploy || '').includes('vercel')) fail('package.json still has a Vercel deploy script.');

  const apkVersion = JSON.parse(await fs.readFile(path.join(root, 'android', 'apk-version.json'), 'utf8'));
  if (Number(apkVersion.versionCode) < 5) fail('Android versionCode must stay at least 5 for update-safe public APK delivery.');
  if (!apkVersion.versionName) fail('Android versionName is required.');
  if (!apkVersion.cacheBust) fail('Android APK cacheBust is required.');
  await checkApkArtifactMetadata(apkVersion);

  for (const file of [
    'android/AndroidManifest.xml',
    'android/src/com/aretenald/budget/MainActivity.java',
    'android/src/com/aretenald/budget/BudgetAndroidBridge.java',
    'android/src/com/aretenald/budget/BudgetNotificationService.java',
    'android/src/com/aretenald/budget/NotificationCaptureStore.java',
    'android/src/com/aretenald/budget/PaymentNotificationParser.java',
    'android/src/com/aretenald/budget/SmsCaptureScanner.java',
    'scripts/build-android-apk.mjs',
    'public/android-apk.svg',
  ]) {
    if (!(await exists(path.join(root, file)))) fail(`Missing Android APK support file: ${file}`);
  }
  const settingsText = await fs.readFile(path.join(root, 'render-settings.js'), 'utf8');
  if (!settingsText.includes('./downloads/budget.apk')) fail('Settings screen must expose the Android APK download link.');
  if (!settingsText.includes('./android-apk.svg')) fail('Settings screen must use the Pages-root Android APK icon path.');
  if (!settingsText.includes(String(apkVersion.cacheBust))) fail('Settings APK download link must use the Android APK cache bust.');
  for (const token of ['알림 수집 포함 APK', 'API bridge URL', 'ingest token', '토큰 삭제', '큐 재전송']) {
    if (settingsText.includes(token)) fail(`Settings screen still exposes retired collection UI text: ${token}.`);
  }
  const androidManifest = await fs.readFile(path.join(root, 'android', 'AndroidManifest.xml'), 'utf8');
  if (androidManifest.includes('android.intent.action.SEND') || androidManifest.includes('text/plain')) {
    fail('Android APK must not register text/plain ACTION_SEND after the selection share target removal.');
  }
  if (androidManifest.includes('android.permission.RECEIVE_SMS') || androidManifest.includes('BudgetNotificationListener')) {
    fail('AndroidManifest must not include retired phone collection permissions or services.');
  }
  const mainActivity = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'MainActivity.java'), 'utf8');
  if (mainActivity.includes('appendQueryParameter("shareTarget", "cart")') || mainActivity.includes('Intent.EXTRA_TEXT')) {
    fail('Android APK must not forward shared text into the retired cart share target URL.');
  }
  const apkBuilder = await fs.readFile(path.join(root, 'scripts', 'build-android-apk.mjs'), 'utf8');
  for (const token of ['BudgetSmsReceiver', 'BudgetNotificationListener', 'BudgetNativeBridge', 'NativeIngestClient', 'NativeIngestStore', 'android.permission.RECEIVE_SMS', 'NotificationListenerService.requestRebind', '/api/ingest', '--native']) {
    if (apkBuilder.includes(token)) fail(`APK builder still contains retired phone collection token: ${token}.`);
  }
  if (!apkBuilder.includes('BudgetAndroidBridge') || !apkBuilder.includes('addJavascriptInterface')) {
    fail('APK builder must attach the new Android bridge to the WebView.');
  }
}

async function checkApkArtifactMetadata(apkVersion) {
  const apkPath = path.join(root, 'public', 'downloads', 'budget.apk');
  const metadataPath = path.join(root, 'public', 'downloads', 'budget-apk.json');
  if (!(await exists(apkPath))) fail('public/downloads/budget.apk is missing; run npm.cmd run apk:build before Pages deployment.');
  if (!(await exists(metadataPath))) {
    fail('public/downloads/budget-apk.json is missing; run npm.cmd run apk:build before Pages deployment.');
    return;
  }
  let metadata = null;
  try {
    metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  } catch (err) {
    fail(`public/downloads/budget-apk.json is invalid JSON: ${err.message}`);
    return;
  }
  for (const key of ['versionCode', 'versionName', 'cacheBust']) {
    if (String(metadata[key]) !== String(apkVersion[key])) {
      fail(`public/downloads/budget-apk.json is stale: ${key} is ${metadata[key]}, expected ${apkVersion[key]}. Run npm.cmd run apk:build.`);
    }
  }
}

async function checkAndroidLocalNotificationContracts() {
  const manifest = await fs.readFile(path.join(root, 'android', 'AndroidManifest.xml'), 'utf8');
  for (const token of ['.BudgetNotificationService', 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE', 'android.service.notification.NotificationListenerService']) {
    if (!manifest.includes(token)) fail(`Android manifest is missing local notification capture contract: ${token}.`);
  }
  if (!manifest.includes('android.permission.READ_SMS')) fail('Android manifest must request READ_SMS for foreground SMS inbox scan fallback.');

  const service = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'BudgetNotificationService.java'), 'utf8');
  if (!service.includes('extends NotificationListenerService') || !service.includes('onNotificationPosted')) {
    fail('BudgetNotificationService must extend NotificationListenerService and handle posted notifications.');
  }
  for (const token of ['getActiveNotifications', 'active_scan', 'BudgetNotifSvc']) {
    if (!service.includes(token)) fail(`BudgetNotificationService must preserve ADB-diagnosable active notification capture: ${token}.`);
  }

  const parser = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'PaymentNotificationParser.java'), 'utf8');
  for (const token of ['Notification.EXTRA_TITLE', 'Notification.EXTRA_TEXT', 'Notification.EXTRA_BIG_TEXT', 'Notification.EXTRA_TEXT_LINES']) {
    if (!parser.includes(token)) fail(`PaymentNotificationParser must read ${token}.`);
  }
  for (const token of ['MESSAGE_PACKAGE_HINTS', '"messaging"', '"sms"', '"메시지"', 'NAVER_PAY_CANCEL_RE', 'android_local_sms', 'parseSms']) {
    if (!parser.includes(token)) fail(`PaymentNotificationParser must preserve SMS notification source handling: ${token}.`);
  }
  if (!parser.includes('"android_local_notification"') || !parser.includes('card_payment')) {
    fail('PaymentNotificationParser must emit android_local_notification card/transfer captures.');
  }
  for (const token of ['NAVER_PAY_PAYMENT_RE', '"paymentRail"', '"paymentRailResolved"', '"actualMerchant"', '네이버페이 결제완료 문자']) {
    if (!parser.includes(token)) fail(`PaymentNotificationParser must preserve NaverPay completed payment contract: ${token}.`);
  }

  const store = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'NotificationCaptureStore.java'), 'utf8');
  for (const token of ['SharedPreferences', 'listPendingJson', 'ack(', 'fail(', 'statusJson']) {
    if (!store.includes(token)) fail(`NotificationCaptureStore is missing ${token}.`);
  }

  const bridge = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'BudgetAndroidBridge.java'), 'utf8');
  for (const token of ['@JavascriptInterface', 'listPendingNotificationCaptures', 'ackNotificationCapture', 'failNotificationCapture', 'openNotificationAccessSettings', 'scanRecentSmsCaptures', 'requestSmsReadPermission']) {
    if (!bridge.includes(token)) fail(`BudgetAndroidBridge is missing ${token}.`);
  }
  const activity = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'MainActivity.java'), 'utf8');
  for (const token of ['onResume', 'onRequestPermissionsResult', 'SmsCaptureScanner.scanRecent']) {
    if (!activity.includes(token)) fail(`MainActivity must trigger recent SMS capture scan: ${token}.`);
  }
  const smsScanner = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'SmsCaptureScanner.java'), 'utf8');
  for (const token of ['content://sms/inbox', 'READ_SMS', 'PaymentNotificationParser.parseSms', 'NotificationCaptureStore.enqueue']) {
    if (!smsScanner.includes(token)) fail(`SmsCaptureScanner is missing ${token}.`);
  }
  for (const token of ['/api/', 'GEMINI_API_KEY', 'FIREBASE_SERVICE_ACCOUNT', 'GITHUB']) {
    if (bridge.includes(token) || parser.includes(token) || store.includes(token) || service.includes(token)) {
      fail(`Android local notification code must not contain server/network secret path token: ${token}.`);
    }
  }

  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  for (const token of ['flushAndroidNotificationCaptures', 'listPendingNotificationCaptures', 'saveTransaction', 'findSimilarTransaction', 'updateTransaction', 'buildNaverPayDuplicateMergePatch', 'refreshCurrentTab']) {
    if (!app.includes(token)) fail(`app.js is missing Android capture flush contract: ${token}.`);
  }
  const captureUtil = await fs.readFile(path.join(root, 'utils', 'android-capture.js'), 'utf8');
  for (const token of ['capture.paymentRail', 'capture.paymentRailResolved', 'capture.actualMerchant', 'capture.reason']) {
    if (!captureUtil.includes(token)) fail(`utils/android-capture.js must preserve Android capture payment metadata: ${token}.`);
  }

  const settings = await fs.readFile(path.join(root, 'render-settings.js'), 'utf8');
  for (const token of ['Android 알림/문자 수집', '알림 접근 열기', '문자 권한', '지금 반영']) {
    if (!settings.includes(token)) fail(`Settings screen is missing Android capture UI: ${token}.`);
  }
}

async function checkAndroidCaptureTransactionSmoke() {
  const moduleUrl = pathToFileURL(path.join(root, 'utils', 'android-capture.js')).href;
  const {
    transactionFromAndroidCapture,
    parseAndroidCaptureBridgeJsonArray,
  } = await import(moduleUrl);
  const calendarModuleUrl = pathToFileURL(path.join(root, 'utils', 'tx-calendar.js')).href;
  const { dailyExpenseMap, calendarCells } = await import(calendarModuleUrl);

  const captures = parseAndroidCaptureBridgeJsonArray(JSON.stringify([{
    id: 'capture_naverpay_1',
    type: 'card_payment',
    amount: 12800,
    merchant: '문정식당',
    occurredAt: '2026-07-03T12:34:00+09:00',
    confidence: 0.96,
    source: 'android_local_notification',
    packageName: 'com.nhn.android.search',
    appLabel: '네이버',
    title: '[네이버페이] 결제 완료 안내',
    text: '문정식당 12,800원',
    raw: '[네이버페이] 결제 완료 안내 문정식당 12,800원',
    paymentRail: 'naverpay',
    paymentRailResolved: true,
    actualMerchant: '문정식당',
    reason: '네이버페이 결제완료 문자',
  }]));
  if (captures.length !== 1) fail('Android capture bridge JSON parser should return one sample capture.');

  const tx = transactionFromAndroidCapture(captures[0]);
  if (!tx) {
    fail('Android capture sample should convert to a transaction payload.');
    return;
  }
  if (tx.source !== 'android_local_notification') fail('Android capture transaction must preserve android_local_notification source.');
  if (tx.type !== 'card_payment' || tx.amount !== 12800 || tx.merchant !== '문정식당') {
    fail(`Android capture transaction fields regressed: ${JSON.stringify({ type: tx.type, amount: tx.amount, merchant: tx.merchant })}`);
  }
  if (!(tx.occurredAt instanceof Date) || tx.occurredAt.getTime() !== new Date('2026-07-03T12:34:00+09:00').getTime()) {
    fail('Android capture transaction must convert occurredAt to the captured Date.');
  }
  if (tx.paymentRail !== 'naverpay' || tx.paymentRailResolved !== true || tx.actualMerchant !== '문정식당') {
    fail('Android capture transaction must preserve NaverPay rail metadata.');
  }
  const daily = dailyExpenseMap([tx]);
  if (daily[3] !== 12800) {
    fail(`Android capture transaction must contribute to the transaction calendar daily amount: ${JSON.stringify(daily)}`);
  }
  const calendarHtml = calendarCells(daily, {}, new Date(2026, 6, 1), new Date(2026, 6, 31), 3);
  if (!calendarHtml.includes('<em>-12,800</em>') || !calendarHtml.includes('cal-day active')) {
    fail('Android capture transaction must render as a visible spending amount in the calendar cell.');
  }
  if (transactionFromAndroidCapture({ id: 'bad', amount: 0, occurredAt: '2026-07-03T12:34:00+09:00' }) !== null) {
    fail('Android capture transaction should reject zero-amount captures.');
  }
}

async function checkRetiredPhoneCollectionPurged(files) {
  const deletedPaths = [
    'client-parse.js',
    'api/ingest.js',
    'api/ingest/sms.js',
    'api/ingest/notif.js',
    'api/client-config.js',
    'api/client-parse.js',
    'api/_lib/auto-ingest.js',
    'api/_lib/server-parser.js',
    'api/_lib/request-payload.js',
    'api/_lib/firestore-rest.js',
    'api/_lib/auth.js',
    'scripts/github-ingest.mjs',
    'scripts/reprocess-pending-raw.mjs',
    'scripts/link-duplicate-raw.mjs',
    'android/src/com/aretenald/budget/BudgetNativeBridge.java',
    'android/src/com/aretenald/budget/BudgetNotificationListener.java',
    'android/src/com/aretenald/budget/BudgetSmsReceiver.java',
    'android/src/com/aretenald/budget/NativeIngestClient.java',
    'android/src/com/aretenald/budget/NativeIngestStore.java',
  ];
  for (const relativePath of deletedPaths) {
    if (await exists(path.join(root, relativePath))) {
      fail(`Retired phone collection file still exists: ${relativePath}`);
    }
  }

  const forbiddenTokens = [
    'MacroDroid',
    'INGEST_TOKEN',
    'budget_ingest',
    'budget_sync',
    'client-parse.js',
    'api/client-parse.js',
    'api/client-config.js',
    'auto-ingest.js',
    'server-parser.js',
    'request-payload.js',
    'firestore-rest.js',
    'github-ingest.mjs',
    'reprocess-pending-raw.mjs',
    'link-duplicate-raw.mjs',
    'BudgetNativeBridge',
    'BudgetNotificationListener',
    'BudgetSmsReceiver',
    'NativeIngestClient',
    'NativeIngestStore',
    'android.permission.RECEIVE_SMS',
    '/api/ingest',
    'browserFallbackParse',
    'clientFallbackParse',
    'listRecentRawMessages',
    'markRawMessageParsed',
    'listPendingMailboxRawMessagesById',
    'markMailboxRawMessageParsedById',
    'markMailboxRawMessageSkippedById',
  ];
  const scanExts = new Set(['.js', '.mjs', '.html', '.md', '.yml', '.yaml', '.json', '.xml', '.java', '.rules']);
  const scanFiles = files.filter(file => {
    const r = rel(file);
    if (r === 'scripts/verify-project.mjs') return false;
    if (r.startsWith('docs/ai/') || r.startsWith('docs/adr/')) return false;
    if (r.startsWith('reports/') || r.endsWith('.csv')) return false;
    return scanExts.has(path.extname(r));
  });

  for (const file of scanFiles) {
    const text = await fs.readFile(file, 'utf8');
    for (const token of forbiddenTokens) {
      if (text.includes(token)) {
        fail(`Retired phone collection token "${token}" found in ${rel(file)}.`);
      }
    }
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
  if (await exists(path.join(root, '_site', 'client-parse.js'))) fail('Pages artifact must not include retired client-parse.js.');
  if (await exists(path.join(root, '_site', 'choice'))) fail('Pages artifact must not include retired choice/ browser modules.');
  if (await exists(path.join(root, 'public', 'downloads', 'budget.apk'))) {
    for (const file of ['downloads/budget.apk', 'downloads/budget-apk.json']) {
      if (!(await exists(path.join(root, '_site', file)))) fail(`Pages artifact missing ${file}.`);
    }
  }
  if (await exists(path.join(root, '_site', 'api'))) fail('Pages artifact must not include Vercel-style api/ functions.');
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
  await checkDataModuleImportContracts(files);
  await checkApiOriginContracts();
  await checkRetiredRefactorArtifacts();
  await checkFileSizeGuard();
  await checkDeploymentConfig();
  await checkAndroidLocalNotificationContracts();
  await checkAndroidCaptureTransactionSmoke();
  await checkRetiredPhoneCollectionPurged(files);
  await checkPagesBuild();
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
