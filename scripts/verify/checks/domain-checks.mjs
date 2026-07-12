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
  REFACTOR_SURFACE_VERSION,
  CANONICAL_APP_ENTRY_VERSION,
  CANONICAL_NEWSFEED_VERSION,
  CANONICAL_TELEGRAM_SOURCE_VERSION,
  CURRENT_MODAL_CACHE_VERSION,
  TX_DETAIL_COMPACT_REFUND_VERSION,
} from '../config.mjs';

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

async function checkTossKimTaewooSelfTransferExclusion() {
  const moduleUrl = pathToFileURL(path.join(root, 'domain', 'transactions', 'self-transfer.js')).href;
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
  const moduleUrl = pathToFileURL(path.join(root, 'domain', 'rewards', 'savings.js')).href;
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
  const pointEntries = [{
    pointItemId: 'winePurchase',
    pointItemLabel: '와인구매 포인트',
    amount: 50000,
    usedAt: settlementNow,
  }];
  const settlementSummary = buildRewardSavingsSummary({
    transactions: settlementTransactions,
    pointEntries,
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
    fail(`Virtual reward point usage must preserve negative monthly balance: ${JSON.stringify({ summary: settlementSummary, bucket: settlementBucket })}`);
  }
  const legacyMetadataSummary = buildRewardSavingsSummary({
    transactions: [
      ...settlementTransactions,
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
  if (legacyMetadataSummary.pointBuckets?.find(bucket => bucket.key === 'winePurchase')?.spentMonthPoints !== 0) {
    fail(`Legacy transaction rewardPointEntry metadata must not affect virtual point usage: ${JSON.stringify(legacyMetadataSummary)}`);
  }
  const orphanUsageSummary = buildRewardSavingsSummary({
    transactions: settlementTransactions,
    pointEntries: [{
      pointItemId: 'retiredPoint',
      pointItemLabel: '삭제된 포인트',
      amount: 1000,
      usedAt: settlementNow,
    }],
    now: settlementNow,
    lookbackDays: 30,
    baselineMethod: 'simple_daily',
    categoryNames: ['생활'],
    pointItems: [
      { id: 'winePurchase', label: '와인구매 포인트', rate: 1, targetAmount: 120000, enabled: true, order: 10 },
    ],
  });
  const orphanBucket = orphanUsageSummary.pointBuckets?.find(bucket => bucket.key === 'retiredPoint');
  if (orphanBucket?.label !== '삭제된 포인트' || orphanBucket?.spentMonthPoints !== 1000 || orphanBucket?.monthPoints !== -1000 || orphanBucket?.historyOnly !== true) {
    fail(`Virtual reward point usage must keep deleted point item fallback rows: ${JSON.stringify(orphanUsageSummary.pointBuckets)}`);
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
  for (const token of ['포인트 정산 내역', '+ 신규내역', 'data-reward-entry-action', 'rewardPointEntry']) {
    if (settingsText.includes(token)) fail(`Reward settings must not keep transaction-linked point usage UI: ${token}.`);
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
  for (const token of ['overdrawn', 'formatPointBalance', 'spentMonthPoints', 'earnedMonthPoints', '적립 +', '사용 -', '잔액 ']) {
    if (!reportText.includes(token)) fail(`Reward report card is missing virtual point balance token: ${token}.`);
  }
  const rewardPointControllerText = await fs.readFile(path.join(root, 'features', 'report', 'reward-point-modal', 'controller.js'), 'utf8');
  const rewardPointViewText = await fs.readFile(path.join(root, 'features', 'report', 'reward-point-modal', 'view.js'), 'utf8');
  const rewardPointFeatureText = `${reportText}\n${rewardPointControllerText}\n${rewardPointViewText}`;
  for (const token of ['data-reward-point-action="open"', 'rewardPointModalController.open', 'saveRewardPointEntry', 'deleteRewardPointEntry', 'data-reward-point-form', 'data-reward-point-entry-action']) {
    if (!rewardPointFeatureText.includes(token)) fail(`Reward report feature is missing virtual point usage CRUD token: ${token}.`);
  }
  const dataText = await fs.readFile(path.join(root, 'data.js'), 'utf8');
  const transactionRepositoryText = await fs.readFile(path.join(root, 'data', 'repositories', 'transactions.js'), 'utf8');
  for (const token of ['reward_point_entries', 'listRewardPointEntries', 'saveRewardPointEntry', 'deleteRewardPointEntry']) {
    if (!`${dataText}\n${transactionRepositoryText}`.includes(token)) fail(`Browser data boundary is missing virtual point ledger token: ${token}.`);
  }
  if (!transactionRepositoryText.includes('withoutRewardPointEntry')) {
    fail('Transaction repository must remove rewardPointEntry from newly saved transactions.');
  }
  const txText = await fs.readFile(path.join(root, 'render-tx.js'), 'utf8');
  const modalText = await fs.readFile(path.join(root, 'modals', 'tx-edit-modal.js'), 'utf8');
  for (const stale of ['rewardPointEntry', '포인트 정산', 'rewardPointEnabled', 'rewardPointItemId', 'rewardPointAmount']) {
    if (txText.includes(stale) || modalText.includes(stale)) fail(`Transaction UI must not keep virtual point usage token: ${stale}.`);
  }

  const budgetSummaryViewText = await fs.readFile(path.join(root, 'features', 'report', 'budget-summary', 'view.js'), 'utf8');
  const homeWidgetFeatureText = `${reportText}\n${budgetSummaryViewText}`;
  for (const token of [
    'home-widget-row-shell',
    'home-widget-fill',
    'home-widget-value',
    'home-widget-gauge-row',
    'rewardPointMark',
    'homeWidgetCategoryMark',
  ]) {
    if (!homeWidgetFeatureText.includes(token)) fail(`Reward report feature is missing home widget graph token: ${token}.`);
  }

  const designText = await fs.readFile(path.join(root, 'docs', 'design-system.md'), 'utf8');
  for (const token of ['목록형 위젯 그래프', 'row shell', 'var(--grad-bar)', '2x2', '4x2']) {
    if (!designText.includes(token)) fail(`docs/design-system.md missing home widget graph design token: ${token}.`);
  }

  const styleText = await fs.readFile(path.join(root, 'style.css'), 'utf8');
  if (!styleText.includes(`styles/60-urge.css?v=${REFACTOR_SURFACE_VERSION}`)) {
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
  for (const token of ['.reward-point-modal', '.reward-point-usage-form', '.reward-point-history-row', '.reward-point-history-actions']) {
    if (!urgeCss.includes(token)) fail(`styles/60-urge.css missing virtual point usage selector: ${token}`);
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
  const newsfeedRepositoryText = await fs.readFile(path.join(root, 'data', 'repositories', 'newsfeed.js'), 'utf8');
  const newsfeedDataBoundaryText = `${dataText}\n${newsfeedRepositoryText}`;
  for (const token of ['listNewsfeedItems', 'getTelegramPublicFeedStatus', 'getNewsfeedDigestSnapshot', 'STATIC_NEWSFEED_URL', "'newsfeed_items'", "'telegram_public_feed'", 'nextCursor', 'hasMore', 'newsfeedPageResult', 'shouldFallbackToStaticNewsfeed', 'hasNewsfeedItems', 'itemCount: Array.isArray(snapshot.items)', 'snapshotTotal']) {
    if (!newsfeedDataBoundaryText.includes(token)) fail(`Browser newsfeed data boundary is missing token: ${token}`);
  }
  for (const token of ['STATIC_NEWSFEED_CACHE_MS', 'refreshStatic', 'cacheFresh']) {
    if (!newsfeedRepositoryText.includes(token)) fail(`Newsfeed repository is missing refresh token: ${token}`);
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
  if (!modalManagerText.includes(`DATA_MODULE_CACHE_VERSION = '${CANONICAL_DATA_MODULE_VERSION}'`)) {
    fail('modal-manager.js must cache-bust modal modules for the canonical data boundary.');
  }
}

async function checkPureDomainRuleOwnership() {
  const transactionRepositoryText = await fs.readFile(path.join(root, 'data', 'repositories', 'transactions.js'), 'utf8');
  const sharedPaymentServiceText = await fs.readFile(path.join(root, 'api', '_lib', 'shared-payments.js'), 'utf8');
  const receiptEnricherText = await fs.readFile(path.join(root, 'api', '_lib', 'receipt-enricher.js'), 'utf8');
  const rewardFacadeText = await fs.readFile(path.join(root, 'utils', 'reward-savings.js'), 'utf8');
  const calendarExportText = await fs.readFile(path.join(root, 'scripts', 'export-calendar-csv.mjs'), 'utf8');

  for (const [text, owner] of [
    [transactionRepositoryText, "domain/transactions/budget.js"],
    [calendarExportText, "domain/transactions/budget.js"],
    [transactionRepositoryText, "domain/transactions/shared-payment.js"],
    [sharedPaymentServiceText, "domain/transactions/shared-payment.js"],
    [transactionRepositoryText, "domain/receipts/rules.js"],
    [receiptEnricherText, "domain/receipts/rules.js"],
    [rewardFacadeText, "domain/rewards/savings.js"],
  ]) {
    if (!text.includes(owner)) fail(`Domain consumer must import canonical rule owner ${owner}.`);
  }

  const duplicateDeclarations = [
    [transactionRepositoryText, /function\s+(classifyReceiptCategoryClient|classifyCoupangSubcategoryClient|buildReceiptMemoClient|mergeReceiptMemoClient|shouldSuggestSharedPayment|applySharedRule)\b/, 'transaction repository'],
    [sharedPaymentServiceText, /function\s+(shouldSuggestSharedPayment|isShareablePayment|applyPeopleCount)\b/, 'shared payment service'],
    [receiptEnricherText, /function\s+(classifyReceiptCategory|classifyCoupangSubcategory|buildReceiptMemo|mergeReceiptMemo)\b/, 'receipt enricher'],
    [calendarExportText, /function\s+(isBudgetExcluded|isReimbursementExpected|displayCategoryName)\b/, 'calendar export'],
    [rewardFacadeText, /function\s+(buildRewardSavingsSummary|buildRewardWidgetSnapshot)\b/, 'reward compatibility facade'],
  ];
  for (const [text, pattern, label] of duplicateDeclarations) {
    if (pattern.test(text)) fail(`${label} must not redeclare a canonical domain rule.`);
  }
}

async function checkReportFeatureOwnership() {
  const reportText = await fs.readFile(path.join(root, 'render-report.js'), 'utf8');
  const rewardControllerText = await fs.readFile(path.join(root, 'features', 'report', 'reward-point-modal', 'controller.js'), 'utf8');
  const rewardViewText = await fs.readFile(path.join(root, 'features', 'report', 'reward-point-modal', 'view.js'), 'utf8');
  const classifierControllerText = await fs.readFile(path.join(root, 'features', 'report', 'subcategory-classifier', 'controller.js'), 'utf8');
  const classifierViewText = await fs.readFile(path.join(root, 'features', 'report', 'subcategory-classifier', 'view.js'), 'utf8');
  const budgetStateText = await fs.readFile(path.join(root, 'features', 'report', 'budget-summary', 'state.js'), 'utf8');
  const budgetViewText = await fs.readFile(path.join(root, 'features', 'report', 'budget-summary', 'view.js'), 'utf8');

  for (const owner of [
    'features/report/reward-point-modal/controller.js',
    'features/report/subcategory-classifier/controller.js',
    'features/report/budget-summary/state.js',
    'features/report/budget-summary/view.js',
  ]) {
    if (!reportText.includes(owner)) fail(`render-report.js must import ${owner}.`);
  }
  for (const token of ['saveRewardPointEntry', 'deleteRewardPointEntry', 'data-reward-point-entry-action']) {
    if (!`${rewardControllerText}\n${rewardViewText}`.includes(token)) fail(`Reward point feature is missing token: ${token}.`);
  }
  for (const token of ['saveCategorySubcategory', 'updateTransaction', 'data-report-action="save-subcategory-classifier"', 'input[name="txIds"]']) {
    if (!`${classifierControllerText}\n${classifierViewText}`.includes(token)) fail(`Subcategory classifier feature is missing token: ${token}.`);
  }
  for (const token of ['expenseTransactions', 'reimbursementTransactions', 'progressPercentValue', 'budgetGaugeGroups', 'home-widget-gauge-row']) {
    if (!`${budgetStateText}\n${budgetViewText}`.includes(token)) fail(`Budget summary feature is missing token: ${token}.`);
  }
  for (const pattern of [
    /function\s+openRewardPointModal\b/,
    /function\s+saveRewardPointUsageFromForm\b/,
    /function\s+openSubcategoryClassifier\b/,
    /function\s+saveSubcategoryClassifier\b/,
    /function\s+budgetGaugeGroups\b/,
    /function\s+heroSecondaryProgress\b/,
    /function\s+progressPercentValue\b/,
  ]) {
    if (pattern.test(reportText)) fail(`render-report.js must not redeclare extracted feature controller: ${pattern}.`);
  }
  const reportLines = reportText.split('\n').length;
  if (reportLines > 1500) fail(`render-report.js is ${reportLines} lines; keep extracted report features under their owned modules.`);
}

async function checkFinanceFeatureOwnership() {
  const financeText = await fs.readFile(path.join(root, 'render-finance.js'), 'utf8');
  const projectionText = await fs.readFile(path.join(root, 'features', 'finance', 'projection', 'index.js'), 'utf8');
  if (!financeText.includes('features/finance/projection/index.js')) {
    fail('render-finance.js must import the finance projection feature.');
  }
  for (const token of ['buildScenarioSeries', 'financeChart', 'scenarioInsightPanel', 'normalizeContributionSchedule', 'contributionForScenarioYear']) {
    if (!projectionText.includes(token)) fail(`Finance projection feature is missing token: ${token}.`);
  }
  for (const pattern of [
    /function\s+buildScenarioSeries\b/,
    /function\s+financeChart\b/,
    /function\s+scenarioInsightPanel\b/,
    /function\s+normalizeContributionSchedule\b/,
  ]) {
    if (pattern.test(financeText)) fail(`render-finance.js must not redeclare extracted projection logic: ${pattern}.`);
  }
  const financeLines = financeText.split('\n').length;
  if (financeLines > 2200) fail(`render-finance.js is ${financeLines} lines; keep projection logic in its feature module.`);
}

export {
  checkReceiptEnricherSmsGmailMergeSmoke,
  checkTossKimTaewooSelfTransferExclusion,
  checkRewardSavingsTriplePointSmoke,
  checkTelegramNewsfeedContracts,
  checkTxDetailCompactRefundContracts,
  checkPureDomainRuleOwnership,
  checkReportFeatureOwnership,
  checkFinanceFeatureOwnership,
};
