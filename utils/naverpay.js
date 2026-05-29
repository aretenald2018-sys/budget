const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function parseNaverPayAutoPaymentMessage(raw) {
  const body = typeof raw === 'object' && raw !== null ? raw.body : raw;
  const receivedAt = typeof raw === 'object' && raw !== null ? raw.receivedAt : null;
  const text = normalizeMessageText(body);
  if (!isNaverPayAutoPaymentMessage(text)) return null;

  const textWithoutUrl = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bnaver\.me\/\S+/gi, ' ');
  const amountMatches = [...textWithoutUrl.matchAll(/([\d,]+)\s*원/g)];
  const amountMatch = amountMatches[amountMatches.length - 1];
  const amount = parseWon(amountMatch?.[1]);
  if (!amount) return null;

  const merchant = extractNaverPayAutoPaymentMerchant(textWithoutUrl) || '네이버페이 자동결제';
  return {
    type: 'card_payment',
    amount,
    occurredAt: toKstIso(receivedAt),
    merchant,
    counterparty: null,
    accountKeyword: null,
    category: null,
    confidence: 0.96,
    needsReview: true,
    reason: '네이버페이 자동결제 문자',
    paymentRail: 'naverpay',
    paymentRailResolved: true,
    actualMerchant: merchant,
  };
}

export function isNaverPayAutoPaymentMessage(value) {
  return /네이버\s*페이\]?\s*자동\s*결제\s*안내/i.test(normalizeMessageText(value));
}

export function isNaverPayTopup(tx) {
  if (typeof tx === 'object' && tx !== null && tx.type && !['card_payment', 'transfer_out'].includes(tx.type)) {
    return false;
  }
  if (tx?.naverPayTopupMerged) return false;
  const text = compactTxText(tx);
  return /네이버페이.*충전|네이버pay.*충전|naverpay.*(?:topup|charge)/.test(text);
}

export function isNaverPayAutoPayment(tx) {
  const text = compactTxText(tx);
  return /네이버페이.*자동결제안내/.test(text)
    || (
      tx?.paymentRail === 'naverpay'
      && tx?.paymentRailResolved === true
      && !isNaverPayTopup(tx)
    );
}

export function isNaverPayRailTx(tx) {
  return isNaverPayTopup(tx) || isNaverPayAutoPayment(tx);
}

export function isNaverPayTopupPurchasePair(a, b) {
  if (!positiveAmount(a) || !positiveAmount(b)) return false;
  return (isNaverPayTopup(a) && isNaverPayAutoPayment(b))
    || (isNaverPayAutoPayment(a) && isNaverPayTopup(b));
}

export function buildNaverPayDuplicateMergePatch(existing, incoming) {
  if (!isNaverPayTopup(existing) || !isNaverPayAutoPayment(incoming)) return null;

  const merchant = incoming?.actualMerchant
    || incoming?.merchant
    || existing?.actualMerchant
    || existing?.merchant
    || existing?.counterparty
    || '네이버페이 자동결제';
  const patch = {
    type: incoming?.type || existing?.type || 'card_payment',
    amount: positiveAmount(incoming) || positiveAmount(existing),
    merchant,
    counterparty: incoming?.counterparty || null,
    paymentRail: 'naverpay',
    paymentRailResolved: true,
    actualMerchant: merchant,
    originalMerchant: existing?.originalMerchant || existing?.merchant || existing?.counterparty || null,
    naverPayTopupMerged: true,
    naverPayTopupAmount: positiveAmount(existing) || null,
    naverPayTopupType: existing?.type || null,
    confidence: Math.max(Number(existing?.confidence) || 0, Number(incoming?.confidence) || 0),
    needsReview: incoming?.needsReview ?? existing?.needsReview ?? true,
    body: incoming?.body || existing?.body || null,
    source: incoming?.source || existing?.source || null,
  };

  if (incoming?.accountId || existing?.accountId) patch.accountId = incoming?.accountId || existing?.accountId;
  if (incoming?.category || existing?.category) patch.category = incoming?.category || existing?.category;
  if (incoming?.subcategory || existing?.subcategory) patch.subcategory = incoming?.subcategory || existing?.subcategory;
  return compactObject(patch);
}

function extractNaverPayAutoPaymentMerchant(value) {
  const text = normalizeMessageText(value).replace(/\[Web발신\]/gi, '').trim();
  const match = text.match(/\[?\s*네이버\s*페이\s*\]?\s*자동\s*결제\s*안내\s+(.+?)\s+[\d,]+\s*원(?:\s|$)/i);
  if (!match) return '';
  return cleanMerchant(match[1]);
}

function cleanMerchant(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[·:,-]+|[·:,-]+$/g, '')
    .trim();
}

function compactTxText(tx) {
  if (typeof tx === 'string') return compactText(tx);
  return compactText([
    tx?.merchant,
    tx?.counterparty,
    tx?.actualMerchant,
    tx?.originalMerchant,
    tx?.memo,
    tx?.body,
    tx?.paymentRail,
    tx?.reason,
  ].filter(Boolean).join(' '));
}

function compactText(value) {
  return normalizeMessageText(value).replace(/\s+/g, '').toLowerCase();
}

function normalizeMessageText(value) {
  return String(value || '')
    .replace(/[\u2066-\u2069]/g, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}

function parseWon(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d]/g, '')) || 0));
}

function positiveAmount(tx) {
  return Math.abs(Math.round(Number(tx?.amount) || 0));
}

function toKstIso(value) {
  const date = normalizeDate(value) || new Date();
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return [
    kst.getUTCFullYear(),
    '-',
    pad(kst.getUTCMonth() + 1),
    '-',
    pad(kst.getUTCDate()),
    'T',
    pad(kst.getUTCHours()),
    ':',
    pad(kst.getUTCMinutes()),
    ':',
    pad(kst.getUTCSeconds()),
    '+09:00',
  ].join('');
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
