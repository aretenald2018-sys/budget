// ================================================================
// domain/transactions/refunds.js — 환불은 수입이 아니라 '되돌린 지출'이다 (순수 함수)
//
// 예전 동작: 카드 취소·환불 문자를 transfer_in(수입)으로 저장했다.
//   · 3만원을 쓰고 환불받으면 지출 3만 + 수입 3만이 남아 지출 총액이 부풀었다
//   · 수입 항목에 쇼핑몰 이름이 섞여 수입 통계도 오염됐다
//
// 새 동작: 환불은 원래 지출에 표시를 남긴다.
//   · 원 거래에 refundedAt 을 찍는다 → 목록에서 취소선, 총지출에서 제외
//   · 별도의 + 항목을 만들지 않는다
//   · 원 거래를 못 찾으면 그 환불 건 자체를 '이미 취소된 지출'로 넣어 눈에는
//     보이되 총액에는 안 들어가게 한다(사용자가 나중에 연결할 수 있게)
// ================================================================

const DAY_MS = 24 * 60 * 60 * 1000;

// 원 거래를 찾을 때 거슬러 올라가는 기간. 카드 취소는 보통 며칠 안에 들어온다.
export const REFUND_MATCH_WINDOW_DAYS = 60;

export function isRefunded(tx = {}) {
  return !!tx.refundedAt;
}

function txTime(tx = {}) {
  const raw = tx.occurredAt;
  if (!raw) return NaN;
  const date = raw?.toDate ? raw.toDate() : new Date(raw);
  const time = date.getTime();
  return Number.isNaN(time) ? NaN : time;
}

function merchantKey(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/^\((주|유|재|사)\)/, '')
    .toLowerCase();
}

// 환불 건과 원 지출이 같은 결제인가 — 가맹점과 금액이 같고 기간 안에 있으면 본다.
export function isRefundMatch(refund, candidate, windowDays = REFUND_MATCH_WINDOW_DAYS) {
  if (!refund || !candidate) return false;
  if (isRefunded(candidate)) return false;                       // 이미 환불 처리됨
  if (candidate.type !== 'card_payment' && candidate.type !== 'transfer_out') return false;
  if (Math.round(Number(refund.amount) || 0) !== Math.round(Number(candidate.amount) || 0)) return false;

  const refundMerchant = merchantKey(refund.merchant || refund.counterparty);
  const candidateMerchant = merchantKey(candidate.merchant || candidate.counterparty);
  if (!refundMerchant || !candidateMerchant) return false;
  if (refundMerchant !== candidateMerchant) return false;

  const refundTime = txTime(refund);
  const candidateTime = txTime(candidate);
  if (Number.isNaN(refundTime) || Number.isNaN(candidateTime)) return false;
  if (candidateTime > refundTime) return false;                  // 환불이 결제보다 앞설 수 없다
  return refundTime - candidateTime <= windowDays * DAY_MS;
}

// 후보 중 원 거래를 고른다 — 조건에 맞는 것 중 가장 최근 결제.
export function findRefundTarget(refund, candidates = [], windowDays = REFUND_MATCH_WINDOW_DAYS) {
  let best = null;
  let bestTime = -Infinity;
  for (const candidate of candidates) {
    if (!isRefundMatch(refund, candidate, windowDays)) continue;
    const time = txTime(candidate);
    if (time > bestTime) { best = candidate; bestTime = time; }
  }
  return best;
}

// 환불 문자를 어떻게 반영할지 결정한다.
//   { action: 'mark', targetId, patch }  — 원 거래에 취소선을 긋는다
//   { action: 'orphan', patch }          — 원 거래를 못 찾았다. 취소된 지출로 넣는다
export function planRefund(refund, candidates = [], options = {}) {
  const windowDays = Number(options.windowDays) || REFUND_MATCH_WINDOW_DAYS;
  const refundedAt = options.refundedAt || new Date().toISOString();
  const target = findRefundTarget(refund, candidates, windowDays);
  if (target) {
    return {
      action: 'mark',
      targetId: target.id,
      patch: {
        refundedAt,
        refundAmount: Math.round(Number(refund.amount) || 0),
        refundSource: refund.androidCaptureId || refund.source || 'manual',
      },
    };
  }
  return {
    action: 'orphan',
    patch: {
      // 지출로 넣되 곧바로 환불 표시를 달아 총액에는 들어가지 않게 한다.
      type: 'card_payment',
      refundedAt,
      refundAmount: Math.round(Number(refund.amount) || 0),
      refundSource: refund.androidCaptureId || refund.source || 'manual',
      needsReview: true,
      memo: '환불 문자 — 원 결제를 찾지 못했어요',
    },
  };
}
