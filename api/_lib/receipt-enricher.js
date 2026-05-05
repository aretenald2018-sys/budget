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
    const match = await findMatchingTransaction(userRef, Number(receipt.amount) || 0, occurredAt);
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

  const match = await findMatchingTransaction(userRef, receiptDoc.amount, occurredAt);
  if (match) {
    const patch = {
      receiptIds: FieldValue.arrayUnion(receiptRef.id),
      updatedAt: FieldValue.serverTimestamp(),
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
    receiptIds: FieldValue.arrayUnion(receiptId),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (parsed.merchant && isGenericMerchant(receipt.merchant)) {
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
  const patch = transactionCategoryPatch(receipt, parsed, snap.data());
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

function transactionCategoryPatch(receipt, parsed, txData = {}) {
  const category = classifyReceiptCategory(receipt, parsed);
  if (!category) return {};
  const currentCategory = txData.category || null;
  const currentSubcategory = txData.subcategory || null;
  const canSetCategory = isBlankOrCoupangAliasCategory(currentCategory);
  const canSetSubcategory = !currentSubcategory
    && (isBlankOrCoupangAliasCategory(currentCategory) || currentCategory === category.category);
  const patch = {};
  if (canSetCategory) patch.category = category.category;
  if (canSetSubcategory && category.subcategory) patch.subcategory = category.subcategory;
  if (Object.keys(patch).length) {
    patch.needsReview = false;
    patch.confidence = Math.max(Number(txData.confidence) || 0, category.confidence);
    patch.autoCategorySource = category.source;
  }
  return patch;
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

async function findMatchingTransaction(userRef, amount, occurredAt) {
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
  return [...docsById.values()].find(doc => {
    const value = doc.data()?.occurredAt;
    const txDate = value?.toDate ? value.toDate() : normalizeDate(value);
    return txDate && txDate >= start && txDate <= end;
  }) || null;
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
