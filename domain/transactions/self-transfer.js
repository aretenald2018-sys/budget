// Shared exclusion rules for transactions that should not count as spending.

export const SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON = 'self_transfer_toss_kim_taewoo';
export const CARD_SETTLEMENT_EXCLUDE_REASON = 'credit_card_settlement';

const TOSS_KIM_TAEWOO_KEY = '토스김태우';
const CARD_SETTLEMENT_KEYS = Object.freeze([
  '현대카드',
  '하나카드',
  '하나sk카드',
  '신한카드',
  '삼성카드',
  '롯데카드',
  '국민카드',
  'kb국민카드',
  '우리카드',
  '농협카드',
  'nh농협카드',
  '비씨카드',
  'bc카드',
  '기업카드',
  'ibk기업카드',
  '씨티카드',
]);
const CARD_SETTLEMENT_PHRASES = Object.freeze([
  '카드대금',
  '카드결제대금',
  '카드이용대금',
  '신용카드대금',
]);
const INVISIBLE_CHARS_RE = /[\u200B-\u200D\uFEFF\u2066-\u2069]/g;
const JOINER_CHARS_RE = /[\s_\-.,·ㆍ()[\]{}<>［］（）]/g;

export function normalizeSelfTransferText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS_RE, '')
    .replace(JOINER_CHARS_RE, '')
    .toLowerCase();
}

export function isTossKimTaewooSelfTransfer(tx = {}) {
  if (tx?.type !== 'transfer_out') return false;
  return [
    tx.merchant,
    tx.counterparty,
    tx.memo,
    tx.body,
    tx.rawBody,
    tx.sourceDetail,
  ].some(value => normalizeSelfTransferText(value).includes(TOSS_KIM_TAEWOO_KEY));
}

export function applyTossKimTaewooSelfTransferExclusion(tx = {}) {
  if (!isTossKimTaewooSelfTransfer(tx)) return tx;
  return {
    ...tx,
    excludedFromBudget: true,
    excludeFromBudget: true,
    excludeReason: tx?.excludeReason || SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON,
  };
}

export function isCardSettlementTransfer(tx = {}) {
  if (tx?.type !== 'transfer_out') return false;

  const partyTexts = [tx.merchant, tx.counterparty]
    .map(normalizeSelfTransferText)
    .filter(Boolean);
  const detailTexts = [
    ...partyTexts,
    normalizeSelfTransferText(tx.memo),
    normalizeSelfTransferText(tx.body),
    normalizeSelfTransferText(tx.rawBody),
    normalizeSelfTransferText(tx.sourceDetail),
    normalizeSelfTransferText(tx.reason),
    normalizeSelfTransferText(tx.rawNotification?.title),
    normalizeSelfTransferText(tx.rawNotification?.text),
    normalizeSelfTransferText(tx.rawNotification?.bigText),
  ].filter(Boolean);

  if (detailTexts.some(text => (
    CARD_SETTLEMENT_KEYS.some(key => text.includes(key))
    || CARD_SETTLEMENT_PHRASES.some(phrase => text.includes(phrase))
  ))) return true;

  // Keep future card issuers covered when the transfer recipient itself is a concise card-company name.
  return partyTexts.some(text => text.length <= 20 && text.endsWith('카드'));
}

export function applyCardSettlementExclusion(tx = {}) {
  if (!isCardSettlementTransfer(tx)) return tx;
  return {
    ...tx,
    excludedFromBudget: true,
    excludeFromBudget: true,
    excludeReason: tx?.excludeReason || CARD_SETTLEMENT_EXCLUDE_REASON,
  };
}

export function applyAutomaticSpendingExclusions(tx = {}) {
  return applyCardSettlementExclusion(applyTossKimTaewooSelfTransferExclusion(tx));
}
