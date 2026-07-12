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
    'android/src/com/aretenald/budget/AndroidCaptureContract.java',
    'android/src/com/aretenald/budget/BudgetNotificationService.java',
    'android/src/com/aretenald/budget/NotificationCaptureStore.java',
    'android/src/com/aretenald/budget/PaymentNotificationParser.java',
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
    if (r === 'scripts/verify-project.mjs' || r === 'scripts/verify/checks/deployment-checks.mjs') return false;
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

async function checkRetiredRunArtifacts() {
  const retiredFiles = [
    'render-run.js',
    'styles/90-run.css',
    'utils/gps-route.js',
    'utils/gps-route-core.js',
    'utils/run-insights.js',
    'android/src/com/aretenald/budget/RunActivityImportStore.java',
    'android/src/com/aretenald/budget/RunTrackingService.java',
    'android/src/com/aretenald/budget/RunTrackingStore.java',
  ];
  for (const relativePath of retiredFiles) {
    if (await exists(path.join(root, relativePath))) {
      fail(`Retired running feature file still exists: ${relativePath}`);
    }
  }

  const forbiddenByFile = {
    'index.html': ['data-tab="run"', '>러닝<'],
    'app.js': ['renderRun', 'saveRunActivity', 'listPendingRunActivityImports', 'flushAndroidRunActivityImports'],
    'data.js': ['listRunActivities', 'getRunActivity', 'saveRunActivity', "'run_activities'", "'route_chunks'"],
    'style.css': ['styles/90-run.css'],
    'scripts/build-pages.mjs': ["'render-run.js'"],
    'android/AndroidManifest.xml': [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'FOREGROUND_SERVICE_LOCATION',
      '.RunTrackingService',
      'android.intent.action.SEND',
    ],
    'android/src/com/aretenald/budget/MainActivity.java': ['RunActivityImportStore', 'androidRunImport', '?tab=run'],
    'android/src/com/aretenald/budget/BudgetAndroidBridge.java': [
      'RunActivityImportStore',
      'RunTrackingService',
      'RunTrackingStore',
      'startRunRecorder',
      'getRunRecorderStatusJson',
    ],
  };
  for (const [relativePath, tokens] of Object.entries(forbiddenByFile)) {
    const text = await fs.readFile(path.join(root, relativePath), 'utf8');
    for (const token of tokens) {
      if (text.includes(token)) {
        fail(`Retired running feature token "${token}" found in ${relativePath}.`);
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
  for (const file of [
    'index.html',
    'app.js',
    'config.js',
    'data/constants.js',
    'data/core/firebase.js',
    'data/shared/normalize.js',
    'data/repositories/master-data.js',
    'data/repositories/transactions.js',
    'data/repositories/dev-ideas.js',
    'data/repositories/settings.js',
    'data/repositories/finance.js',
    'data/repositories/newsfeed.js',
    'domain/receipts/rules.js',
    'domain/rewards/savings.js',
    'domain/transactions/budget.js',
    'domain/transactions/naverpay.js',
    'domain/transactions/self-transfer.js',
    'domain/transactions/shared-payment.js',
    'features/report/reward-point-modal/controller.js',
    'features/report/reward-point-modal/state.js',
    'features/report/reward-point-modal/view.js',
    'features/report/subcategory-classifier/controller.js',
    'features/report/subcategory-classifier/state.js',
    'features/report/subcategory-classifier/view.js',
    'features/report/budget-summary/state.js',
    'features/report/budget-summary/view.js',
    'features/report/state.js',
    'features/report/controller.js',
    'features/finance/projection/index.js',
    'features/finance/portfolio/index.js',
    'features/finance/editors/index.js',
    'features/finance/events.js',
    'features/finance/state.js',
    'features/finance/controller.js',
    'features/settings/rewards/index.js',
    'features/settings/budget-goals/index.js',
    'features/settings/events.js',
    'features/settings/state.js',
    'features/settings/controller.js',
    'features/settings/android-capture.js',
    'features/transactions/review-guide/index.js',
    'features/transactions/editor/view.js',
    'features/transactions/events.js',
    'features/transactions/state.js',
    'features/transactions/controller.js',
    'features/settlements/state.js',
    'features/settlements/controller.js',
    'features/review/state.js',
    'features/review/controller.js',
    'features/newsfeed/state.js',
    'features/newsfeed/view.js',
    'features/newsfeed/digest.js',
    'features/newsfeed/controller.js',
    'styles/60-shell.css',
    'styles/features/settings.css',
    'styles/features/report-home.css',
    'styles/features/finance.css',
    'utils/runtime.js',
    '.nojekyll',
  ]) {
    if (!(await exists(path.join(root, '_site', file)))) fail(`Pages artifact missing ${file}.`);
  }
  if (!(await exists(path.join(root, '_site', 'android-apk.svg')))) fail('Pages artifact missing android-apk.svg.');
  if (await exists(path.join(root, '_site', 'render-cart.js'))) fail('Pages artifact must not include retired render-cart.js.');
  if (await exists(path.join(root, '_site', 'client-parse.js'))) fail('Pages artifact must not include retired client-parse.js.');
  if (await exists(path.join(root, '_site', 'choice'))) fail('Pages artifact must not include retired choice/ browser modules.');
  if (await exists(path.join(root, '_site', 'urge'))) fail('Pages artifact must not include retired urge/mindbank browser modules.');
  if (await exists(path.join(root, '_site', 'wine-data.js'))) fail('Pages artifact must not include retired wine cellar seed data.');
  if (await exists(path.join(root, 'public', 'downloads', 'budget.apk'))) {
    for (const file of ['downloads/budget.apk', 'downloads/budget-apk.json']) {
      if (!(await exists(path.join(root, '_site', file)))) fail(`Pages artifact missing ${file}.`);
    }
  }
  if (await exists(path.join(root, '_site', 'api'))) fail('Pages artifact must not include Vercel-style api/ functions.');
}

export {
  checkDeploymentConfig,
  checkApkArtifactMetadata,
  checkRetiredPhoneCollectionPurged,
  checkRetiredRunArtifacts,
  checkPagesBuild,
};
