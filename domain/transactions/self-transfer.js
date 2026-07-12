// Shared exclusion rules for transactions that should not count as spending.

export const SELF_TRANSFER_TOSS_KIM_TAEWOO_REASON = 'self_transfer_toss_kim_taewoo';

const TOSS_KIM_TAEWOO_KEY = '토스김태우';
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
