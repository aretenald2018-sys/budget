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
    CARD_SETTLEMENT_EXCLUDE_REASON,
    SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON,
    applyCardSettlementExclusion,
    applyTossKimTaewooSelfTransferExclusion,
    isCardSettlementTransfer,
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

  const cardSettlement = { type: 'transfer_out', merchant: '현대카드', amount: 484510 };
  if (!isCardSettlementTransfer(cardSettlement)) {
    fail('Card-company settlement withdrawal should be detected.');
  }
  const excludedCardSettlement = applyCardSettlementExclusion(cardSettlement);
  if (
    excludedCardSettlement.excludedFromBudget !== true ||
    excludedCardSettlement.excludeFromBudget !== true ||
    excludedCardSettlement.excludeReason !== CARD_SETTLEMENT_EXCLUDE_REASON
  ) {
    fail('Card-company settlement withdrawal should be marked budget-excluded.');
  }
  const ordinaryCardPurchase = { type: 'card_payment', merchant: '현대카드 M포인트몰', amount: 25000 };
  if (isCardSettlementTransfer(ordinaryCardPurchase)) {
    fail('Ordinary card purchases must remain included in spending.');
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
  const rewardSettingsText = await fs.readFile(path.join(root, 'features', 'settings', 'rewards', 'index.js'), 'utf8');
  const rewardSettingsFeatureText = `${settingsText}\n${rewardSettingsText}`;
  for (const token of ['와인구매 포인트', '고급재료 포인트', '여행충당 포인트', 'pointRate:', 'pointLabel:', 'pointTarget:', 'dailyRewardEnabled', 'dailyRewardBonusCap', '쉬어가기권', 'data-reward-point-action="add"', 'data-reward-point-action="delete"', 'targetAmount: 120000', 'targetAmount: 80000', 'targetAmount: 200000']) {
    if (!rewardSettingsFeatureText.includes(token)) fail(`Reward settings screen is missing triple point token: ${token}.`);
  }
  for (const token of ['포인트 정산 내역', '+ 신규내역', 'data-reward-entry-action', 'rewardPointEntry']) {
    if (rewardSettingsFeatureText.includes(token)) fail(`Reward settings must not keep transaction-linked point usage UI: ${token}.`);
  }
  for (const token of ['월 상한', '일 상한', 'monthPointCap', 'dailyPointCap']) {
    if (rewardSettingsFeatureText.includes(token)) fail(`Reward settings screen must not expose point cap token: ${token}.`);
  }

  const reportText = await fs.readFile(path.join(root, 'render-report.js'), 'utf8');
  const reportControllerText = await fs.readFile(path.join(root, 'features', 'report', 'controller.js'), 'utf8');
  if (!`${reportText}\n${reportControllerText}`.includes('data-report-view-mode')) fail('Home/report mode buttons must use root-scoped data-report-view-mode.');
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
  const rewardPointFeatureText = `${reportText}\n${reportControllerText}\n${rewardPointControllerText}\n${rewardPointViewText}`;
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
  if (!styleText.includes(`styles/features/report-home.css'`)) fail('style.css must import the report/home feature stylesheet.');

  const reportCss = await fs.readFile(path.join(root, 'styles', 'features', 'report-home.css'), 'utf8');
  for (const token of [
    '.home-widget-row-shell',
    '.home-widget-fill',
    '.home-widget-mark',
    '.home-widget-row-meta',
    '.home-widget-gauge-row',
  ]) {
    if (!reportCss.includes(token)) fail(`styles/features/report-home.css missing home widget graph selector: ${token}`);
  }
  if (!reportCss.includes('.home-reward-point-row.overdrawn')) {
    fail('styles/features/report-home.css must style overdrawn reward point rows.');
  }
  for (const token of ['.reward-point-modal', '.reward-point-usage-form', '.reward-point-history-row', '.reward-point-history-actions']) {
    if (!reportCss.includes(token)) fail(`styles/features/report-home.css missing virtual point usage selector: ${token}`);
  }
  for (const token of ['@media (max-width: 380px)', '#tab-home .home-reward-point-meta', 'text-overflow: ellipsis']) {
    if (!reportCss.includes(token)) fail(`styles/features/report-home.css missing mobile reward meta constraint: ${token}`);
  }
}

async function checkTelegramNewsfeedContracts() {
  const indexText = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  for (const token of ['id="tab-newsfeed"', 'data-tab="newsfeed"', 'data-public-tab="newsfeed"', 'src="./app.js"']) {
    if (!indexText.includes(token)) fail(`index.html is missing Telegram newsfeed token: ${token}`);
  }

  const appText = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  for (const token of [`render-newsfeed.js'`, 'newsfeed: renderNewsfeed', "newsfeed: '뉴스피드'", 'PUBLIC_TABS', 'showPublicTab', "'newsfeed'"]) {
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
  const newsfeedControllerText = await fs.readFile(path.join(root, 'features', 'newsfeed', 'controller.js'), 'utf8');
  const newsfeedStateText = await fs.readFile(path.join(root, 'features', 'newsfeed', 'state.js'), 'utf8');
  const newsfeedViewText = await fs.readFile(path.join(root, 'features', 'newsfeed', 'view.js'), 'utf8');
  const newsfeedDigestText = await fs.readFile(path.join(root, 'features', 'newsfeed', 'digest.js'), 'utf8');
  const newsfeedFeatureText = `${renderText}\n${newsfeedControllerText}\n${newsfeedStateText}\n${newsfeedViewText}\n${newsfeedDigestText}`;
  for (const token of ['listNewsfeedItems', 'getTelegramPublicFeedStatus', 'getNewsfeedDigestSnapshot', 'TELEGRAM_PUBLIC_SOURCES', 'data-newsfeed-action="refresh"', 'data-newsfeed-action="load-more"', 'data-newsfeed-action="digest-menu"', 'data-newsfeed-digest', 'document_body_ingested=false', 'body=not_ingested', 'newsfeed-filter-chip', 'newsfeed-load-more', 'target="_blank"']) {
    if (!newsfeedFeatureText.includes(token)) fail(`Newsfeed feature is missing Telegram newsfeed UI token: ${token}`);
  }
  for (const token of ['NEWSFEED_REFRESH_MS', 'refreshNewsfeedIfActive', "window.getCurrentTab?.() !== 'newsfeed'"]) {
    if (!newsfeedControllerText.includes(token)) fail(`features/newsfeed/controller.js is missing Telegram newsfeed auto-refresh token: ${token}`);
  }

  const styleText = await fs.readFile(path.join(root, 'style.css'), 'utf8');
  if (!styleText.includes(`styles/80-newsfeed.css'`)) fail('style.css must import styles/80-newsfeed.css.');
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
  const telegramStateAdapterText = await fs.readFile(path.join(root, 'api', 'adapters', 'telegram-feed-state.js'), 'utf8');
  for (const token of ['syncTelegramPublicFeed', 'fetchTelegramPublicSource', 'parseTelegramPublicPreviewHtml', 'telegramPublicPermalink', 'stateAdapter']) {
    if (!publicFeedText.includes(token)) fail(`telegram-public-feed.js is missing token: ${token}`);
  }
  for (const token of ['telegramFeedStateAdapter', 'newsfeed_items', 'telegram_public_feed']) {
    if (!telegramStateAdapterText.includes(token)) fail(`Telegram state adapter is missing token: ${token}`);
  }
  if (publicFeedText.includes('getAdminDb')) fail('telegram-public-feed.js must not own Firestore persistence after adapter extraction.');
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
  const editorViewText = await fs.readFile(path.join(root, 'features', 'transactions', 'editor', 'view.js'), 'utf8');
  const transactionEditorText = `${modalText}\n${editorViewText}`;
  for (const token of [
    'class="tx-refund-check"',
    '<span>환급예정</span>',
    'class="tx-refund-help"',
    'data-tooltip="${escHtml(helpText)}"',
  ]) {
    if (!transactionEditorText.includes(token)) fail(`Transaction editor feature is missing compact refund token: ${token}`);
  }
  for (const stale of ['실손/병원비 환급 예정으로 처리', '환급예정금액으로 분리됨']) {
    if (transactionEditorText.includes(stale)) fail(`Transaction editor feature must not render stale verbose refund label: ${stale}`);
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
  if (!styleText.includes(`styles/20-records.css'`)) fail('style.css must import styles/20-records.css.');

  const appText = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  if (!appText.includes(`modal-manager.js'`)) fail('app.js must import modal-manager.js.');

  const modalManagerText = await fs.readFile(path.join(root, 'modal-manager.js'), 'utf8');
  if (modalManagerText.includes('CACHE_VERSION')) fail('modal-manager.js must leave cache ownership to release.json and the Pages build.');
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
  const controllerText = await fs.readFile(path.join(root, 'features', 'report', 'controller.js'), 'utf8');
  const stateText = await fs.readFile(path.join(root, 'features', 'report', 'state.js'), 'utf8');
  const appText = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  const homeText = await fs.readFile(path.join(root, 'render-home.js'), 'utf8');
  const settingsText = await fs.readFile(path.join(root, 'render-settings.js'), 'utf8');
  const rewardControllerText = await fs.readFile(path.join(root, 'features', 'report', 'reward-point-modal', 'controller.js'), 'utf8');
  const rewardViewText = await fs.readFile(path.join(root, 'features', 'report', 'reward-point-modal', 'view.js'), 'utf8');
  const classifierControllerText = await fs.readFile(path.join(root, 'features', 'report', 'subcategory-classifier', 'controller.js'), 'utf8');
  const classifierViewText = await fs.readFile(path.join(root, 'features', 'report', 'subcategory-classifier', 'view.js'), 'utf8');
  const budgetStateText = await fs.readFile(path.join(root, 'features', 'report', 'budget-summary', 'state.js'), 'utf8');
  const budgetViewText = await fs.readFile(path.join(root, 'features', 'report', 'budget-summary', 'view.js'), 'utf8');

  for (const owner of [
    'features/report/controller.js',
    'features/report/state.js',
    'features/report/budget-summary/state.js',
    'features/report/budget-summary/view.js',
  ]) {
    if (!reportText.includes(owner)) fail(`render-report.js must import ${owner}.`);
  }
  for (const owner of ['./reward-point-modal/controller.js', './subcategory-classifier/controller.js']) {
    if (!controllerText.includes(owner)) fail(`features/report/controller.js must import ${owner}.`);
  }
  if (!stateText.includes('reportState') || /const\s+STATE\s*=/.test(reportText)) {
    fail('Report mutable state must be owned by features/report/state.js.');
  }
  const reportSpecifiers = [appText, homeText, settingsText]
    .map(text => text.match(/['"](\.\/render-report\.js)['"]/)?.[1] || '');
  if (reportSpecifiers.some(specifier => !specifier) || new Set(reportSpecifiers).size !== 1) {
    fail(`App, home, and settings must share one report module URL: ${JSON.stringify(reportSpecifiers)}.`);
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
  if (/on(?:click|change|submit|keydown|input)=/.test(`${reportText}\n${controllerText}\n${budgetViewText}`)) {
    fail('Report renderer and budget view must use delegated data actions instead of inline handlers.');
  }
  for (const token of ['data-report-action="open-category"', 'data-report-action="switch-tab"', 'data-dev-idea-form', 'data-dev-idea-toggle']) {
    if (!`${reportText}\n${controllerText}\n${budgetViewText}`.includes(token)) fail(`Report delegated event contract is missing token: ${token}.`);
  }
  if (/\bupdateTransaction\b|\bsaveDevIdea\b|\bdeleteDevIdea\b|addEventListener|\bFormData\b/.test(reportText)) {
    fail('render-report.js must delegate mutations, forms, and DOM event wiring to features/report/controller.js.');
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
  if (reportLines > 650) fail(`render-report.js is ${reportLines} lines; keep report state and controller work in owned modules.`);
  const controllerLines = controllerText.split('\n').length;
  if (controllerLines > 800) fail(`features/report/controller.js is ${controllerLines} lines; split the controller before adding more responsibilities.`);
}

async function checkFinanceFeatureOwnership() {
  const financeText = await fs.readFile(path.join(root, 'render-finance.js'), 'utf8');
  const controllerText = await fs.readFile(path.join(root, 'features', 'finance', 'controller.js'), 'utf8');
  const stateText = await fs.readFile(path.join(root, 'features', 'finance', 'state.js'), 'utf8');
  const projectionText = await fs.readFile(path.join(root, 'features', 'finance', 'projection', 'index.js'), 'utf8');
  const portfolioText = await fs.readFile(path.join(root, 'features', 'finance', 'portfolio', 'index.js'), 'utf8');
  const editorsText = await fs.readFile(path.join(root, 'features', 'finance', 'editors', 'index.js'), 'utf8');
  const eventsText = await fs.readFile(path.join(root, 'features', 'finance', 'events.js'), 'utf8');
  const chartControllerText = await fs.readFile(path.join(root, 'features', 'finance', 'chart', 'controller.js'), 'utf8');
  const assetServiceText = await fs.readFile(path.join(root, 'features', 'finance', 'assets', 'service.js'), 'utf8');
  if (!financeText.includes('features/finance/state.js') || !stateText.includes('financeState')) {
    fail('Finance renderer must keep mutable screen state in features/finance/state.js.');
  }
  if (/const\s+STATE\s*=/.test(financeText)) {
    fail('render-finance.js must not redeclare finance screen state.');
  }
  if (!financeText.includes('features/finance/projection/index.js')) {
    fail('render-finance.js must import the finance projection feature.');
  }
  if (!financeText.includes('features/finance/portfolio/index.js')) {
    fail('render-finance.js must import the finance portfolio feature.');
  }
  if (!financeText.includes('features/finance/editors/index.js')) {
    fail('render-finance.js must import the finance editors feature.');
  }
  if (!financeText.includes('features/finance/controller.js') || !controllerText.includes('./events.js') || !eventsText.includes('bindFinanceEvents')) {
    fail('Finance renderer must delegate events, forms, and mutations to features/finance/controller.js.');
  }
  if (!controllerText.includes('./chart/controller.js') || !controllerText.includes('./assets/service.js')) {
    fail('Finance controller must delegate chart interaction and asset import/network helpers to owned modules.');
  }
  if (!controllerText.includes("compoundProjection } from '../../utils/finance-goals.js'")) {
    fail('Finance scenario target controller must import compoundProjection before calculating a goal scenario.');
  }
  for (const token of ['buildScenarioSeries', 'financeChart', 'scenarioInsightPanel', 'normalizeContributionSchedule', 'contributionForScenarioYear']) {
    if (!projectionText.includes(token)) fail(`Finance projection feature is missing token: ${token}.`);
  }
  for (const token of ['portfolioPolicyCard', 'portfolioAlignment', 'rebalanceMoves', 'classifyPolicyBucket']) {
    if (!portfolioText.includes(token)) fail(`Finance portfolio feature is missing token: ${token}.`);
  }
  for (const token of ['scenarioEditorModal', 'scenarioManagerBody', 'actualSheet', 'cashflowMath', 'contributionScheduleRow']) {
    if (!editorsText.includes(token)) fail(`Finance editors feature is missing token: ${token}.`);
  }
  for (const token of ['bindFinanceChartInteractions', 'chartTooltipSvg', 'finance-point-hit']) {
    if (!chartControllerText.includes(token)) fail(`Finance chart controller is missing token: ${token}.`);
  }
  for (const token of ['parseAssetImage', 'mergeParsedAssetPositions', 'readFileAsDataUrl', 'searchTickerSymbols', 'inferMarketFromTicker']) {
    if (!assetServiceText.includes(token)) fail(`Finance asset service is missing token: ${token}.`);
  }
  if (/function\s+(parseAssetImage|mergeParsedAssetPositions|searchTicker|proxyFetchJson)\b/.test(controllerText)) {
    fail('Finance controller must not redeclare asset import and ticker network helpers.');
  }
  if (/on(?:click|change|submit|keydown|input)=/.test(`${financeText}\n${controllerText}\n${projectionText}\n${editorsText}`)) {
    fail('Finance renderer and feature views must use delegated data actions instead of inline handlers.');
  }
  if (/window\.finance[A-Z]\w*\s*=/.test(financeText)) {
    fail('Finance actions must stay module-local instead of being assigned to window.');
  }
  for (const token of ['data-finance-action', 'data-finance-change', 'data-finance-backdrop']) {
    if (!`${financeText}\n${controllerText}\n${projectionText}\n${editorsText}\n${eventsText}`.includes(token)) fail(`Finance delegated event contract is missing token: ${token}.`);
  }
  if (/\b(?:save|delete)Finance[A-Z]|addEventListener|\bfetch\(|\bFormData\b/.test(financeText)) {
    fail('render-finance.js must stay a render/view boundary and delegate mutations and DOM event wiring to the finance controller.');
  }
  for (const pattern of [
    /function\s+buildScenarioSeries\b/,
    /function\s+financeChart\b/,
    /function\s+scenarioInsightPanel\b/,
    /function\s+normalizeContributionSchedule\b/,
    /function\s+portfolioPolicyCard\b/,
    /function\s+portfolioAlignment\b/,
    /function\s+scenarioEditorModal\b/,
    /function\s+actualSheet\b/,
    /function\s+cashflowMath\b/,
  ]) {
    if (pattern.test(financeText)) fail(`render-finance.js must not redeclare extracted projection logic: ${pattern}.`);
  }
  const financeLines = financeText.split('\n').length;
  if (financeLines > 650) fail(`render-finance.js is ${financeLines} lines; keep state and controller work in owned finance modules.`);
  const controllerLines = controllerText.split('\n').length;
  if (controllerLines > 800) fail(`features/finance/controller.js is ${controllerLines} lines; split chart and asset helpers before adding responsibilities.`);
  if (chartControllerText.split('\n').length > 100) fail('features/finance/chart/controller.js must stay under 100 lines.');
  if (assetServiceText.split('\n').length > 250) fail('features/finance/assets/service.js must stay under 250 lines.');
}

async function checkSettingsFeatureOwnership() {
  const settingsText = await fs.readFile(path.join(root, 'render-settings.js'), 'utf8');
  const controllerText = await fs.readFile(path.join(root, 'features', 'settings', 'controller.js'), 'utf8');
  const stateText = await fs.readFile(path.join(root, 'features', 'settings', 'state.js'), 'utf8');
  const androidText = await fs.readFile(path.join(root, 'features', 'settings', 'android-capture.js'), 'utf8');
  const settingsRepositoryText = await fs.readFile(path.join(root, 'data', 'repositories', 'settings.js'), 'utf8');
  const rewardsText = await fs.readFile(path.join(root, 'features', 'settings', 'rewards', 'index.js'), 'utf8');
  const budgetText = await fs.readFile(path.join(root, 'features', 'settings', 'budget-goals', 'index.js'), 'utf8');
  const eventsText = await fs.readFile(path.join(root, 'features', 'settings', 'events.js'), 'utf8');
  const appText = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  for (const owner of [
    'features/settings/rewards/index.js',
    'features/settings/budget-goals/index.js',
    'features/settings/controller.js',
    'features/settings/state.js',
    'features/settings/android-capture.js',
  ]) {
    if (!settingsText.includes(owner)) fail(`render-settings.js must import ${owner}.`);
  }
  if (!/import\s*\{[^}]*\bcurrentRhythm\b[^}]*\}\s*from\s*['"][^'"]*features\/settings\/budget-goals\/index\.js/.test(settingsText)) {
    fail('render-settings.js must import currentRhythm from the settings budget feature.');
  }
  if (!/function\s+normalizeISODate\s*\(value\)/.test(settingsRepositoryText)) {
    fail('Settings repository must own the ISO date normalizer used by app settings.');
  }
  for (const token of ['normalizeRewardSettings', 'readRewardSettingsForm', 'rewardPointItemFields', 'appendRewardPointRow']) {
    if (!rewardsText.includes(token)) fail(`Settings reward feature is missing token: ${token}.`);
  }
  for (const token of ['budgetGoalGroups', 'summarizeBudget', 'currentTarget', 'currentRhythm']) {
    if (!budgetText.includes(token)) fail(`Settings budget feature is missing token: ${token}.`);
  }
  if (!eventsText.includes('bindSettingsEvents') || !controllerText.includes('./events.js') || !settingsText.includes('data-settings-action')) {
    fail('Settings renderer must delegate settings events and mutations to features/settings/controller.js.');
  }
  if (/on(?:click|change|submit|keydown|input)=/.test(settingsText)) {
    fail('Settings renderer must use delegated data actions instead of inline handlers.');
  }
  if (/window\.(?:refreshSettings|_budgetHomeManagedCategoryIds)/.test(settingsText)) {
    fail('Settings state and refresh must stay module-local.');
  }
  if (!stateText.includes('settingsState') || !androidText.includes('readAndroidCaptureStatus')) {
    fail('Settings mutable selection and Android presentation must have owned feature modules.');
  }
  if (/\bsaveAppSettings\b|\bsaveCategory[A-Z]|\bsaveSharedPaymentRule\b|addEventListener|\bFormData\b/.test(settingsText)) {
    fail('render-settings.js must delegate mutations, forms, and DOM event wiring to the settings controller.');
  }
  for (const token of ["document.addEventListener('budget:app-action'", "action === 'navigate'", "action === 'sign-out'"]) {
    if (!appText.includes(token)) fail(`App shell action event contract is missing token: ${token}.`);
  }
  for (const pattern of [
    /function\s+normalizeRewardSettings\b/,
    /function\s+readRewardSettingsForm\b/,
    /function\s+rewardPointItemFields\b/,
    /function\s+budgetGoalGroups\b/,
    /function\s+summarizeBudget\b/,
  ]) {
    if (pattern.test(settingsText)) fail(`render-settings.js must not redeclare extracted settings feature: ${pattern}.`);
  }
  const settingsLines = settingsText.split('\n').length;
  if (settingsLines > 350) fail(`render-settings.js is ${settingsLines} lines; keep settings state and controller work in owned modules.`);
  if (controllerText.split('\n').length > 300) fail('features/settings/controller.js must stay under 300 lines.');
  if (androidText.split('\n').length > 200) fail('features/settings/android-capture.js must stay under 200 lines.');
}

async function checkTransactionFeatureOwnership() {
  const txText = await fs.readFile(path.join(root, 'render-tx.js'), 'utf8');
  const txControllerText = await fs.readFile(path.join(root, 'features', 'transactions', 'controller.js'), 'utf8');
  const txStateText = await fs.readFile(path.join(root, 'features', 'transactions', 'state.js'), 'utf8');
  const settleText = await fs.readFile(path.join(root, 'render-settle.js'), 'utf8');
  const settleControllerText = await fs.readFile(path.join(root, 'features', 'settlements', 'controller.js'), 'utf8');
  const settleStateText = await fs.readFile(path.join(root, 'features', 'settlements', 'state.js'), 'utf8');
  const reviewText = await fs.readFile(path.join(root, 'render-review.js'), 'utf8');
  const reviewControllerText = await fs.readFile(path.join(root, 'features', 'review', 'controller.js'), 'utf8');
  const reviewStateText = await fs.readFile(path.join(root, 'features', 'review', 'state.js'), 'utf8');
  const txModalText = await fs.readFile(path.join(root, 'modals', 'tx-edit-modal.js'), 'utf8');
  const modalManagerText = await fs.readFile(path.join(root, 'modal-manager.js'), 'utf8');
  const accountModalText = await fs.readFile(path.join(root, 'modals', 'account-modal.js'), 'utf8');
  const categoryModalText = await fs.readFile(path.join(root, 'modals', 'category-modal.js'), 'utf8');
  const txEventsText = await fs.readFile(path.join(root, 'features', 'transactions', 'events.js'), 'utf8');
  const reviewGuideText = await fs.readFile(path.join(root, 'features', 'transactions', 'review-guide', 'index.js'), 'utf8');
  const editorViewText = await fs.readFile(path.join(root, 'features', 'transactions', 'editor', 'view.js'), 'utf8');
  const editorControllerText = await fs.readFile(path.join(root, 'features', 'transactions', 'editor', 'controller.js'), 'utf8');
  const editorBindingText = await fs.readFile(path.join(root, 'features', 'transactions', 'editor', 'binding-state.js'), 'utf8');
  const accountControllerText = await fs.readFile(path.join(root, 'features', 'modals', 'account-controller.js'), 'utf8');
  const categoryControllerText = await fs.readFile(path.join(root, 'features', 'modals', 'category-controller.js'), 'utf8');
  if (!txText.includes('features/transactions/review-guide/index.js')) {
    fail('render-tx.js must import the transaction review guide feature.');
  }
  if (!txText.includes('features/transactions/controller.js') || !txControllerText.includes('./events.js') || !txEventsText.includes('bindTransactionEvents')) {
    fail('render-tx.js must delegate event and scroll wiring to features/transactions/controller.js.');
  }
  if (!txText.includes('features/transactions/state.js') || !txStateText.includes('transactionState') || /const\s+STATE\s*=/.test(txText)) {
    fail('Transaction mutable state must be owned by features/transactions/state.js.');
  }
  for (const token of ['openTxReviewGuide', 'txReviewGuideHtml', 'txReviewGuide', 'data-tx-review-action']) {
    if (!reviewGuideText.includes(token)) fail(`Transaction review guide feature is missing token: ${token}.`);
  }
  if (!txModalText.includes('features/transactions/editor/view.js')) {
    fail('tx-edit-modal.js must import the transaction editor view feature.');
  }
  if (!txModalText.includes('features/transactions/editor/controller.js')
      || !accountModalText.includes('features/modals/account-controller.js')
      || !categoryModalText.includes('features/modals/category-controller.js')) {
    fail('Core modal views must delegate persistence and event wiring to owned controllers.');
  }
  if (!txModalText.includes('txDetailRequestVersion')) {
    fail('tx-edit-modal.js must ignore stale detail loads when a newer transaction modal request starts.');
  }
  for (const token of ['transactionEditorHtml', 'groupedCategoryOptions', 'subcategoryEditorHtml', 'data-tx-editor-action']) {
    if (!editorViewText.includes(token)) fail(`Transaction editor view feature is missing token: ${token}.`);
  }
  for (const pattern of [
    /function\s+openTxReviewGuide\b/,
    /function\s+txReviewGuideHtml\b/,
    /function\s+txReviewGuide\b/,
  ]) {
    if (pattern.test(txText)) fail(`render-tx.js must not redeclare extracted review guide feature: ${pattern}.`);
  }
  if (/on(?:click|change|submit|keydown|input)=/.test(txText)) {
    fail('render-tx.js must use delegated data actions instead of inline handlers.');
  }
  if (/addEventListener|bindTransactionEvents/.test(txText)) {
    fail('render-tx.js must not own DOM event binding after the transaction controller split.');
  }
  if (!settleText.includes('features/settlements/controller.js') || !settleText.includes('features/settlements/state.js')
      || !settleControllerText.includes('addEventListener') || !settleStateText.includes('settlementState')) {
    fail('Settlement state and events must be owned by features/settlements modules.');
  }
  if (/addEventListener|const\s+STATE\s*=/.test(settleText)) {
    fail('render-settle.js must stay a render boundary and delegate mutable state and events.');
  }
  if (!reviewText.includes('features/review/controller.js') || !reviewText.includes('features/review/state.js')
      || !reviewControllerText.includes('updateTransaction') || !reviewStateText.includes('reviewState')) {
    fail('Review receipt state and mutations must be owned by features/review modules.');
  }
  if (/addEventListener|\bupdateTransaction\b|\bmarkRawMessageSkipped\b|\bapplyReceiptToTransaction\b/.test(reviewText)) {
    fail('render-review.js must stay a render/view boundary and delegate events and mutations.');
  }
  if (!settleText.includes("recent.filter(tx => ['settlement_in', 'settlement_out'].includes(tx.type))")
      || /listTransactions\(\s*\{[^}]*\btypes\s*:/s.test(settleText)) {
    fail('Settlement view must avoid the undeployed type + occurredAt composite index and filter recent rows locally.');
  }
  if (/on(?:click|change|submit|keydown|input)=/.test(`${txModalText}\n${accountModalText}\n${categoryModalText}`)) {
    fail('Core account, category, and transaction modals must use delegated actions instead of inline handlers.');
  }
  if (/\b(saveTransaction|updateTransaction|deleteTransaction|saveCategorySubcategory|deleteCategorySubcategory|applySharedPayment)\b|addEventListener|\bFormData\b/.test(txModalText)) {
    fail('tx-edit-modal.js must remain a modal view/load boundary and delegate mutations and event wiring.');
  }
  if (/\b(saveAccount|deleteAccount|getAccountById|saveCategory|deleteCategory|getCategoryById|listTransactions)\b|addEventListener|\bFormData\b/.test(`${accountModalText}\n${categoryModalText}`)) {
    fail('Account and category modal views must remain presentation entrypoints without data or event ownership.');
  }
  for (const token of ['WeakMap', 'replaceRootBinding', 'binding-state.js', 'bindTransactionDetailController', 'saveEditedTransaction']) {
    if (!editorControllerText.includes(token)) fail(`Transaction editor controller is missing re-entry safety token: ${token}.`);
  }
  for (const token of ['replaceAbortableBinding', 'parseTransactionAmount', 'AbortController']) {
    if (!editorBindingText.includes(token)) fail(`Transaction editor binding state is missing token: ${token}.`);
  }
  for (const token of ['saveAccount', 'deleteAccount', 'openAccountModalController']) {
    if (!accountControllerText.includes(token)) fail(`Account modal controller is missing persistence token: ${token}.`);
  }
  for (const token of ['saveCategory', 'deleteCategory', 'listTransactions', 'openCategoryModalController']) {
    if (!categoryControllerText.includes(token)) fail(`Category modal controller is missing persistence token: ${token}.`);
  }
  for (const token of ['[data-modal-dismiss]', "classList?.contains('tds-modal-overlay')"]) {
    if (!modalManagerText.includes(token)) fail(`Modal manager delegated dismissal contract is missing token: ${token}.`);
  }
  for (const token of ['data-modal-dismiss="account-modal"', 'data-modal-dismiss="category-modal"', 'data-modal-dismiss="tx-add-modal"', 'data-tx-modal-action="retry-detail"']) {
    if (!`${accountModalText}\n${categoryModalText}\n${txModalText}`.includes(token)) fail(`Core modal delegated action contract is missing token: ${token}.`);
  }
  const txLines = txText.split('\n').length;
  if (txLines > 400) fail(`render-tx.js is ${txLines} lines; keep transaction state and events in owned modules.`);
  const txModalLines = txModalText.split('\n').length;
  if (txModalLines > 230) fail(`tx-edit-modal.js is ${txModalLines} lines; keep transaction editor behavior in its controller.`);
  if (editorControllerText.split('\n').length > 260) fail('features/transactions/editor/controller.js must stay under 260 lines.');
  if (accountControllerText.split('\n').length > 160) fail('features/modals/account-controller.js must stay under 160 lines.');
  if (categoryControllerText.split('\n').length > 250) fail('features/modals/category-controller.js must stay under 250 lines.');
}

async function checkNewsfeedFeatureOwnership() {
  const renderText = await fs.readFile(path.join(root, 'render-newsfeed.js'), 'utf8');
  const controllerText = await fs.readFile(path.join(root, 'features', 'newsfeed', 'controller.js'), 'utf8');
  const stateText = await fs.readFile(path.join(root, 'features', 'newsfeed', 'state.js'), 'utf8');
  const viewText = await fs.readFile(path.join(root, 'features', 'newsfeed', 'view.js'), 'utf8');
  const digestText = await fs.readFile(path.join(root, 'features', 'newsfeed', 'digest.js'), 'utf8');
  for (const owner of [
    'features/newsfeed/state.js',
    'features/newsfeed/view.js',
    'features/newsfeed/controller.js',
  ]) {
    if (!renderText.includes(owner)) fail(`render-newsfeed.js must import ${owner}.`);
  }
  for (const token of ['createNewsfeedState', 'normalizeNewsfeedPage', 'mergeNewsfeedItems', 'cursorForNewsfeedItem']) {
    if (!stateText.includes(token)) fail(`Newsfeed state feature is missing token: ${token}.`);
  }
  for (const token of ['newsfeedViewHtml', 'feedCardHtml', 'data-newsfeed-category', 'data-newsfeed-action="load-more"']) {
    if (!viewText.includes(token)) fail(`Newsfeed view feature is missing token: ${token}.`);
  }
  for (const token of ['buildDigestPayload', 'document_body_ingested=false', 'body=not_ingested']) {
    if (!digestText.includes(token)) fail(`Newsfeed digest feature is missing token: ${token}.`);
  }
  if (!controllerText.includes('./digest.js') || !controllerText.includes('addEventListener') || !controllerText.includes('getNewsfeedDigestSnapshot')) {
    fail('Newsfeed controller must own delegated events, pagination, and digest copy orchestration.');
  }
  if (/addEventListener|getNewsfeedDigestSnapshot|navigator\.clipboard|document\.execCommand/.test(renderText)) {
    fail('render-newsfeed.js must stay a load/render boundary and delegate interaction side effects.');
  }
  const renderLines = renderText.split('\n').length;
  if (renderLines > 80) fail(`render-newsfeed.js is ${renderLines} lines; keep state, events, views, and digest rules in feature modules.`);
  if (controllerText.split('\n').length > 180) fail('features/newsfeed/controller.js must stay under 180 lines.');
}

async function checkServerServiceOwnership() {
  const gmailHandler = await fs.readFile(path.join(root, 'api', 'gmail-poll.js'), 'utf8');
  const gmailService = await fs.readFile(path.join(root, 'api', 'services', 'gmail-receipt-sync.js'), 'utf8');
  const productHandler = await fs.readFile(path.join(root, 'api', 'product-preview.js'), 'utf8');
  const visualHandler = await fs.readFile(path.join(root, 'api', 'visual-search.js'), 'utf8');
  const recipeService = await fs.readFile(path.join(root, 'api', '_lib', 'recipe-analysis.js'), 'utf8');
  const telegramService = await fs.readFile(path.join(root, 'api', '_lib', 'telegram-public-feed.js'), 'utf8');
  const geminiAdapter = await fs.readFile(path.join(root, 'api', '_lib', 'gemini.js'), 'utf8');
  const groqAdapter = await fs.readFile(path.join(root, 'api', '_lib', 'groq.js'), 'utf8');
  const gmailLegacyAdapter = await fs.readFile(path.join(root, 'api', '_lib', 'gmail.js'), 'utf8');

  for (const token of ['adapters/gmail.js', 'adapters/gmail-poll-state.js', 'adapters/receipt-processing.js', 'services/gmail-receipt-sync.js']) {
    if (!gmailHandler.includes(token)) fail(`gmail-poll.js must import server boundary ${token}.`);
  }
  if (/getAdminDb|\bfetch\(|process\.env/.test(gmailService)) {
    fail('Gmail receipt sync service must not own Firestore, fetch, or environment access.');
  }
  for (const [handlerText, name, maxLines] of [
    [gmailHandler, 'api/gmail-poll.js', 80],
    [productHandler, 'api/product-preview.js', 45],
    [visualHandler, 'api/visual-search.js', 40],
  ]) {
    const lines = handlerText.split('\n').length;
    if (lines > maxLines) fail(`${name} is ${lines} lines; keep HTTP handlers thin.`);
  }
  if (!productHandler.includes('services/product-preview.js') || !productHandler.includes('adapters/product-preview.js')) {
    fail('Product preview endpoint must delegate to service and adapter modules.');
  }
  if (!visualHandler.includes('services/visual-search.js') || !visualHandler.includes('adapters/visual-search.js')
      || /process\.env|\bfetch\(/.test(visualHandler)) {
    fail('Visual search endpoint must keep provider environment and fetch access in its adapter.');
  }
  if (/getAdminDb|FieldValue|userScope/.test(recipeService) || !recipeService.includes('recipeAnalysisStoreAdapter')) {
    fail('Recipe analysis use case must access Firestore through its store adapter.');
  }
  if (/getAdminDb|FieldValue|userScope/.test(telegramService) || !telegramService.includes('telegramFeedStateAdapter')) {
    fail('Telegram sync use case must access Firestore through its state adapter.');
  }
  for (const [text, name] of [
    [geminiAdapter, 'Gemini'],
    [groqAdapter, 'Groq'],
    [gmailLegacyAdapter, 'Gmail'],
  ]) {
    for (const token of ['requireEnv', 'fetchJsonWithTimeout']) {
      if (!text.includes(token)) fail(`${name} adapter must use shared server runtime policy ${token}.`);
    }
  }
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
  checkSettingsFeatureOwnership,
  checkTransactionFeatureOwnership,
  checkNewsfeedFeatureOwnership,
  checkServerServiceOwnership,
};
