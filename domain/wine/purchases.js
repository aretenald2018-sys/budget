// ================================================================
// domain/wine/purchases.js — 와인 기록 ↔ 결제 내역 ↔ 와인구매 포인트 (순수 함수)
//
// 와인 셀러는 지금까지 가계부와 완전히 분리돼 있었다. 이 모듈이 세 축을 잇는다.
//   1) 어떤 거래가 '와인 구매'로 보이는가 (카테고리/상세분류/가맹점 키워드)
//   2) 아직 셀러에 등록되지 않은 와인 결제는 무엇인가
//   3) 셀러가 보여줄 요약(이번 달 와인 지출·연결된 결제 합계)
// 포인트 자체는 domain/rewards/savings.js 의 winePurchase 버킷이 계산한다.
// ================================================================

export const WINE_POINT_BUCKET_KEY = 'winePurchase';

// 카테고리명이 이것 중 하나면 와인 결제 후보로 본다(시드 카테고리 '와인/야식').
const WINE_CATEGORY_HINTS = ['와인'];
// 가맹점명에 이 단어가 들어가면 카테고리와 무관하게 후보로 본다.
const WINE_MERCHANT_HINTS = ['와인', '바틀', '보틀', 'bottle', 'wine', '주류', '와인앤모어', '데일리샷'];

const EXPENSE_TYPES = ['card_payment', 'transfer_out'];

function textOf(tx) {
  return [tx?.merchant, tx?.counterparty, tx?.subcategory, tx?.memo]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function isWinePurchaseTx(tx, getCategoryName = item => item?.category || '') {
  if (!tx || !EXPENSE_TYPES.includes(tx.type)) return false;
  if (!(Number(tx.amount) > 0)) return false;
  const category = String(getCategoryName(tx) || '');
  if (WINE_CATEGORY_HINTS.some(hint => category.includes(hint))) return true;
  const text = textOf(tx);
  return WINE_MERCHANT_HINTS.some(hint => text.includes(hint.toLowerCase()));
}

export function wineTransactions(transactions = [], getCategoryName) {
  return (Array.isArray(transactions) ? transactions : [])
    .filter(tx => isWinePurchaseTx(tx, getCategoryName));
}

// 셀러에 아직 연결되지 않은 와인 결제 — "결제 내역에서 등록" 목록의 원천.
export function unlinkedWinePurchases(transactions = [], bottles = [], getCategoryName) {
  const linked = new Set(
    (Array.isArray(bottles) ? bottles : [])
      .map(bottle => String(bottle?.purchaseTxId || ''))
      .filter(Boolean)
  );
  return wineTransactions(transactions, getCategoryName)
    .filter(tx => !linked.has(String(tx.id)))
    .sort((a, b) => txTime(b) - txTime(a));
}

function txTime(tx) {
  const date = tx?.occurredAt?.toDate ? tx.occurredAt.toDate() : new Date(tx?.occurredAt);
  const time = date?.getTime?.();
  return Number.isNaN(time) ? 0 : time;
}

// 셀러 상단 요약. points 는 winePurchase 버킷(없으면 0).
export function buildWineCellarSummary({
  transactions = [],
  bottles = [],
  tastings = [],
  pointBuckets = [],
  getCategoryName,
} = {}) {
  const wineTxs = wineTransactions(transactions, getCategoryName);
  const spent = wineTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const linkedSpend = (Array.isArray(bottles) ? bottles : [])
    .reduce((sum, bottle) => sum + (Number(bottle?.pricePaid) || 0), 0);
  const bucket = (Array.isArray(pointBuckets) ? pointBuckets : [])
    .find(item => item?.key === WINE_POINT_BUCKET_KEY) || null;
  return {
    spent,
    purchaseCount: wineTxs.length,
    linkedSpend,
    unlinkedCount: unlinkedWinePurchases(transactions, bottles, getCategoryName).length,
    bottleCount: Array.isArray(bottles) ? bottles.length : 0,
    tastingCount: Array.isArray(tastings) ? tastings.length : 0,
    points: {
      balance: Math.round(Number(bucket?.monthPoints) || 0),
      earned: Math.round(Number(bucket?.earnedMonthPoints) || 0),
      spentPoints: Math.round(Number(bucket?.spentMonthPoints) || 0),
      target: Math.round(Number(bucket?.targetAmount) || 0),
      label: bucket?.label || '와인구매 포인트',
    },
  };
}

// 결제 한 건 → 와인 등록 폼 초기값.
export function bottleDraftFromTx(tx = {}) {
  const name = String(tx.merchant || tx.counterparty || '').trim();
  const date = tx?.occurredAt?.toDate ? tx.occurredAt.toDate() : new Date(tx?.occurredAt);
  return {
    name: name.slice(0, 120),
    pricePaid: Math.round(Number(tx.amount) || 0) || null,
    purchaseTxId: String(tx.id || '') || null,
    purchasedAt: Number.isNaN(date?.getTime?.()) ? null : date,
  };
}
