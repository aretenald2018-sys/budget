const SHARED_PAYMENT_MIN_AMOUNT = 20000;
const SHARED_PAYMENT_KEYWORDS = [
  '카페',
  '커피',
  'cafe',
  'coffee',
  '스타벅스',
  '투썸',
  '이디야',
  '메가커피',
  '컴포즈',
  '스마트파이브',
];

export function normalizeSharedPaymentParty(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

export function sameSharedPaymentParty(a, b, options = {}) {
  const left = normalizeSharedPaymentParty(a);
  const right = normalizeSharedPaymentParty(b);
  if (!left || !right) return options.allowBlank !== false;
  return left === right || left.includes(right) || right.includes(left);
}

export function isShareablePayment(tx = {}) {
  return tx.type === 'card_payment' && !tx.sharedPayment;
}

export function shouldSuggestSharedPayment(tx = {}) {
  if (!isShareablePayment(tx)) return false;
  if ((Number(tx.amount) || 0) < SHARED_PAYMENT_MIN_AMOUNT) return false;
  const text = normalizeSharedPaymentParty([
    tx.category,
    tx.merchant,
    tx.counterparty,
    tx.body,
  ].filter(Boolean).join(' '));
  return SHARED_PAYMENT_KEYWORDS.some(keyword => text.includes(normalizeSharedPaymentParty(keyword)));
}

export function applySharedPaymentRule(tx = {}, peopleCount, ruleMeta = {}, options = {}) {
  const count = Math.max(2, Math.round(Number(peopleCount) || 2));
  const originalAmount = Number(tx.sharedPayment?.originalAmount || tx.amount) || 0;
  const myAmount = Math.max(1, Math.round(originalAmount / count));
  const appliedAt = options.appliedAt || new Date().toISOString();
  return {
    ...tx,
    amount: myAmount,
    needsSharedReview: false,
    sharedPayment: {
      status: 'applied',
      originalAmount,
      peopleCount: count,
      myAmount,
      appliedAt,
      ...ruleMeta,
    },
  };
}

export function markSharedPaymentSuggested(tx = {}) {
  if (!shouldSuggestSharedPayment(tx)) return tx;
  return { ...tx, needsReview: true, needsSharedReview: true };
}
