import { getAdminDb, userScope, FieldValue, Timestamp } from './firebase-admin.js';

const MATCH_WINDOW_MS = 30 * 60 * 1000;
const GENERIC_MERCHANTS = ['쿠팡이츠', '배달의민족', '배민', 'coupangeats', 'baemin'];
const UNCATEGORIZED = '미분류';
const COUPANG_CATEGORY = '생활비용';

export async function processReceipt(parsed, emailId) {
  if (!emailId) throw new Error('emailId missing');
  if (parsed.skip) {
    return { action: 'skipped', reason: parsed.skipReason || 'receipt skipped' };
  }

  const db = getAdminDb();
  const uid = userScope();
  const userRef = db.collection('users').doc(uid);
  const receiptsRef = userRef.collection('receipts');

  const duplicate = await receiptsRef.where('emailId', '==', emailId).limit(1).get();
  if (!duplicate.empty) {
    const doc = duplicate.docs[0];
    const receipt = { ...doc.data(), id: doc.id };
    const existingItems = Array.isArray(doc.data().items) ? doc.data().items : [];
    const nextItems = Array.isArray(parsed.items) ? parsed.items : [];
    if (existingItems.length === 0 && nextItems.length > 0) {
      await doc.ref.update({
        items: nextItems,
        updatedAt: FieldValue.serverTimestamp(),
      });
      receipt.items = nextItems;
    }

    if (receipt.matchedTxId) {
      const txRef = userRef.collection('transactions').doc(receipt.matchedTxId);
      await updateTransactionCategoryFromReceipt(txRef, receipt, parsed);
      return { action: existingItems.length === 0 && nextItems.length > 0 ? 'updated' : 'skipped', reason: existingItems.length === 0 && nextItems.length > 0 ? 'items enriched' : 'duplicate', receiptId: doc.id, txId: receipt.matchedTxId };
    }

    const occurredAt = receipt.occurredAt?.toDate ? receipt.occurredAt.toDate() : normalizeDate(receipt.occurredAt);
    const match = await findMatchingTransaction(userRef, Number(receipt.amount) || 0, occurredAt, receipt);
    if (match) {
      await linkReceiptToTransaction(doc.ref, match.ref, doc.id, receipt, parsed);
      return { action: 'enriched', reason: 'duplicate receipt matched transaction', receiptId: doc.id, txId: match.id };
    }

    const txId = await createTransactionFromReceipt(userRef, doc.ref, doc.id, receipt, parsed);
    return { action: 'created', reason: 'duplicate receipt without transaction', receiptId: doc.id, txId };
  }

  const occurredAt = normalizeDate(parsed.occurredAt);
  const receiptRef = receiptsRef.doc();
  const receiptDoc = {
    emailId,
    source: parsed.source || 'unknown',
    merchant: parsed.merchant || null,
    amount: Math.abs(Math.round(Number(parsed.amount) || 0)),
    occurredAt: Timestamp.fromDate(occurredAt),
    items: Array.isArray(parsed.items) ? parsed.items : [],
    ...receiptClassificationFields({ parsed }),
    matchedTxId: null,
    createdAt: FieldValue.serverTimestamp(),
  };

  const match = await findMatchingTransaction(userRef, receiptDoc.amount, occurredAt, receiptDoc);
  if (match) {
    const patch = {
      updatedAt: FieldValue.serverTimestamp(),
      ...receiptLinkPatch(receiptRef.id, match.data()),
    };
    if (parsed.merchant && isGenericMerchant(match.data().merchant || match.data().counterparty)) {
      patch.merchant = parsed.merchant;
    }
    Object.assign(patch, transactionCategoryPatch(receiptDoc, parsed, match.data()));
    receiptDoc.matchedTxId = match.id;

    const batch = db.batch();
    batch.set(receiptRef, receiptDoc);
    batch.update(match.ref, patch);
    await batch.commit();
    return { action: 'enriched', receiptId: receiptRef.id, txId: match.id };
  }

  const txId = await createTransactionFromReceipt(userRef, receiptRef, receiptRef.id, receiptDoc, parsed);
  return { action: 'created', reason: 'no matching transaction', receiptId: receiptRef.id, txId };
}

async function linkReceiptToTransaction(receiptRef, txRef, receiptId, receipt, parsed) {
  const txSnap = await txRef.get();
  const txData = txSnap.exists ? txSnap.data() : {};
  const patch = {
    updatedAt: FieldValue.serverTimestamp(),
    ...receiptLinkPatch(receiptId, txData),
  };
  if (parsed.merchant && isGenericMerchant(txData.merchant || txData.counterparty)) {
    patch.merchant = parsed.merchant;
  }
  Object.assign(patch, transactionCategoryPatch(receipt, parsed, txData));
  await Promise.all([
    receiptRef.update({
      matchedTxId: txRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    txRef.update(patch),
  ]);
}

async function createTransactionFromReceipt(userRef, receiptRef, receiptId, receipt, parsed) {
  const txRef = userRef.collection('transactions').doc();
  const category = classifyReceiptCategory(receipt, parsed);
  const txDoc = {
    type: parsed.source === 'kakaopay' ? 'transfer_out' : 'card_payment',
    amount: Math.abs(Math.round(Number(receipt.amount) || 0)),
    occurredAt: receipt.occurredAt?.toDate ? receipt.occurredAt : Timestamp.fromDate(normalizeDate(receipt.occurredAt)),
    merchant: receipt.merchant || parsed.merchant || null,
    counterparty: parsed.source === 'kakaopay' ? receipt.merchant || parsed.merchant || null : null,
    accountId: null,
    category: category?.category || null,
    subcategory: category?.subcategory || null,
    confidence: category?.confidence || 0.72,
    needsReview: category ? false : true,
    autoCategorySource: category?.source || null,
    rawMessageIds: [],
    receiptIds: [receiptId],
    receiptId,
    memo: buildReceiptMemo(receipt, parsed) || null,
    receiptItemSummary: buildReceiptMemo(receipt, parsed) || null,
    body: null,
    source: 'gmail',
    createdAt: FieldValue.serverTimestamp(),
  };

  const db = userRef.firestore;
  const batch = db.batch();
  batch.set(receiptRef, {
    ...receipt,
    matchedTxId: txRef.id,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(txRef, txDoc);
  await batch.commit();
  return txRef.id;
}

async function updateTransactionCategoryFromReceipt(txRef, receipt, parsed) {
  const snap = await txRef.get();
  if (!snap.exists) return;
  const txData = snap.data();
  const patch = {
    ...receiptLinkPatch(receipt.id, txData),
    ...transactionCategoryPatch(receipt, parsed, txData),
  };
  if (!Object.keys(patch).length) return;
  await txRef.update({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function receiptClassificationFields({ parsed }) {
  const category = classifyReceiptCategory(parsed, parsed);
  return category ? {
    category: category.category,
    subcategory: category.subcategory,
    autoCategorySource: category.source,
  } : {};
}

function receiptLinkPatch(receiptId, txData = {}) {
  const link = receiptLinkIds(receiptId, txData);
  const patch = {};
  if (link.arrayUnionIds.length) patch.receiptIds = FieldValue.arrayUnion(...link.arrayUnionIds);
  if (link.receiptId) patch.receiptId = link.receiptId;
  return patch;
}

function receiptLinkIds(receiptId, txData = {}) {
  const id = String(receiptId || '').trim();
  if (!id) return { arrayUnionIds: [], receiptId: '' };
  const legacyId = String(txData.receiptId || '').trim();
  const currentIds = Array.isArray(txData.receiptIds)
    ? txData.receiptIds.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  const arrayUnionIds = [legacyId, id]
    .filter(Boolean)
    .filter(value => !currentIds.includes(value))
    .filter((value, index, values) => values.indexOf(value) === index);
  return {
    arrayUnionIds,
    receiptId: legacyId ? '' : id,
  };
}

function transactionCategoryPatch(receipt, parsed, txData = {}) {
  const category = classifyReceiptCategory(receipt, parsed);
  const currentCategory = txData.category || null;
  const currentSubcategory = txData.subcategory || null;
  const patch = {};
  if (category) {
    const canSetCategory = isBlankOrCoupangAliasCategory(currentCategory);
    const canSetSubcategory = !currentSubcategory
      && (isBlankOrCoupangAliasCategory(currentCategory) || currentCategory === category.category);
    if (canSetCategory) patch.category = category.category;
    if (canSetSubcategory && category.subcategory) patch.subcategory = category.subcategory;
  }
  const receiptMemo = buildReceiptMemo(receipt, parsed);
  if (receiptMemo) {
    patch.memo = mergeReceiptMemo(txData.memo, receiptMemo);
    patch.receiptItemSummary = receiptMemo;
  }
  if (Object.keys(patch).length) {
    patch.needsReview = false;
    if (category) {
      patch.confidence = Math.max(Number(txData.confidence) || 0, category.confidence);
      patch.autoCategorySource = category.source;
    }
  }
  return patch;
}

function buildReceiptMemo(receipt = {}, parsed = {}) {
  const items = Array.isArray(receipt.items) && receipt.items.length
    ? receipt.items
    : Array.isArray(parsed.items) ? parsed.items : [];
  if (!items.length) return '';
  const merchant = parsed.merchant || receipt.merchant || '영수증';
  const rows = items.slice(0, 12).map(item => {
    const qty = Math.max(1, Math.round(Number(item?.qty) || 1));
    const price = Math.max(0, Math.round(Number(item?.price) || 0));
    const amount = price * qty;
    return `- ${item?.name || '품목'}${qty > 1 ? ` x${qty}` : ''}${amount ? ` ${amount.toLocaleString('ko-KR')}원` : ''}`;
  });
  const suffix = items.length > 12 ? `\n- 외 ${items.length - 12}개` : '';
  return `[${merchant} 영수증]\n${rows.join('\n')}${suffix}`;
}

function mergeReceiptMemo(current, receiptMemo) {
  const existing = String(current || '').trim();
  if (!existing) return receiptMemo;
  if (existing.includes(receiptMemo)) return existing;
  const header = String(receiptMemo || '').split('\n')[0]?.trim();
  if (header && existing.includes(header)) return replaceReceiptMemoSection(existing, header, receiptMemo);
  return `${existing}\n\n${receiptMemo}`;
}

function replaceReceiptMemoSection(existing, header, receiptMemo) {
  const parts = existing.split(/\n{2,}/);
  const index = parts.findIndex(part => part.trim().startsWith(header));
  if (index < 0) return `${existing}\n\n${receiptMemo}`;
  parts[index] = receiptMemo;
  return parts.map(part => part.trim()).filter(Boolean).join('\n\n');
}

function classifyReceiptCategory(receipt = {}, parsed = {}) {
  const source = normalizeText(parsed.source || receipt.source);
  const merchant = normalizeText(parsed.merchant || receipt.merchant);
  const text = `${source} ${merchant}`;
  if (/coupangeats|쿠팡이츠/.test(text)) return null;
  if (!(source === 'coupang' || /쿠팡/.test(merchant))) return null;
  const items = Array.isArray(receipt.items) && receipt.items.length
    ? receipt.items
    : Array.isArray(parsed.items) ? parsed.items : [];
  const subcategory = classifyCoupangSubcategory(items);
  return {
    category: COUPANG_CATEGORY,
    subcategory,
    confidence: subcategory ? 0.86 : 0.78,
    source: subcategory ? 'gmail_receipt_items' : 'gmail_receipt_merchant',
  };
}

function isBlankOrCoupangAliasCategory(value) {
  return !value || value === UNCATEGORIZED || value === '생활용품';
}

function classifyCoupangSubcategory(items = []) {
  const scores = items.reduce((acc, item) => {
    const name = normalizeText(item?.name);
    const amount = Math.max(1, Math.round((Number(item?.price) || 0) * (Number(item?.qty) || 1)));
    if (isFoodItem(name)) acc.food += amount;
    else if (isDailyGoodsItem(name)) acc.goods += amount;
    else acc.unknown += amount;
    return acc;
  }, { food: 0, goods: 0, unknown: 0 });
  const known = scores.food + scores.goods;
  if (!known) return '생활용품';
  if (scores.food >= known * 0.6 || scores.food > scores.goods * 1.25) return '식재료비';
  return '생활용품';
}

function isFoodItem(text) {
  return /(쌀|현미|잡곡|햇반|밥|라면|면|국수|파스타|식품|간식|과자|초콜릿|우유|요거트|치즈|계란|달걀|닭가슴살|닭|돼지|소고기|한우|육포|참치|연어|고등어|만두|냉동|김치|반찬|샐러드|채소|야채|과일|사과|바나나|토마토|고구마|감자|양파|마늘|고추장|된장|간장|소스|올리브유|오일|커피|차|티백|음료|생수|탄산수|프로틴|단백질)/.test(text);
}

function isDailyGoodsItem(text) {
  return /(휴지|물티슈|키친타월|세제|섬유유연제|샴푸|린스|트리트먼트|바디워시|비누|치약|칫솔|구강|면도|화장지|청소|쓰레기|봉투|주방세제|수세미|랩|호일|지퍼백|건전지|전구|필터|방향제|탈취제|수건|타월|양말|마스크|위생|소독|로션|선크림|화장솜|면봉)/.test(text);
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

async function findMatchingTransaction(userRef, amount, occurredAt, receipt = {}) {
  const start = new Date(occurredAt.getTime() - MATCH_WINDOW_MS);
  const end = new Date(occurredAt.getTime() + MATCH_WINDOW_MS);
  const [snap, originalSnap] = await Promise.all([
    userRef.collection('transactions')
    .where('amount', '==', amount)
    .limit(50)
      .get(),
    userRef.collection('transactions')
      .where('sharedPayment.originalAmount', '==', amount)
      .limit(50)
      .get(),
  ]);
  const docsById = new Map([...snap.docs, ...originalSnap.docs].map(doc => [doc.id, doc]));
  const candidates = [...docsById.values()];
  const exactTimeMatch = candidates.find(doc => {
    const value = doc.data()?.occurredAt;
    const txDate = value?.toDate ? value.toDate() : normalizeDate(value);
    return txDate && txDate >= start && txDate <= end;
  });
  if (exactTimeMatch) return exactTimeMatch;

  const androidReceiptMatch = selectAndroidReceiptFallbackDoc(candidates, occurredAt, receipt);
  if (androidReceiptMatch) return androidReceiptMatch;

  if (!isCoupangReceiptDoc(receipt)) return null;
  const dayStart = new Date(occurredAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(occurredAt);
  dayEnd.setHours(23, 59, 59, 999);
  return candidates.find(doc => {
    const data = doc.data() || {};
    const txDate = data.occurredAt?.toDate ? data.occurredAt.toDate() : normalizeDate(data.occurredAt);
    if (!txDate || txDate < dayStart || txDate > dayEnd) return false;
    const party = normalizeText([data.merchant, data.counterparty].filter(Boolean).join(' '));
    return !party || /쿠팡|coupang/.test(party);
  }) || null;
}

function selectAndroidReceiptFallbackDoc(candidates, occurredAt, receipt = {}) {
  const rows = candidates.map(doc => ({ id: doc.id, doc, data: doc.data() || {} }));
  return selectAndroidReceiptFallbackRow(rows, occurredAt, receipt)?.doc || null;
}

function selectAndroidReceiptFallbackRow(rows, occurredAt, receipt = {}) {
  if (!hasReceiptItems(receipt)) return null;
  const receiptDate = normalizeDate(occurredAt);
  const scored = rows
    .map(row => scoreAndroidReceiptCandidate(row, receiptDate, receipt))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.distanceMs - b.distanceMs);

  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].partyScore <= 0) return null;
  if (scored[1] && scored[0].score === scored[1].score) return null;
  return scored[0].row;
}

function scoreAndroidReceiptCandidate(row, receiptDate, receipt = {}) {
  const data = row?.data || {};
  if (data.hidden) return null;
  if (!['card_payment', 'transfer_out'].includes(data.type)) return null;
  if (!isAndroidCaptureTransaction(data)) return null;
  const receiptAmount = Math.abs(Math.round(Number(receipt.amount) || 0));
  const txAmount = Math.abs(Math.round(Number(data.amount) || 0));
  const sharedAmount = Math.abs(Math.round(Number(data.sharedPayment?.originalAmount) || 0));
  if (receiptAmount && txAmount !== receiptAmount && sharedAmount !== receiptAmount) return null;

  const txDate = data.occurredAt?.toDate ? data.occurredAt.toDate() : normalizeDate(data.occurredAt);
  if (!txDate || kstDateKey(txDate) !== kstDateKey(receiptDate)) return null;

  const distanceMs = Math.abs(txDate.getTime() - receiptDate.getTime());
  const partyScore = receiptPartyScore(data, receipt);
  let score = 10 + partyScore;
  if (data.source === 'android_local_sms') score += 4;
  else if (data.source === 'android_local_notification') score += 3;
  if (!Array.isArray(data.receiptIds) || data.receiptIds.length === 0) score += 2;
  if (!data.receiptId) score += 1;
  if (distanceMs <= 3 * 60 * 60 * 1000) score += 3;
  else if (distanceMs <= 6 * 60 * 60 * 1000) score += 2;
  else if (distanceMs <= 12 * 60 * 60 * 1000) score += 1;

  return { row, score, partyScore, distanceMs };
}

function receiptPartyScore(txData = {}, receipt = {}) {
  const receiptParty = normalizeText([receipt.merchant, receipt.source].filter(Boolean).join(' '));
  const txParty = normalizeText([
    txData.merchant,
    txData.counterparty,
    txData.actualMerchant,
    txData.body,
  ].filter(Boolean).join(' '));
  if (!receiptParty || !txParty) return 0;
  if (receiptParty === txParty || receiptParty.includes(txParty) || txParty.includes(receiptParty)) return 6;
  if (isCoupangReceiptDoc(receipt) && /쿠팡|coupang/.test(txParty)) return 5;
  return 0;
}

function isAndroidCaptureTransaction(tx = {}) {
  return tx.source === 'android_local_sms'
    || tx.source === 'android_local_notification'
    || !!tx.androidCaptureId
    || !!tx.rawNotification;
}

function hasReceiptItems(receipt = {}) {
  return Array.isArray(receipt.items) && receipt.items.length > 0;
}

function kstDateKey(value) {
  const date = normalizeDate(value);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function isCoupangReceiptDoc(receipt = {}) {
  return normalizeText(receipt.source) === 'coupang' || /쿠팡/.test(normalizeText(receipt.merchant));
}

function isGenericMerchant(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return GENERIC_MERCHANTS.some(name => text === name.toLowerCase() || text.includes(name.toLowerCase()));
}

function normalizeDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export const __receiptEnricherTestHooks = {
  buildReceiptMemo,
  mergeReceiptMemo,
  receiptLinkIds,
  transactionCategoryPatch,
  selectAndroidReceiptFallbackRow,
  kstDateKey,
};
