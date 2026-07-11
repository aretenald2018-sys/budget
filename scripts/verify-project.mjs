import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['.git', '.vercel', '.claude', '.android-build', '.omo', '_site', 'node_modules', 'secrets', 'docx_render_check', 'memory', '%SystemDrive%']);
const failures = [];
const CANONICAL_API_ORIGIN = 'https://budget-snowy-iota.vercel.app';
const LEGACY_API_ORIGIN = 'https://budget-api-liart.vercel.app';
const CANONICAL_DATA_MODULE_VERSION = '20260710-gps-route-fidelity';
const CANONICAL_DATA_MODULE_SPECIFIER = `data.js?v=${CANONICAL_DATA_MODULE_VERSION}`;
const CANONICAL_APP_MODULE_VERSION = '20260708-reward-point-settlement';
const REWARD_WIDGET_CACHE_VERSION = '20260709-reward-widget-refresh';
const REWARD_ENTRY_CRUD_VERSION = '20260709-reward-entry-crud';
const CANONICAL_APP_ENTRY_VERSION = REWARD_WIDGET_CACHE_VERSION;
const CANONICAL_NEWSFEED_VERSION = '20260707-newsfeed-digest-clipboard';
const CANONICAL_TELEGRAM_SOURCE_VERSION = '20260704-public-preview-v2';
const CURRENT_MODAL_CACHE_VERSION = REWARD_ENTRY_CRUD_VERSION;
const TX_DETAIL_COMPACT_REFUND_VERSION = '20260708-reward-point-settlement';
const GPS_ROUTE_CACHE_VERSION = '20260710-gps-route-fidelity';
const RUN_COACH_CACHE_VERSION = '20260711-run-coach';
const ANDROID_ROUTE_IMPORT_CACHE_VERSION = '20260711-native-run-tracking';
const ANDROID_APK_CACHE_VERSION = ANDROID_ROUTE_IMPORT_CACHE_VERSION;

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
  for (const token of ['budget_recipe_sync', 'scripts/github-sync-latest.mjs', 'scripts/github-recipe-sync.mjs', 'telegram_public_feed', 'scripts/telegram-feed-sync.mjs', 'scripts/telegram-feed-static.mjs']) {
    if (!backendText.includes(token)) fail(`budget-backend.yml is missing ${token}.`);
  }
  for (const token of ['budget_ingest', 'budget_sync', 'scripts/github-ingest.mjs', 'INGEST_TOKEN']) {
    if (backendText.includes(token)) fail(`budget-backend.yml still contains retired phone collection token: ${token}.`);
  }

  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts || {};
  if (!scripts['apk:build']) fail('package.json must expose npm run apk:build.');
  if (!scripts['pages:build']) fail('package.json must expose npm run pages:build.');
  if (!scripts['telegram:sync']) fail('package.json must expose npm run telegram:sync.');
  if (!scripts['telegram:static']) fail('package.json must expose npm run telegram:static.');
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
    'android/src/com/aretenald/budget/RewardWidgetStore.java',
    'android/src/com/aretenald/budget/RewardWidgetProvider.java',
    'android/src/com/aretenald/budget/BudgetNotificationService.java',
    'android/src/com/aretenald/budget/NotificationCaptureStore.java',
    'android/src/com/aretenald/budget/PaymentNotificationParser.java',
    'android/src/com/aretenald/budget/RunActivityImportStore.java',
    'android/src/com/aretenald/budget/RunTrackingStore.java',
    'android/src/com/aretenald/budget/RunTrackingService.java',
    'android/src/com/aretenald/budget/SmsCaptureScanner.java',
    'android/res/xml/reward_widget_info.xml',
    'android/res/layout/reward_widget.xml',
    'android/res/drawable/reward_widget_background.xml',
    'android/res/drawable/reward_widget_mark_background.xml',
    'android/res/drawable/reward_widget_preview.xml',
    'android/res/drawable/reward_widget_progress.xml',
    'android/res/drawable/reward_widget_row_background.xml',
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
  if (androidManifest.includes('text/plain')) {
    fail('Android APK must not register text/plain ACTION_SEND after the selection share target removal.');
  }
  if (androidManifest.includes('android.intent.action.SEND')) {
    for (const token of ['application/gpx+xml', 'application/vnd.garmin.tcx+xml', 'application/json', 'application/octet-stream', 'text/xml']) {
      if (!androidManifest.includes(token)) fail(`Android route import ACTION_SEND is missing ${token}.`);
    }
  }
  for (const token of ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.FOREGROUND_SERVICE_LOCATION', '.RunTrackingService', 'android:foregroundServiceType="location"']) {
    if (!androidManifest.includes(token)) fail(`Android manifest is missing native run tracking token: ${token}.`);
  }
  if (androidManifest.includes('android.permission.RECEIVE_SMS') || androidManifest.includes('BudgetNotificationListener')) {
    fail('AndroidManifest must not include retired phone collection permissions or services.');
  }
  const mainActivity = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'MainActivity.java'), 'utf8');
  if (mainActivity.includes('appendQueryParameter("shareTarget", "cart")') || mainActivity.includes('Intent.EXTRA_TEXT')) {
    fail('Android APK must not forward shared text into the retired cart share target URL.');
  }
  if (!mainActivity.includes('RunActivityImportStore.enqueueIntent') || !mainActivity.includes('?tab=run&androidRunImport=1')) {
    fail('MainActivity must enqueue Android route imports and open the run tab.');
  }
  const androidBridge = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'BudgetAndroidBridge.java'), 'utf8');
  for (const token of ['setActiveRunActivityImportUser', 'listPendingRunActivityImports(int max)', 'ackRunActivityImport(String id, String uid', 'failRunActivityImport(String id, String uid', 'getRunRecorderStatusJson', 'startRunRecorder', 'pauseRunRecorder', 'resumeRunRecorder', 'stopRunRecorder', 'requestRunLocationPermission']) {
    if (!androidBridge.includes(token)) fail(`BudgetAndroidBridge is missing Android route import bridge token: ${token}`);
  }
  const runImportStore = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'RunActivityImportStore.java'), 'utf8');
  for (const token of ['GPX_POINT_RE', 'XML_ATTR_RE', 'TCX_POINT_RE', 'setActiveUid', 'listPendingJson(Context context, int max)', 'isAllowedRouteMime', 'sanitizedJsonActivity', 'hasValidJsonRoute', 'validRoutePointCount', 'isValidRoutePoint', 'removeRow(Context context, String id, String uid)', 'workoutRoute', 'health', 'gps', 'samples', 'application/octet-stream', 'copyRouteArray(input, out, "path")', 'copyRouteArray(input, out, "coordinates")']) {
    if (!runImportStore.includes(token)) fail(`RunActivityImportStore is missing route import token: ${token}`);
  }
  for (const [file, tokens] of [
    ['RunTrackingStore.java', ['MAX_SAMPLES', 'android_native_gps', 'enqueueRecordedActivity', 'activeDurationSeconds', 'distanceMeters']],
    ['RunTrackingService.java', ['extends Service implements LocationListener', 'startForeground', 'LocationManager.GPS_PROVIDER', 'ACTION_PAUSE', 'ACTION_STOP']],
  ]) {
    const source = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', file), 'utf8');
    for (const token of tokens) if (!source.includes(token)) fail(`${file} is missing native run tracking token: ${token}`);
  }
  if (!mainActivity.includes('APP_PATH_PREFIX = "/budget/"') || !mainActivity.includes('path.startsWith(APP_PATH_PREFIX)')) {
    fail('MainActivity must restrict BudgetAndroid bridge navigation to the /budget/ path.');
  }
  if (mainActivity.includes('("https".equals(scheme) || "http".equals(scheme))')) {
    fail('MainActivity must not allow http:// pages to retain the Android bridge.');
  }
  if (mainActivity.includes('} catch (Exception ignored) {\n                return false;')) {
    fail('MainActivity external navigation failure must not fail open inside the WebView.');
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
  if (!(await exists(apkPath)) || !(await exists(metadataPath))) {
    if (shouldSkipApkArtifactChecks()) return;
  }
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
  for (const token of ['@JavascriptInterface', 'listPendingNotificationCaptures', 'ackNotificationCapture', 'failNotificationCapture', 'recordCaptureInfo', 'openNotificationAccessSettings', 'scanRecentSmsCaptures', 'requestSmsReadPermission']) {
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
  for (const token of ['flushAndroidNotificationCaptures', 'flushAndroidCaptureQueue', 'listPendingNotificationCaptures', 'saveTransaction', 'findSimilarTransaction', 'updateTransaction', 'buildNaverPayDuplicateMergePatch', 'refreshCurrentTab']) {
    if (!app.includes(token)) fail(`app.js is missing Android capture flush contract: ${token}.`);
  }
  const flushUtil = await fs.readFile(path.join(root, 'utils', 'android-flush.js'), 'utf8');
  for (const token of ['flushAndroidCaptureQueue', 'recordCaptureInfo', 'ackNotificationCapture', 'failNotificationCapture', 'androidFlushSummary']) {
    if (!flushUtil.includes(token)) fail(`utils/android-flush.js must preserve Android web flush contract: ${token}.`);
  }
  const captureUtil = await fs.readFile(path.join(root, 'utils', 'android-capture.js'), 'utf8');
  for (const token of ['capture.paymentRail', 'capture.paymentRailResolved', 'capture.actualMerchant', 'capture.reason']) {
    if (!captureUtil.includes(token)) fail(`utils/android-capture.js must preserve Android capture payment metadata: ${token}.`);
  }

  const settings = await fs.readFile(path.join(root, 'render-settings.js'), 'utf8');
  for (const token of ['Android 알림/문자 수집', '알림 접근 열기', '문자 권한', '지금 반영', 'smsReadPermissionGranted', 'androidFlushResultText', '스캔']) {
    if (!settings.includes(token)) fail(`Settings screen is missing Android capture UI: ${token}.`);
  }
}

async function checkAndroidCaptureTransactionSmoke() {
  const moduleUrl = pathToFileURL(path.join(root, 'utils', 'android-capture.js')).href;
  const {
    transactionFromAndroidCapture,
    parseAndroidCaptureBridgeJsonArray,
  } = await import(moduleUrl);
  const flushModuleUrl = pathToFileURL(path.join(root, 'utils', 'android-flush.js')).href;
  const { flushAndroidCaptureQueue, androidFlushSummary } = await import(flushModuleUrl);
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

  const smsTx = transactionFromAndroidCapture({
    id: 'sms_hana_141000',
    type: 'card_payment',
    amount: 141000,
    merchant: '테스트',
    occurredAt: '2026-07-02T19:55:00+09:00',
    confidence: 0.9,
    source: 'android_local_sms',
    packageName: 'android.provider.Telephony.SMS',
    appLabel: 'SMS',
    raw: '[Web발신] 하나2*0*승인 김*우 141,000원 일시불 07/02 19:55 테스트 누적2,664,049원',
  });
  if (!smsTx) fail('Android SMS capture sample should convert to a transaction payload.');
  if (smsTx.source !== 'android_local_sms' || smsTx.memo !== 'Android 문자 자동 수집') {
    fail(`Android SMS capture transaction must preserve SMS metadata: ${JSON.stringify({ source: smsTx?.source, memo: smsTx?.memo })}`);
  }
  if (smsTx.type !== 'card_payment' || smsTx.amount !== 141000 || smsTx.merchant !== '테스트') {
    fail(`Android SMS capture transaction fields regressed: ${JSON.stringify({ type: smsTx?.type, amount: smsTx?.amount, merchant: smsTx?.merchant })}`);
  }
  const smsDaily = dailyExpenseMap([smsTx]);
  if (smsDaily[2] !== 141000) {
    fail(`Android SMS capture transaction must contribute to the transaction calendar daily amount: ${JSON.stringify(smsDaily)}`);
  }
  const smsCalendarHtml = calendarCells(smsDaily, {}, new Date(2026, 6, 1), new Date(2026, 6, 31), 2);
  if (!smsCalendarHtml.includes('<em>-141,000</em>') || !smsCalendarHtml.includes('cal-day active')) {
    fail('Android SMS capture transaction must render as a visible spending amount in the calendar cell.');
  }

  const bridgeCalls = [];
  const flushResult = await flushAndroidCaptureQueue({
    bridge: {
      listPendingNotificationCaptures: () => JSON.stringify([{
        id: 'sms_hana_141000',
        type: 'card_payment',
        amount: 141000,
        merchant: '테스트',
        occurredAt: '2026-07-02T19:55:00+09:00',
        confidence: 0.9,
        source: 'android_local_sms',
        packageName: 'android.provider.Telephony.SMS',
        appLabel: 'SMS',
        raw: '[Web발신] 하나2*0*승인 김*우 141,000원 일시불 07/02 19:55 테스트 누적2,664,049원',
      }]),
      ackNotificationCapture: (...args) => bridgeCalls.push(['ack', ...args]),
      failNotificationCapture: (...args) => bridgeCalls.push(['fail', ...args]),
      recordCaptureInfo: (...args) => bridgeCalls.push(['info', ...args]),
    },
    currentUser: { uid: 'verify-user' },
    scanRecentSmsCaptures: () => ({ permissionGranted: true, scanned: 1, queued: 1, ignored: 0, failed: 0 }),
    parseAndroidCaptureBridgeJsonArray,
    transactionFromAndroidCapture,
    findSimilarTransaction: async () => null,
    updateTransaction: async () => {
      throw new Error('updateTransaction should not be called for a new SMS capture.');
    },
    saveTransaction: async payload => {
      if (payload.source !== 'android_local_sms' || payload.amount !== 141000 || payload.merchant !== '테스트') {
        throw new Error(`unexpected save payload ${JSON.stringify(payload)}`);
      }
      return 'tx_sms_141000';
    },
    buildNaverPayDuplicateMergePatch: () => null,
  });
  if (flushResult.saved !== 1 || flushResult.failed !== 0 || flushResult.listed !== 1) {
    fail(`Android web flush must save the SMS capture transaction: ${JSON.stringify(flushResult)}`);
  }
  if (!bridgeCalls.some(call => call[0] === 'ack' && call[1] === 'sms_hana_141000' && call[2] === 'tx_sms_141000' && call[3] === 'saved')) {
    fail(`Android web flush must ack saved captures: ${JSON.stringify(bridgeCalls)}`);
  }
  if (!bridgeCalls.some(call => call[0] === 'info' && call[1] === 'web_flush' && String(call[2]).includes('saved=1'))) {
    fail(`Android web flush must record a native diagnostic summary: ${JSON.stringify(bridgeCalls)}`);
  }
  if (!androidFlushSummary(flushResult).includes('smsQueued=1')) {
    fail(`Android flush summary must include SMS scan counts: ${androidFlushSummary(flushResult)}`);
  }
}

async function checkReceiptEnricherSmsGmailMergeSmoke() {
  const moduleUrl = pathToFileURL(path.join(root, 'api', '_lib', 'receipt-enricher.js')).href;
  const { __receiptEnricherTestHooks: hooks } = await import(moduleUrl);
  if (!hooks?.selectAndroidReceiptFallbackRow || !hooks?.transactionCategoryPatch) {
    fail('receipt-enricher must expose SMS/Gmail merge test hooks.');
    return;
  }
  if (!hooks.receiptLinkIds) {
    fail('receipt-enricher must expose receipt link id preservation test hook.');
    return;
  }

  const receipt = {
    source: 'coupang',
    merchant: '쿠팡',
    amount: 141000,
    occurredAt: '2026-07-02T23:40:00+09:00',
    items: [
      { name: '햇반', qty: 2, price: 7000 },
      { name: '물티슈', qty: 1, price: 127000 },
    ],
  };
  const smsRow = {
    id: 'tx_sms_141000',
    data: {
      type: 'card_payment',
      amount: 141000,
      occurredAt: new Date('2026-07-02T19:55:00+09:00'),
      source: 'android_local_sms',
      merchant: '쿠팡',
      body: '[Web발신] 하나2*0*승인 김*우 141,000원 일시불 07/02 19:55 쿠팡 누적2,664,049원',
      memo: 'Android 문자 자동 수집',
    },
  };
  const selected = hooks.selectAndroidReceiptFallbackRow([
    smsRow,
    {
      id: 'tx_gmail_same_amount',
      data: {
        type: 'card_payment',
        amount: 141000,
        occurredAt: new Date('2026-07-02T20:10:00+09:00'),
        source: 'gmail',
        merchant: '쿠팡',
      },
    },
  ], new Date(receipt.occurredAt), receipt);
  if (selected?.id !== smsRow.id) {
    fail(`Gmail receipt fallback should select the existing Android SMS transaction: ${selected?.id || 'none'}`);
  }

  const ambiguous = hooks.selectAndroidReceiptFallbackRow([
    {
      id: 'tx_sms_a',
      data: { type: 'card_payment', amount: 141000, occurredAt: new Date('2026-07-02T18:00:00+09:00'), source: 'android_local_sms' },
    },
    {
      id: 'tx_sms_b',
      data: { type: 'card_payment', amount: 141000, occurredAt: new Date('2026-07-02T19:00:00+09:00'), source: 'android_local_sms' },
    },
  ], new Date(receipt.occurredAt), { ...receipt, source: 'unknown', merchant: null });
  if (ambiguous) {
    fail(`Gmail receipt fallback should avoid ambiguous same-day Android matches: ${ambiguous.id}`);
  }

  const receiptMemo = hooks.buildReceiptMemo(receipt, receipt);
  if (!receiptMemo.includes('[쿠팡 영수증]') || !receiptMemo.includes('햇반 x2 14,000원')) {
    fail(`Receipt memo should summarize itemized Gmail receipt rows: ${receiptMemo}`);
  }
  const mergedMemo = hooks.mergeReceiptMemo('Android 문자 자동 수집', receiptMemo);
  if (!mergedMemo.includes('Android 문자 자동 수집') || !mergedMemo.includes('[쿠팡 영수증]')) {
    fail(`Receipt memo merge should preserve SMS memo and append Gmail items: ${mergedMemo}`);
  }
  if (hooks.mergeReceiptMemo(mergedMemo, receiptMemo) !== mergedMemo) {
    fail('Receipt memo merge should be idempotent for the same Gmail receipt summary.');
  }
  const refreshedMemo = hooks.mergeReceiptMemo('Android 문자 자동 수집\n\n[쿠팡 영수증]\n- 낡은 품목 100원', receiptMemo);
  if (refreshedMemo.includes('낡은 품목') || !refreshedMemo.includes('물티슈 127,000원')) {
    fail(`Receipt memo merge should replace stale receipt sections with refreshed Gmail items: ${refreshedMemo}`);
  }

  const patch = hooks.transactionCategoryPatch(receipt, receipt, {
    memo: 'Android 문자 자동 수집',
    confidence: 0.5,
    source: 'android_local_sms',
  });
  if (patch.memo !== mergedMemo || patch.receiptItemSummary !== receiptMemo || patch.needsReview !== false) {
    fail(`Receipt transaction patch should merge Gmail item summary into the SMS transaction: ${JSON.stringify(patch)}`);
  }
  if (patch.category !== '생활비용' || patch.subcategory !== '생활용품' || patch.autoCategorySource !== 'gmail_receipt_items') {
    fail(`Receipt transaction patch should keep Coupang item classification: ${JSON.stringify(patch)}`);
  }

  const legacyLink = hooks.receiptLinkIds('receipt_new', { receiptId: 'receipt_legacy' });
  if (legacyLink.receiptId || legacyLink.arrayUnionIds.join('|') !== 'receipt_legacy|receipt_new') {
    fail(`Receipt link patch should preserve legacy receiptId-only links when adding receiptIds: ${JSON.stringify(legacyLink)}`);
  }
  const existingLink = hooks.receiptLinkIds('receipt_new', { receiptId: 'receipt_legacy', receiptIds: ['receipt_legacy', 'receipt_new'] });
  if (existingLink.receiptId || existingLink.arrayUnionIds.length) {
    fail(`Receipt link patch should be idempotent when both receipt links already exist: ${JSON.stringify(existingLink)}`);
  }
}

function androidLayoutAttr(source, id, attr) {
  const idToken = `android:id="@+id/${id}"`;
  const idIndex = source.indexOf(idToken);
  if (idIndex < 0) return '';
  const tagStart = source.lastIndexOf('<', idIndex);
  const tagEnd = source.indexOf('>', idIndex);
  if (tagStart < 0 || tagEnd < 0) return '';
  const tag = source.slice(tagStart, tagEnd + 1);
  const match = tag.match(new RegExp(`android:${attr}="([^\\"]+)"`));
  return match ? match[1] : '';
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
  if (shouldSkipApkArtifactChecks()) return;
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

function shouldSkipApkArtifactChecks() {
  return process.env.CI === 'true' && process.env.GITHUB_WORKFLOW === 'Validate';
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

async function checkRewardSavingsTriplePointSmoke() {
  const moduleUrl = pathToFileURL(path.join(root, 'utils', 'reward-savings.js')).href;
  const { buildRewardSavingsSummary } = await import(moduleUrl);
  const now = new Date(2026, 6, 3, 12, 0, 0, 0);
  const transactions = [];
  for (let i = 1; i <= 30; i += 1) {
    const occurredAt = new Date(now);
    occurredAt.setDate(now.getDate() - i);
    transactions.push({
      type: 'card_payment',
      category: '생활',
      amount: 10000,
      occurredAt,
    });
  }
  transactions.push({
    type: 'card_payment',
    category: '생활',
    amount: 2000,
    occurredAt: now,
  });

  const summary = buildRewardSavingsSummary({
    transactions,
    now,
    lookbackDays: 30,
    baselineMethod: 'simple_daily',
    pointRates: {
      winePurchase: 0.1,
      premiumIngredients: 0.2,
      travelFund: 0.05,
    },
  });
  const buckets = Object.fromEntries((summary.pointBuckets || []).map(bucket => [bucket.key, bucket]));
  for (const key of ['winePurchase', 'premiumIngredients', 'travelFund']) {
    if (!buckets[key]) fail(`Reward savings summary is missing point bucket: ${key}.`);
  }
  if (summary.monthPointCap !== undefined || summary.dailyPointCap !== undefined) {
    fail('Reward savings summary must not expose point caps after triple point migration.');
  }
  if (buckets.winePurchase?.todayPoints !== 800 || buckets.premiumIngredients?.todayPoints !== 1600 || buckets.travelFund?.todayPoints !== 400) {
    fail(`Reward point bucket today values are wrong: ${JSON.stringify(summary.pointBuckets)}`);
  }
  if (buckets.winePurchase?.targetAmount !== 120000 || buckets.premiumIngredients?.targetAmount !== 80000 || buckets.travelFund?.targetAmount !== 200000) {
    fail(`Reward point bucket target amounts are wrong: ${JSON.stringify(summary.pointBuckets)}`);
  }
  if (buckets.winePurchase?.projectedMonthPoints !== 24800 || buckets.premiumIngredients?.projectedMonthPoints !== 49600 || buckets.travelFund?.projectedMonthPoints !== 12400) {
    fail(`Reward point projected month values must use today's pace: ${JSON.stringify(summary.pointBuckets)}`);
  }

  const settlementNow = new Date(2026, 6, 1, 12, 0, 0, 0);
  const settlementTransactions = [];
  for (let i = 1; i <= 30; i += 1) {
    settlementTransactions.push({
      type: 'card_payment',
      category: '생활',
      amount: 25358,
      occurredAt: new Date(2026, 5, i, 12, 0, 0, 0),
    });
  }
  settlementTransactions.push(
    {
      type: 'card_payment',
      category: '와인구매',
      amount: 50000,
      occurredAt: settlementNow,
      rewardPointEntry: {
        pointItemId: 'winePurchase',
        pointItemLabel: '와인구매 포인트',
        direction: 'spend',
        amount: 50000,
      },
    }
  );
  const settlementSummary = buildRewardSavingsSummary({
    transactions: settlementTransactions,
    now: settlementNow,
    lookbackDays: 30,
    baselineMethod: 'simple_daily',
    categoryNames: ['생활'],
    pointItems: [
      { id: 'winePurchase', label: '와인구매 포인트', rate: 1, targetAmount: 120000, enabled: true, order: 10 },
    ],
  });
  const settlementBucket = settlementSummary.pointBuckets?.find(bucket => bucket.key === 'winePurchase');
  if (
    settlementSummary.todaySpend !== 0
    || settlementBucket?.earnedMonthPoints !== 25358
    || settlementBucket?.spentMonthPoints !== 50000
    || settlementBucket?.monthPoints !== -24642
  ) {
    fail(`Reward point settlement must preserve negative monthly balance: ${JSON.stringify({ summary: settlementSummary, bucket: settlementBucket })}`);
  }
  const includedSettlementSummary = buildRewardSavingsSummary({
    transactions: settlementTransactions.map(tx => tx.rewardPointEntry ? { ...tx, category: '생활' } : tx),
    now: settlementNow,
    lookbackDays: 30,
    baselineMethod: 'simple_daily',
    categoryNames: ['생활'],
    pointItems: [
      { id: 'winePurchase', label: '와인구매 포인트', rate: 1, targetAmount: 120000, enabled: true, order: 10 },
    ],
  });
  if (includedSettlementSummary.todaySpend !== 50000) {
    fail(`Reward point settlement metadata must not override existing category spend rules: ${JSON.stringify(includedSettlementSummary)}`);
  }
  const orphanSettlementSummary = buildRewardSavingsSummary({
    transactions: [
      ...settlementTransactions.filter(tx => !tx.rewardPointEntry),
      {
        type: 'card_payment',
        category: '와인구매',
        amount: 1000,
        occurredAt: settlementNow,
        rewardPointEntry: {
          pointItemId: 'retiredPoint',
          pointItemLabel: '삭제된 포인트',
          direction: 'spend',
          amount: 1000,
        },
      },
    ],
    now: settlementNow,
    lookbackDays: 30,
    baselineMethod: 'simple_daily',
    categoryNames: ['생활'],
    pointItems: [
      { id: 'winePurchase', label: '와인구매 포인트', rate: 1, targetAmount: 120000, enabled: true, order: 10 },
    ],
  });
  const orphanBucket = orphanSettlementSummary.pointBuckets?.find(bucket => bucket.key === 'retiredPoint');
  if (orphanBucket?.label !== '삭제된 포인트' || orphanBucket?.spentMonthPoints !== 1000 || orphanBucket?.monthPoints !== -1000 || orphanBucket?.settlementOnly !== true) {
    fail(`Reward point settlement must keep deleted point item fallback rows: ${JSON.stringify(orphanSettlementSummary.pointBuckets)}`);
  }

  const focusedSummary = buildRewardSavingsSummary({
    transactions,
    now,
    lookbackDays: 30,
    baselineMethod: 'simple_daily',
    pointRates: {
      winePurchase: 0.1,
      premiumIngredients: 0.2,
      travelFund: 0.05,
    },
    dailyReward: {
      enabled: true,
      selectedDateKey: '2026-07-03',
      selectedRuleId: 'focusPoint',
      focusBucketKey: 'premiumIngredients',
      bonusRate: 0.1,
      bonusCap: 5000,
      freezeCount: 1,
      streakDays: 5,
      tierLabel: '실버 2단계',
    },
  });
  const focusedBuckets = Object.fromEntries((focusedSummary.pointBuckets || []).map(bucket => [bucket.key, bucket]));
  if (focusedSummary.ruleBonusPoints !== 800 || focusedSummary.dailyReward?.status !== 'selected') {
    fail(`Daily reward focus rule summary is wrong: ${JSON.stringify(focusedSummary.dailyReward)}`);
  }
  if (focusedBuckets.premiumIngredients?.todayBasePoints !== 1600 || focusedBuckets.premiumIngredients?.todayBonusPoints !== 800 || focusedBuckets.premiumIngredients?.todayPoints !== 2400) {
    fail(`Daily reward focus bucket bonus is wrong: ${JSON.stringify(focusedBuckets.premiumIngredients)}`);
  }

  const settingsText = await fs.readFile(path.join(root, 'render-settings.js'), 'utf8');
  for (const token of ['와인구매 포인트', '고급재료 포인트', '여행충당 포인트', 'pointRate:', 'pointLabel:', 'pointTarget:', 'dailyRewardEnabled', 'dailyRewardBonusCap', '쉬어가기권', 'data-reward-point-action="add"', 'data-reward-point-action="delete"', 'targetAmount: 120000', 'targetAmount: 80000', 'targetAmount: 200000']) {
    if (!settingsText.includes(token)) fail(`Reward settings screen is missing triple point token: ${token}.`);
  }
  for (const token of ['포인트 정산 내역', '+ 신규내역', 'data-reward-entry-action="add"', 'data-reward-entry-action="edit"', 'rewardEntryRows', 'openRewardPointEntryCreate']) {
    if (!settingsText.includes(token)) fail(`Reward settings screen is missing reward point entry CRUD token: ${token}.`);
  }
  for (const token of ['월 상한', '일 상한', 'monthPointCap', 'dailyPointCap']) {
    if (settingsText.includes(token)) fail(`Reward settings screen must not expose point cap token: ${token}.`);
  }

  const reportText = await fs.readFile(path.join(root, 'render-report.js'), 'utf8');
  if (!reportText.includes('data-report-view-mode')) fail('Home/report mode buttons must use root-scoped data-report-view-mode.');
  if (reportText.includes('onclick="window.reportViewMode')) fail('Home/report mode buttons must not use the global reportViewMode inline handler.');
  if (reportText.includes('monthPointCap') || reportText.includes('dailyPointCap')) {
    fail('Reward report card must not render point caps.');
  }
  for (const token of ['home-reward-point-progress', 'targetAmount', '기준액 대비', 'data-reward-daily-focus', '오늘 카드', '쉬어가기권', '연속 적립']) {
    if (!reportText.includes(token)) fail(`Reward report card is missing point goal token: ${token}.`);
  }
  for (const token of ['overdrawn', 'formatPointBalance', 'spentMonthPoints', 'earnedMonthPoints', '적립 +', '잔액 ']) {
    if (!reportText.includes(token)) fail(`Reward report card is missing point settlement token: ${token}.`);
  }

  for (const token of [
    'home-widget-row-shell',
    'home-widget-fill',
    'home-widget-value',
    'home-widget-gauge-row',
    'rewardPointMark',
    'homeWidgetCategoryMark',
  ]) {
    if (!reportText.includes(token)) fail(`Reward report card is missing home widget graph token: ${token}.`);
  }

  const designText = await fs.readFile(path.join(root, 'docs', 'design-system.md'), 'utf8');
  for (const token of ['목록형 위젯 그래프', 'row shell', 'var(--grad-bar)', '2x2', '4x2']) {
    if (!designText.includes(token)) fail(`docs/design-system.md missing home widget graph design token: ${token}.`);
  }

  const styleText = await fs.readFile(path.join(root, 'style.css'), 'utf8');
  if (!styleText.includes(`styles/60-urge.css?v=${REWARD_ENTRY_CRUD_VERSION}`)) {
    fail('style.css must cache-bust styles/60-urge.css for the home widget graph redesign');
  }

  const urgeCss = await fs.readFile(path.join(root, 'styles', '60-urge.css'), 'utf8');
  for (const token of [
    '.home-widget-row-shell',
    '.home-widget-fill',
    '.home-widget-mark',
    '.home-widget-row-meta',
    '.home-widget-gauge-row',
  ]) {
    if (!urgeCss.includes(token)) fail(`styles/60-urge.css missing home widget graph selector: ${token}`);
  }
  if (!urgeCss.includes('.home-reward-point-row.overdrawn')) {
    fail('styles/60-urge.css must style overdrawn reward point rows.');
  }
  for (const token of ['.reward-entry-editor', '.reward-entry-row', '.reward-entry-empty']) {
    if (!urgeCss.includes(token)) fail(`styles/60-urge.css missing reward point entry CRUD selector: ${token}`);
  }
  const modalText = await fs.readFile(path.join(root, 'modals', 'tx-edit-modal.js'), 'utf8');
  for (const token of ['포인트 정산', 'rewardPointEnabled', 'rewardPointItemId', 'rewardPointAmount', 'readRewardPointEntryForm', 'tx-point-panel']) {
    if (!modalText.includes(token)) fail(`tx-edit-modal.js is missing reward point settlement token: ${token}.`);
  }
  for (const token of ['openTxAddModal(options = {})', 'resolveInitialRewardPointEntry', 'forceRewardPointEnabled']) {
    if (!modalText.includes(token)) fail(`tx-edit-modal.js is missing reward point entry add-mode token: ${token}.`);
  }
}

async function checkRewardWidgetBridgeContracts() {
  const bridgeText = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'BudgetAndroidBridge.java'), 'utf8');
  for (const token of [
    'updateRewardWidgetSnapshot',
    'getRewardWidgetSnapshotJson',
    'RewardWidgetStore.saveSnapshot',
    'RewardWidgetStore.snapshotJson',
  ]) {
    if (!bridgeText.includes(token)) fail(`BudgetAndroidBridge is missing reward widget bridge token: ${token}.`);
  }

  const storeText = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'RewardWidgetStore.java'), 'utf8');
  for (const token of ['SharedPreferences', 'budget_reward_widget_store', 'reward_snapshot', 'schemaVersion', 'pointBuckets']) {
    if (!storeText.includes(token)) fail(`RewardWidgetStore is missing snapshot storage token: ${token}.`);
  }
  if (!storeText.includes('MAX_WIDGET_POINT_BUCKETS = 4')) {
    fail('RewardWidgetStore must preserve four reward widget point buckets for custom point items.');
  }
  for (const token of ['HttpURLConnection', 'URLConnection', 'FIREBASE_SERVICE_ACCOUNT', 'GEMINI_API_KEY', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']) {
    if (storeText.includes(token)) fail(`RewardWidgetStore must not introduce network or secret token: ${token}.`);
  }

  const reportText = await fs.readFile(path.join(root, 'render-report.js'), 'utf8');
  for (const token of [
    'buildRewardWidgetSnapshot',
    'publishRewardWidgetSnapshot',
    'refreshRewardWidgetSnapshot',
    'updateRewardWidgetSnapshot',
    'JSON.stringify(buildRewardWidgetSnapshot(summary))',
  ]) {
    if (!reportText.includes(token)) fail(`render-report.js is missing reward widget publish token: ${token}.`);
  }
  if (!reportText.includes(`utils/reward-savings.js?v=${REWARD_WIDGET_CACHE_VERSION}`)) {
    fail(`render-report.js must cache-bust reward savings utility with ${REWARD_WIDGET_CACHE_VERSION}.`);
  }

  const appText = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  for (const token of [
    `render-home.js?v=${REWARD_WIDGET_CACHE_VERSION}`,
    `render-report.js?v=${REWARD_WIDGET_CACHE_VERSION}`,
  ]) {
    if (!appText.includes(token)) fail(`app.js must cache-bust Android reward widget bridge module: ${token}.`);
  }
  if (!appText.includes(`render-settings.js?v=${REWARD_ENTRY_CRUD_VERSION}`)) {
    fail(`app.js must cache-bust reward settings entry CRUD module with ${REWARD_ENTRY_CRUD_VERSION}.`);
  }
  const homeText = await fs.readFile(path.join(root, 'render-home.js'), 'utf8');
  if (!homeText.includes(`render-report.js?v=${REWARD_WIDGET_CACHE_VERSION}`)) {
    fail(`render-home.js must cache-bust the home report renderer with ${REWARD_WIDGET_CACHE_VERSION}.`);
  }
  const indexText = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  if (!indexText.includes(`app.js?v=${REWARD_WIDGET_CACHE_VERSION}`)) {
    fail('index.html must cache-bust app.js for the reward widget bridge.');
  }
  if (!indexText.includes(`entry=${REWARD_ENTRY_CRUD_VERSION}`)) {
    fail(`index.html must cache-bust reward entry CRUD assets with ${REWARD_ENTRY_CRUD_VERSION}.`);
  }
  const settingsText = await fs.readFile(path.join(root, 'render-settings.js'), 'utf8');
  if (!settingsText.includes(`render-report.js?v=${REWARD_WIDGET_CACHE_VERSION}`)) {
    fail(`render-settings.js must import the reward widget refresher with ${REWARD_WIDGET_CACHE_VERSION}.`);
  }
  if (!settingsText.includes('refreshRewardWidgetSnapshot')) {
    fail('Reward settings save must refresh the Android reward widget snapshot after point item changes.');
  }

  const moduleUrl = pathToFileURL(path.join(root, 'utils', 'reward-savings.js')).href;
  const { buildRewardWidgetSnapshot } = await import(moduleUrl);
  const rewardSavingsText = await fs.readFile(path.join(root, 'utils', 'reward-savings.js'), 'utf8');
  if (!rewardSavingsText.includes('WIDGET_POINT_BUCKET_LIMIT = 4')) {
    fail('buildRewardWidgetSnapshot must preserve four point buckets for the Android widget.');
  }
  const snapshot = buildRewardWidgetSnapshot({
    baselineReady: true,
    todaySaved: 8000,
    todaySpend: 2000,
    dailyBaseline: 10000,
    ruleBonusPoints: 800,
    dailyReward: {
      status: 'selected',
      label: '고급재료 집중',
      focusBucketKey: 'premiumIngredients',
      nextStepText: '피노 누아까지 45,600P',
      freezeText: '쉬어가기권 1장',
    },
    pointBuckets: [
      { key: 'winePurchase', label: '와인구매 포인트', rate: 0.1, todayPoints: 800, monthPoints: 2400, projectedMonthPoints: 8000 },
      { key: 'premiumIngredients', label: '고급재료 포인트', rate: 0.2, todayPoints: 2400, todayBasePoints: 1600, todayBonusPoints: 800, monthPoints: 5600, projectedMonthPoints: 16800 },
      { key: 'travelFund', label: '여행충당 포인트', rate: 0.05, todayPoints: 400, monthPoints: 1200, projectedMonthPoints: 4000 },
      { key: 'gadgetFund', label: '전자기기 포인트', rate: 0.15, todayPoints: 1200, monthPoints: 3600, projectedMonthPoints: 12000 },
    ],
  }, new Date(Date.UTC(2026, 6, 3, 0, 0, 0)));
  if (snapshot.schemaVersion !== 2 || snapshot.updatedAt !== '2026-07-03T00:00:00.000Z') {
    fail(`Reward widget snapshot metadata is wrong: ${JSON.stringify(snapshot)}`);
  }
  if (snapshot.todaySaved !== 8000 || snapshot.todaySpend !== 2000 || snapshot.dailyBaseline !== 10000) {
    fail(`Reward widget snapshot totals are wrong: ${JSON.stringify(snapshot)}`);
  }
  const buckets = Object.fromEntries((snapshot.pointBuckets || []).map(bucket => [bucket.key, bucket]));
  if (
    Object.keys(buckets).length !== 4
    || buckets.winePurchase?.todayPoints !== 800
    || buckets.premiumIngredients?.todayBonusPoints !== 800
    || buckets.premiumIngredients?.monthPoints !== 5600
    || buckets.travelFund?.projectedMonthPoints !== 4000
    || buckets.gadgetFund?.label !== '전자기기 포인트'
    || buckets.gadgetFund?.projectedMonthPoints !== 12000
  ) {
    fail(`Reward widget snapshot buckets are wrong: ${JSON.stringify(snapshot.pointBuckets)}`);
  }
  const negativeSnapshot = buildRewardWidgetSnapshot({
    baselineReady: true,
    pointBuckets: [
      {
        key: 'winePurchase',
        label: '와인구매 포인트',
        rate: 1,
        targetAmount: 120000,
        todayPoints: 0,
        earnedMonthPoints: 25358,
        spentMonthPoints: 50000,
        monthPoints: -24642,
        projectedMonthPoints: 0,
      },
    ],
  });
  if (negativeSnapshot.pointBuckets?.[0]?.monthPoints !== -24642 || negativeSnapshot.pointBuckets?.[0]?.spentMonthPoints !== 50000) {
    fail(`Reward widget snapshot must preserve signed point balances: ${JSON.stringify(negativeSnapshot.pointBuckets)}`);
  }
  if (snapshot.dailyReward?.label !== '고급재료 집중' || snapshot.dailyReward?.freezeText !== '쉬어가기권 1장') {
    fail(`Reward widget snapshot daily reward is wrong: ${JSON.stringify(snapshot.dailyReward)}`);
  }

  const apkVersion = JSON.parse(await fs.readFile(path.join(root, 'android', 'apk-version.json'), 'utf8'));
  if (Number(apkVersion.versionCode) < 20) {
    fail(`Android APK version must be bumped for reward widget bridge: ${JSON.stringify(apkVersion)}`);
  }
  if (apkVersion.cacheBust !== ANDROID_APK_CACHE_VERSION) {
    fail(`Android APK cacheBust must use ${ANDROID_APK_CACHE_VERSION}: ${JSON.stringify(apkVersion)}`);
  }
  if (!settingsText.includes(`v${apkVersion.versionName} · Android APK`)) {
    fail(`Settings screen must display current Android APK versionName: ${apkVersion.versionName}.`);
  }
}

async function checkRewardWidgetProviderContracts() {
  const manifestText = await fs.readFile(path.join(root, 'android', 'AndroidManifest.xml'), 'utf8');
  for (const token of ['.RewardWidgetProvider', 'android.appwidget.action.APPWIDGET_UPDATE', '@xml/reward_widget_info', '@string/reward_widget_name']) {
    if (!manifestText.includes(token)) fail(`AndroidManifest is missing reward widget provider token: ${token}.`);
  }

  const providerText = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'RewardWidgetProvider.java'), 'utf8');
  for (const token of ['extends AppWidgetProvider', 'RemoteViews', 'R.layout.reward_widget', 'RewardWidgetStore.snapshotJson', 'monthPoints', 'targetAmount', 'setProgressBar', 'progressPercent', 'pointProgressLabel', '"p/"', 'todayBonusPoints', 'dailyReward', 'focusBucketKey', 'winePurchase', 'premiumIngredients', 'travelFund', 'reward_widget_custom', 'markForLabel', 'bucket.optString("label"']) {
    if (!providerText.includes(token)) fail(`RewardWidgetProvider is missing widget render token: ${token}.`);
  }
  for (const token of ['HttpURLConnection', 'URLConnection', 'FIREBASE_SERVICE_ACCOUNT', 'GEMINI_API_KEY', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN']) {
    if (providerText.includes(token)) fail(`RewardWidgetProvider must not introduce network or secret token: ${token}.`);
  }

  const storeText = await fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'RewardWidgetStore.java'), 'utf8');
  if (!storeText.includes('RewardWidgetProvider.updateAll(context)')) {
    fail('RewardWidgetStore must refresh widgets after saving a snapshot.');
  }

  const widgetInfoText = await fs.readFile(path.join(root, 'android', 'res', 'xml', 'reward_widget_info.xml'), 'utf8');
  for (const token of ['@layout/reward_widget', 'home_screen', 'updatePeriodMillis', 'resizeMode', 'previewLayout', '@drawable/reward_widget_preview']) {
    if (!widgetInfoText.includes(token)) fail(`reward_widget_info.xml is missing token: ${token}.`);
  }
  for (const token of ['android:minHeight="180dp"', 'android:minResizeHeight="160dp"']) {
    if (!widgetInfoText.includes(token)) {
      fail(`reward_widget_info.xml must reserve four-row widget height with ${token}.`);
    }
  }
  if (widgetInfoText.includes('@drawable/ic_launcher')) {
    fail('reward_widget_info.xml must not use the app launcher icon as the widget preview.');
  }

  const layoutText = await fs.readFile(path.join(root, 'android', 'res', 'layout', 'reward_widget.xml'), 'utf8');
  for (const token of [
    'reward_widget_root',
    'reward_widget_rows',
    'reward_widget_saved',
    'reward_widget_wine',
    'reward_widget_wine_value',
    'reward_widget_wine_progress',
    'reward_widget_ingredient',
    'reward_widget_ingredient_value',
    'reward_widget_ingredient_progress',
    'reward_widget_travel',
    'reward_widget_travel_value',
    'reward_widget_travel_progress',
    'reward_widget_custom',
    'reward_widget_custom_value',
    'reward_widget_custom_progress',
    '24dp',
    '20dp',
    '10sp',
    'textAlignment="viewEnd"',
    '@drawable/reward_widget_row_background',
    '@drawable/reward_widget_mark_background',
    '@drawable/reward_widget_progress',
  ]) {
    if (!layoutText.includes(token)) fail(`reward_widget.xml is missing token: ${token}.`);
  }

  const rowContracts = [
    ['reward_widget_wine_row', '24dp'],
    ['reward_widget_ingredient_row', '24dp'],
    ['reward_widget_travel_row', '24dp'],
    ['reward_widget_custom_row', '24dp'],
  ];
  for (const [id, expectedHeight] of rowContracts) {
    const actualHeight = androidLayoutAttr(layoutText, id, 'layout_height');
    if (actualHeight !== expectedHeight) {
      fail(`${id} must use 1.5x point-bar height ${expectedHeight}; found ${actualHeight || 'missing'}.`);
    }
  }
  const markContracts = [
    'reward_widget_wine_mark',
    'reward_widget_ingredient_mark',
    'reward_widget_travel_mark',
    'reward_widget_custom_mark',
  ];
  for (const id of markContracts) {
    const actualWidth = androidLayoutAttr(layoutText, id, 'layout_width');
    const actualHeight = androidLayoutAttr(layoutText, id, 'layout_height');
    if (actualWidth !== '20dp' || actualHeight !== '20dp') {
      fail(`${id} must use 1.5x mark size 20dp x 20dp; found ${actualWidth || 'missing'} x ${actualHeight || 'missing'}.`);
    }
  }
  const progressContracts = [
    'reward_widget_wine_progress',
    'reward_widget_ingredient_progress',
    'reward_widget_travel_progress',
    'reward_widget_custom_progress',
  ];
  for (const id of progressContracts) {
    const actualMinHeight = androidLayoutAttr(layoutText, id, 'minHeight');
    const actualMaxHeight = androidLayoutAttr(layoutText, id, 'maxHeight');
    if (actualMinHeight !== '24dp' || actualMaxHeight !== '24dp') {
      fail(`${id} must force 1.5x point-bar drawable thickness with minHeight/maxHeight 24dp; found ${actualMinHeight || 'missing'} / ${actualMaxHeight || 'missing'}.`);
    }
  }
  const widgetDrawableContracts = [
    ['reward_widget_row_background.xml', '#1f2937'],
    ['reward_widget_mark_background.xml', '#f8fafc'],
    ['reward_widget_progress.xml', '#8b7cff'],
    ['reward_widget_preview.xml', '#111827'],
  ];
  for (const [file, token] of widgetDrawableContracts) {
    const text = await fs.readFile(path.join(root, 'android', 'res', 'drawable', file), 'utf8');
    if (!text.includes(token)) {
      fail(`${file} must preserve widget drawable token: ${token}`);
    }
  }

  const progressDrawableText = await fs.readFile(path.join(root, 'android', 'res', 'drawable', 'reward_widget_progress.xml'), 'utf8');
  const progressDrawableSizeCount = (progressDrawableText.match(/android:height="24dp"/g) || []).length;
  if (progressDrawableSizeCount < 2) {
    fail(`reward_widget_progress.xml must declare 24dp size for both background and progress drawables; found ${progressDrawableSizeCount}.`);
  }
  const apkVersion = JSON.parse(await fs.readFile(path.join(root, 'android', 'apk-version.json'), 'utf8'));
  if (Number(apkVersion.versionCode) < 20) {
    fail(`Android APK version must be bumped for the list-style reward widget: ${JSON.stringify(apkVersion)}`);
  }

  const stringsText = await fs.readFile(path.join(root, 'android', 'res', 'values', 'strings.xml'), 'utf8');
  for (const token of ['reward_widget_name', 'reward_widget_description']) {
    if (!stringsText.includes(token)) fail(`strings.xml is missing reward widget string: ${token}.`);
  }
  if (stringsText.includes('세 포인트')) {
    fail('reward_widget_description must not say the widget only shows three point items.');
  }
}

async function checkTelegramNewsfeedContracts() {
  const indexText = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  for (const token of ['id="tab-newsfeed"', 'data-tab="newsfeed"', 'data-public-tab="newsfeed"', `news=${CANONICAL_NEWSFEED_VERSION}`, `app.js?v=${CANONICAL_APP_ENTRY_VERSION}`]) {
    if (!indexText.includes(token)) fail(`index.html is missing Telegram newsfeed token: ${token}`);
  }

  const appText = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  for (const token of [`render-newsfeed.js?v=${CANONICAL_NEWSFEED_VERSION}`, 'newsfeed: renderNewsfeed', "newsfeed: '뉴스피드'", 'PUBLIC_TABS', 'showPublicTab', "'newsfeed'"]) {
    if (!appText.includes(token)) fail(`app.js is missing Telegram newsfeed token: ${token}`);
  }

  const dataText = await fs.readFile(path.join(root, 'data.js'), 'utf8');
  for (const token of ['listNewsfeedItems', 'getTelegramPublicFeedStatus', 'getNewsfeedDigestSnapshot', 'STATIC_NEWSFEED_URL', "'newsfeed_items'", "'telegram_public_feed'", 'nextCursor', 'hasMore', 'newsfeedPageResult', 'shouldFallbackToStaticNewsfeed', 'hasNewsfeedItems', 'itemCount: Array.isArray(snapshot.items)', 'snapshotTotal']) {
    if (!dataText.includes(token)) fail(`data.js is missing Telegram newsfeed data boundary token: ${token}`);
  }
  for (const token of ['STATIC_NEWSFEED_CACHE_MS', 'refreshStatic', 'cacheFresh']) {
    if (!dataText.includes(token)) fail(`data.js is missing Telegram newsfeed refresh token: ${token}`);
  }

  const renderText = await fs.readFile(path.join(root, 'render-newsfeed.js'), 'utf8');
  for (const token of ['listNewsfeedItems', 'getTelegramPublicFeedStatus', 'getNewsfeedDigestSnapshot', 'TELEGRAM_PUBLIC_SOURCES', 'data-newsfeed-action="refresh"', 'data-newsfeed-action="load-more"', 'data-newsfeed-action="digest-menu"', 'data-newsfeed-digest', 'document_body_ingested=false', 'body=not_ingested', 'newsfeed-filter-chip', 'newsfeed-load-more', 'target="_blank"']) {
    if (!renderText.includes(token)) fail(`render-newsfeed.js is missing Telegram newsfeed UI token: ${token}`);
  }
  for (const token of ['NEWSFEED_REFRESH_MS', 'refreshNewsfeedIfActive', "window.getCurrentTab?.() !== 'newsfeed'"]) {
    if (!renderText.includes(token)) fail(`render-newsfeed.js is missing Telegram newsfeed auto-refresh token: ${token}`);
  }

  const styleText = await fs.readFile(path.join(root, 'style.css'), 'utf8');
  if (!styleText.includes(`styles/80-newsfeed.css?v=${CANONICAL_NEWSFEED_VERSION}`)) {
    fail('style.css must cache-bust styles/80-newsfeed.css for Telegram newsfeed.');
  }
  const newsfeedCss = await fs.readFile(path.join(root, 'styles', '80-newsfeed.css'), 'utf8');
  for (const token of ['.newsfeed-hero', '.newsfeed-digest-btn', '.newsfeed-digest-menu', '.newsfeed-filter-chip', '.newsfeed-card', '.newsfeed-text', '.newsfeed-load-more', '@media (max-width: 340px)']) {
    if (!newsfeedCss.includes(token)) fail(`styles/80-newsfeed.css is missing selector: ${token}`);
  }

  const buildPagesText = await fs.readFile(path.join(root, 'scripts', 'build-pages.mjs'), 'utf8');
  if (!buildPagesText.includes("'render-newsfeed.js'")) fail('scripts/build-pages.mjs must copy render-newsfeed.js to Pages.');

  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (!String(packageJson.scripts?.['telegram:sync'] || '').includes('scripts/telegram-feed-sync.mjs')) {
    fail('package.json telegram:sync must run scripts/telegram-feed-sync.mjs.');
  }
  if (!String(packageJson.scripts?.['telegram:static'] || '').includes('scripts/telegram-feed-static.mjs')) {
    fail('package.json telegram:static must run scripts/telegram-feed-static.mjs.');
  }

  const workflowText = await fs.readFile(path.join(root, '.github', 'workflows', 'budget-backend.yml'), 'utf8');
  for (const token of ['telegram_public_feed', '*/15 * * * *', 'mode == \'telegram\'', 'TELEGRAM_PUBLIC_MAX_PER_SOURCE', 'continue-on-error: true', 'actions: write', 'node scripts/telegram-feed-sync.mjs', 'node scripts/telegram-feed-static.mjs', 'public/newsfeed/telegram-public-feed.json', 'gh workflow run pages.yml --ref main']) {
    if (!workflowText.includes(token)) fail(`budget-backend.yml is missing Telegram public feed token: ${token}`);
  }

  for (const token of ['TELEGRAM_PUBLIC_SINCE', 'TELEGRAM_PUBLIC_MAX_PAGES', 'TELEGRAM_STATIC_ITEM_LIMIT']) {
    if (!workflowText.includes(token)) fail(`budget-backend.yml is missing Telegram backfill token: ${token}`);
  }
  if (workflowText.includes('TELEGRAM_STATIC_MAX_ITEMS: "240"')) {
    fail('budget-backend.yml must not cap the Telegram static snapshot at 240 items.');
  }

  const publicFeedText = await fs.readFile(path.join(root, 'api', '_lib', 'telegram-public-feed.js'), 'utf8');
  for (const token of ['syncTelegramPublicFeed', 'fetchTelegramPublicSource', 'parseTelegramPublicPreviewHtml', 'telegramPublicPermalink', 'newsfeed_items']) {
    if (!publicFeedText.includes(token)) fail(`telegram-public-feed.js is missing token: ${token}`);
  }
  for (const token of ['telegramPublicSourcePageUrl', 'maxPages', 'backfillComplete']) {
    if (!publicFeedText.includes(token)) fail(`telegram-public-feed.js is missing backfill token: ${token}`);
  }
  const staticScriptText = await fs.readFile(path.join(root, 'scripts', 'telegram-feed-static.mjs'), 'utf8');
  for (const token of ['writeStaticTelegramFeed', 'fetchTelegramPublicSource', 'normalizeTelegramFeedItem', 'telegram-public-feed.json']) {
    if (!staticScriptText.includes(token)) fail(`telegram-feed-static.mjs is missing token: ${token}`);
  }
  for (const token of ['DEFAULT_SINCE', 'itemLimit', 'truncated', 'pagesFetched']) {
    if (!staticScriptText.includes(token)) fail(`telegram-feed-static.mjs is missing static stack token: ${token}`);
  }
  const staticFeed = JSON.parse(await fs.readFile(path.join(root, 'public', 'newsfeed', 'telegram-public-feed.json'), 'utf8'));
  if (staticFeed.sourceVersion !== CANONICAL_TELEGRAM_SOURCE_VERSION || !Array.isArray(staticFeed.items)) {
    fail('public/newsfeed/telegram-public-feed.json must be a valid Telegram static snapshot.');
  }
  if (staticFeed.sourceCount !== 71 || staticFeed.items.length < 1) {
    fail('public/newsfeed/telegram-public-feed.json must contain the generated Telegram static feed, not an empty placeholder.');
  }
  if (staticFeed.maxItems === 240) {
    fail('public/newsfeed/telegram-public-feed.json must not be limited by the retired 240-item maxItems cap.');
  }
  for (const forbidden of ['TELEGRAM_BOT_TOKEN', 'api_id', 'api_hash', 'sessionString', 'localStorage']) {
    if (publicFeedText.includes(forbidden) || renderText.includes(forbidden)) {
      fail(`Telegram newsfeed must not use secret/session token: ${forbidden}`);
    }
  }

  const sourcesModule = await import(pathToFileURL(path.join(root, 'utils', 'telegram-sources.js')).href);
  if (sourcesModule.TELEGRAM_PUBLIC_SOURCE_VERSION !== CANONICAL_TELEGRAM_SOURCE_VERSION) {
    fail(`Telegram public source version mismatch: ${sourcesModule.TELEGRAM_PUBLIC_SOURCE_VERSION}`);
  }
  if (!Array.isArray(sourcesModule.TELEGRAM_PUBLIC_SOURCES) || sourcesModule.TELEGRAM_PUBLIC_SOURCES.length !== 71) {
    fail(`Telegram public source list must contain 71 confirmed public-preview sources, found ${sourcesModule.TELEGRAM_PUBLIC_SOURCES?.length || 0}.`);
  }
}

async function checkTxDetailCompactRefundContracts() {
  const modalText = await fs.readFile(path.join(root, 'modals', 'tx-edit-modal.js'), 'utf8');
  for (const token of [
    'class="tx-refund-check"',
    '<span>환급예정</span>',
    'class="tx-refund-help"',
    'data-tooltip="${escAttr(helpText)}"',
  ]) {
    if (!modalText.includes(token)) fail(`tx-edit-modal.js is missing compact refund token: ${token}`);
  }
  for (const stale of ['실손/병원비 환급 예정으로 처리', '환급예정금액으로 분리됨']) {
    if (modalText.includes(stale)) fail(`tx-edit-modal.js must not render stale verbose refund label: ${stale}`);
  }

  const recordsCss = await fs.readFile(path.join(root, 'styles', '20-records.css'), 'utf8');
  for (const token of [
    '#tx-edit-form .tx-receipt-row .tds-input',
    'height: 32px;',
    'background: var(--surface);',
    'box-shadow: none;',
    '.tx-refund-help::after',
    '.tx-refund-help:focus::after',
    '.tx-refund-help:focus-visible::after',
  ]) {
    if (!recordsCss.includes(token)) fail(`styles/20-records.css is missing compact transaction detail token: ${token}`);
  }

  const styleText = await fs.readFile(path.join(root, 'style.css'), 'utf8');
  if (!styleText.includes(`styles/20-records.css?v=${TX_DETAIL_COMPACT_REFUND_VERSION}`)) {
    fail('style.css must cache-bust styles/20-records.css for compact transaction detail controls.');
  }

  const indexText = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  if (!indexText.includes(`style.css?v=${TX_DETAIL_COMPACT_REFUND_VERSION}`) || !indexText.includes(`ui=${TX_DETAIL_COMPACT_REFUND_VERSION}`)) {
    fail('index.html must cache-bust style.css and app.js for compact transaction detail controls.');
  }

  const appText = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  if (!appText.includes(`modal-manager.js?v=${CURRENT_MODAL_CACHE_VERSION}`)) {
    fail('app.js must cache-bust modal-manager.js for current modal markup.');
  }

  const modalManagerText = await fs.readFile(path.join(root, 'modal-manager.js'), 'utf8');
  if (!modalManagerText.includes(`MODAL_CACHE_VERSION = '${CURRENT_MODAL_CACHE_VERSION}'`)) {
    fail('modal-manager.js must cache-bust modal modules for current modal markup.');
  }
}

async function checkGpsRouteContracts() {
  const routeModulePath = path.join(root, 'utils', 'gps-route.js');
  const routeCoreModulePath = path.join(root, 'utils', 'gps-route-core.js');
  const runRendererPath = path.join(root, 'render-run.js');
  const runCssPath = path.join(root, 'styles', '90-run.css');
  const runInsightsPath = path.join(root, 'utils', 'run-insights.js');

  for (const file of [routeModulePath, routeCoreModulePath, runRendererPath, runCssPath, runInsightsPath]) {
    if (!(await exists(file))) fail(`GPS route rewrite is missing ${rel(file)}.`);
  }

  const appText = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  for (const token of [
    `render-run.js?v=${RUN_COACH_CACHE_VERSION}`,
    `render-settings.js?v=${REWARD_ENTRY_CRUD_VERSION}&data=${CANONICAL_DATA_MODULE_VERSION}&apk=${ANDROID_ROUTE_IMPORT_CACHE_VERSION}`,
    "run: renderRun",
    "run: '러닝'",
  ]) {
    if (!appText.includes(token)) fail(`app.js is missing GPS route tab/import token: ${token}`);
  }

  const indexText = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  if (!indexText.includes(`route=${GPS_ROUTE_CACHE_VERSION}`)) {
    fail(`index.html must cache-bust GPS route assets with ${GPS_ROUTE_CACHE_VERSION}.`);
  }
  if (!indexText.includes(`run=${RUN_COACH_CACHE_VERSION}`)) {
    fail(`index.html must cache-bust run coaching assets with ${RUN_COACH_CACHE_VERSION}.`);
  }
  if (!indexText.includes(`apk=${ANDROID_ROUTE_IMPORT_CACHE_VERSION}`)) {
    fail(`index.html must cache-bust the Android route import APK with ${ANDROID_ROUTE_IMPORT_CACHE_VERSION}.`);
  }

  const styleText = await fs.readFile(path.join(root, 'style.css'), 'utf8');
  if (!styleText.includes(`styles/90-run.css?v=${RUN_COACH_CACHE_VERSION}`)) {
    fail(`style.css must import and cache-bust styles/90-run.css with ${RUN_COACH_CACHE_VERSION}.`);
  }

  const runRendererText = await fs.readFile(runRendererPath, 'utf8');
  for (const token of ['buildRunInsights', 'calculateRunSplits', 'data-run-action="start-recording"', 'navigator.geolocation.watchPosition', '백그라운드 기록용 APK', 'getRunRecorderStatusJson', 'flushAndroidRunActivityImports']) {
    if (!runRendererText.includes(token)) fail(`render-run.js is missing commercial run feature token: ${token}`);
  }

  const insightsModule = await import(`${pathToFileURL(runInsightsPath).href}?verify=${Date.now()}`);
  const splitFixture = insightsModule.calculateRunSplits({
    startedAt: '2026-07-10T00:00:00Z',
    gps: { samples: [
      { lat: 37.5, lng: 127.0, elapsedSeconds: 0 },
      { lat: 37.5, lng: 127.01132, elapsedSeconds: 360 },
      { lat: 37.5, lng: 127.02264, elapsedSeconds: 730 },
      { lat: 37.5, lng: 127.03396, elapsedSeconds: 1080 },
    ] },
  });
  if (!splitFixture.available || splitFixture.estimated || splitFixture.splits.length < 3) {
    fail(`Run insights must calculate real timed kilometer splits; got ${JSON.stringify(splitFixture)}.`);
  }
  const dashboardFixture = insightsModule.buildRunInsights([
    { id: 'run-a', startedAt: '2026-07-10T09:00:00+09:00', distanceKm: 5, durationSeconds: 1800 },
    { id: 'run-b', startedAt: '2026-07-08T09:00:00+09:00', distanceKm: 4, durationSeconds: 1560 },
  ], { weeklyGoalKm: 12, daysPerWeek: 3 }, new Date('2026-07-11T12:00:00+09:00'));
  if (dashboardFixture.weekRunCount !== 2 || Math.abs(dashboardFixture.weekDistanceKm - 9) > 0.01 || dashboardFixture.schedule.length !== 3) {
    fail(`Run insights must calculate weekly goal progress and schedule; got ${JSON.stringify(dashboardFixture)}.`);
  }

  const pagesBuildText = await fs.readFile(path.join(root, 'scripts', 'build-pages.mjs'), 'utf8');
  if (!pagesBuildText.includes("'render-run.js'")) {
    fail('scripts/build-pages.mjs must copy render-run.js into the GitHub Pages artifact.');
  }

  const dataText = await fs.readFile(path.join(root, 'data.js'), 'utf8');
  for (const token of [
    'listRunActivities',
    'getRunActivity',
    'saveRunActivity',
    "'run_activities'",
    "'route_chunks'",
    'routePointCount',
    'routeComplete',
    'routeRevision',
    'RUN_ACTIVITY_INLINE_ROUTE_DELETE_FIELDS',
    'deleteRunRouteChunks',
    'row.routeComplete !== true',
    'routeCleanupChunkCount',
    'routeChunkCleanupCountFromRow',
  ]) {
    if (!dataText.includes(token)) fail(`data.js is missing run activity data boundary token: ${token}`);
  }
  if (dataText.includes('health: deleteField()')) {
    fail('data.js must not delete the entire health object when only health.route is a GPS alias.');
  }
  if (!dataText.includes('health: {') || !dataText.includes('route: deleteField()')) {
    fail('data.js must delete nested health.route from legacy inline GPS aliases without deleting health metrics.');
  }

  const routeCoreText = await fs.readFile(routeCoreModulePath, 'utf8');
  if (routeCoreText.includes('MIN_ROUTE_DELTA_METERS')) {
    fail('utils/gps-route-core.js must preserve dense GPS samples instead of thinning by a fixed meter delta.');
  }
  if (routeCoreText.includes('activity.startLocation') || routeCoreText.includes('activity.endLocation')) {
    fail('utils/gps-route-core.js must not synthesize a fake GPS route from only start/end points.');
  }

  if (!runRendererText.includes('route.points.length < 3')) {
    fail('render-run.js must require at least three GPS samples before drawing a route.');
  }
  if (!runRendererText.includes('GPS 경로 데이터가 부족합니다')) {
    fail('render-run.js must show the insufficient-route state for endpoint-only or two-point records.');
  }
  if (!runRendererText.includes('listRunActivities({ max: 100, hydrateRoutes: false })')) {
    fail('render-run.js must not hydrate every listed route; it should hydrate only the selected detail.');
  }

  const appTextForRouteImport = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  for (const token of [
    'saveRunActivity',
    "setActiveRunActivityImportUser?.('')",
    'setActiveRunActivityImportUser?.(uid)',
    'listPendingRunActivityImports(10)',
    'ackRunActivityImport?.(row.id, uid, activityId)',
    `failRunActivityImport?.(row?.id || '', uid`,
    'startAndroidRunActivityImportFlush',
  ]) {
    if (!appTextForRouteImport.includes(token)) fail(`app.js is missing Android run import flush token: ${token}`);
  }

  if (!(await exists(routeModulePath))) return;
  const routeModule = await import(`${pathToFileURL(routeModulePath).href}?verify=${Date.now()}`);
  const normalize = routeModule.normalizeRunActivityRoute;
  const summarize = routeModule.normalizeRunActivitySummary;
  const format = routeModule.formatRunDistanceKm;
  const project = routeModule.projectRunRoute;
  if (typeof normalize !== 'function') fail('utils/gps-route.js must export normalizeRunActivityRoute().');
  if (typeof summarize !== 'function') fail('utils/gps-route.js must export normalizeRunActivitySummary().');
  if (typeof format !== 'function') fail('utils/gps-route.js must export formatRunDistanceKm().');
  if (typeof project !== 'function') fail('utils/gps-route.js must export projectRunRoute().');
  if (typeof normalize !== 'function' || typeof summarize !== 'function') return;

  const galaxyWatchActivity = {
    source: 'galaxy_watch',
    title: '금요일 러닝',
    durationSeconds: 1677,
    calories: 208,
    averageHeartRate: 132,
    cadence: 141,
    elevationGainMeters: 15,
    route: {
      locations: [
        { latitude: 37.52112, longitude: 127.12164, altitude: 16, timestamp: '2026-07-10T00:00:00Z' },
        { latitude: 37.51642, longitude: 127.12228, altitude: 17, timestamp: '2026-07-10T00:05:00Z' },
        { latitude: 37.51258, longitude: 127.12462, altitude: 18, timestamp: '2026-07-10T00:10:00Z' },
        { latitude: 37.51298, longitude: 127.13172, altitude: 19, timestamp: '2026-07-10T00:18:00Z' },
        { latitude: 37.51896, longitude: 127.13326, altitude: 20, timestamp: '2026-07-10T00:24:00Z' },
        { latitude: 37.52138, longitude: 127.12808, altitude: 21, timestamp: '2026-07-10T00:27:57Z' },
      ],
    },
  };
  const mobileActivity = {
    source: 'mobile',
    startTime: '2026-07-10T09:41:00+09:00',
    endTime: '2026-07-10T10:08:57+09:00',
    caloriesKcal: 208,
    cadenceSpm: 141,
    heartRate: { average: 132 },
    gps: {
      samples: [
        { lat: 37.52112, lng: 127.12164, elapsedSeconds: 0 },
        { lat: 37.51642, lng: 127.12228, elapsedSeconds: 300 },
        { lat: 37.51258, lng: 127.12462, elapsedSeconds: 600 },
        { lat: 37.51298, lng: 127.13172, elapsedSeconds: 1080 },
        { lat: 37.51896, lng: 127.13326, elapsedSeconds: 1440 },
        { lat: 37.52138, lng: 127.12808, elapsedSeconds: 1677 },
      ],
    },
  };

  for (const [label, activity] of [['Galaxy Watch', galaxyWatchActivity], ['mobile', mobileActivity]]) {
    const route = normalize(activity);
    const summary = summarize(activity);
    if (!Array.isArray(route.points) || route.points.length < 6) {
      fail(`${label} GPS route must preserve the full point array; got ${route.points?.length || 0}.`);
    }
    if (!(route.distanceKm > 2)) {
      fail(`${label} GPS route must compute nonzero kilometers from route points; got ${route.distanceKm}.`);
    }
    if (!route.startPoint || !route.endPoint) {
      fail(`${label} GPS route must expose startPoint and endPoint.`);
    }
    if (!Array.isArray(route.kilometerMarkers) || route.kilometerMarkers.length < 2) {
      fail(`${label} GPS route must expose kilometer markers for the full route; got ${route.kilometerMarkers?.length || 0}.`);
    }
    if (!(route.durationSeconds > 0) || !(summary.durationSeconds > 0)) {
      fail(`${label} GPS route must derive nonzero duration for pace/stat display.`);
    }
    if (label === 'mobile' && summary.cadence !== 141) {
      fail(`mobile GPS summary must read cadenceSpm; got ${summary.cadence}.`);
    }
    if (typeof project === 'function') {
      const projected = project(route, { width: 360, height: 380, padding: 34 });
      if (projected.points.length !== route.points.length || projected.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
        fail(`${label} projected GPS route must include every normalized sample with finite screen coordinates.`);
      }
    }
  }

  const duplicateAliasRoute = normalize({
    routePoints: mobileActivity.gps.samples,
    gps: { samples: mobileActivity.gps.samples },
  });
  if (duplicateAliasRoute.points.length !== mobileActivity.gps.samples.length) {
    fail(`GPS route normalization must not concatenate duplicate alias arrays; got ${duplicateAliasRoute.points.length}.`);
  }

  const mixedAliasRoute = normalize({
    routePoints: [
      mobileActivity.gps.samples[0],
      mobileActivity.gps.samples.at(-1),
    ],
    gps: { samples: mobileActivity.gps.samples },
  });
  if (mixedAliasRoute.points.length !== mobileActivity.gps.samples.length || mixedAliasRoute.kilometerMarkers.length < 2) {
    fail(`GPS route normalization must prefer the full GPS sample array over a shorter start/end alias; got ${mixedAliasRoute.points.length} points and ${mixedAliasRoute.kilometerMarkers.length} km markers.`);
  }

  const endpointOnlyRoute = normalize({
    startLocation: mobileActivity.gps.samples[0],
    endLocation: mobileActivity.gps.samples.at(-1),
    distanceMeters: 3100,
    durationSeconds: 1677,
  });
  if (endpointOnlyRoute.points.length !== 0 || endpointOnlyRoute.startPoint || endpointOnlyRoute.endPoint) {
    fail(`GPS route normalization must not create a fake line from start/end only; got ${endpointOnlyRoute.points.length} points.`);
  }

  const twoPointRoute = normalize({
    gps: { samples: [mobileActivity.gps.samples[0], mobileActivity.gps.samples.at(-1)] },
  });
  if (twoPointRoute.points.length !== 2) {
    fail(`GPS route normalization must preserve a two-point input without inventing or dropping points; got ${twoPointRoute.points.length}.`);
  }

  const noRoute = normalize({ title: 'no GPS route', distanceMeters: 0 });
  if (noRoute.points.length !== 0 || noRoute.distanceKm !== 0) {
    fail(`GPS route normalization must handle no-route activity without fake distance; got ${noRoute.points.length} points and ${noRoute.distanceKm}km.`);
  }

  const malformedRoute = normalize({
    gps: { samples: [null, {}, { lat: 'not-a-number', lng: 127.1 }, { lat: 37.52112, lng: 127.12164 }] },
  });
  if (malformedRoute.points.length !== 1) {
    fail(`GPS route normalization must ignore malformed samples without crashing; got ${malformedRoute.points.length}.`);
  }

  const e7Route = normalize({
    gps: {
      samples: [
        { latE7: 375211200, lngE7: 1271216400, elapsedSeconds: 0 },
        { latE7: 375164200, lngE7: 1271222800, elapsedSeconds: 300 },
        { latE7: 375125800, lngE7: 1271246200, elapsedSeconds: 600 },
      ],
    },
  });
  if (e7Route.points.length !== 3 || e7Route.points[0].lat !== 37.52112 || e7Route.points[0].lng !== 127.12164) {
    fail(`GPS route normalization must support latE7/lngE7 samples; got ${JSON.stringify(e7Route.points[0])}.`);
  }

  const denseSamples = [
    { lat: 37.5211200, lng: 127.1216400, elapsedSeconds: 0 },
    { lat: 37.5211215, lng: 127.1216410, elapsedSeconds: 1 },
    { lat: 37.5211230, lng: 127.1216420, elapsedSeconds: 2 },
    { lat: 37.5211245, lng: 127.1216430, elapsedSeconds: 3 },
    { lat: 37.5211260, lng: 127.1216440, elapsedSeconds: 4 },
    { lat: 37.5211275, lng: 127.1216450, elapsedSeconds: 5 },
  ];
  const denseRoute = normalize({
    source: 'mobile',
    gps: { samples: denseSamples },
  });
  if (denseRoute.points.length !== denseSamples.length) {
    fail(`GPS route normalization must preserve dense valid samples; input=${denseSamples.length}, got=${denseRoute.points.length}.`);
  }
  denseSamples.forEach((sample, index) => {
    const point = denseRoute.points[index];
    if (!point || point.lat !== sample.lat || point.lng !== sample.lng || point.elapsedSeconds !== sample.elapsedSeconds) {
      fail(`GPS route normalization must preserve dense sample order at index ${index}; got ${JSON.stringify(point)}, expected ${JSON.stringify(sample)}.`);
    }
  });
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
  await checkReceiptEnricherSmsGmailMergeSmoke();
  await checkRetiredPhoneCollectionPurged(files);
  await checkPagesBuild();
  await checkTossKimTaewooSelfTransferExclusion();
  await checkRewardSavingsTriplePointSmoke();
  await checkRewardWidgetBridgeContracts();
  await checkRewardWidgetProviderContracts();
  await checkTelegramNewsfeedContracts();
  await checkTxDetailCompactRefundContracts();
  await checkGpsRouteContracts();

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
