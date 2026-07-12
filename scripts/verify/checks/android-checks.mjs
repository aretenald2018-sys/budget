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
  if (!indexText.includes(`app.js?v=${CANONICAL_APP_ENTRY_VERSION}`)) {
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
  if (Number(apkVersion.versionCode) < 19) {
    fail(`Android APK version must be bumped for reward widget bridge: ${JSON.stringify(apkVersion)}`);
  }
  if (apkVersion.cacheBust !== BUDGET_APK_CACHE_VERSION) {
    fail(`Android APK cacheBust must use ${BUDGET_APK_CACHE_VERSION}: ${JSON.stringify(apkVersion)}`);
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
  if (Number(apkVersion.versionCode) < 19) {
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

export {
  checkAndroidLocalNotificationContracts,
  checkAndroidCaptureTransactionSmoke,
  androidLayoutAttr,
  checkRewardWidgetBridgeContracts,
  checkRewardWidgetProviderContracts,
};
