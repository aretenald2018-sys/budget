export const COUPANG_RECEIPT_CATEGORY = '생활비용';
export const DEFAULT_UNCATEGORIZED_RECEIPT_CATEGORY = '미분류';

const DEFAULT_GENERIC_MERCHANTS = [
  '쿠팡이츠',
  '배달의민족',
  '배민',
  'coupangeats',
  'baemin',
];

const FOOD_ITEM_RE = /(쌀|현미|잡곡|햇반|밥|라면|면|국수|파스타|식품|간식|과자|초콜릿|우유|요거트|치즈|계란|달걀|닭가슴살|닭|돼지|소고기|한우|육포|참치|연어|고등어|만두|냉동|김치|반찬|샐러드|채소|야채|과일|사과|바나나|토마토|고구마|감자|양파|마늘|고추장|된장|간장|소스|올리브유|오일|커피|차|티백|음료|생수|탄산수|프로틴|단백질)/;
const DAILY_GOODS_ITEM_RE = /(휴지|물티슈|키친타월|세제|섬유유연제|샴푸|린스|트리트먼트|바디워시|비누|치약|칫솔|구강|면도|화장지|청소|쓰레기|봉투|주방세제|수세미|랩|호일|지퍼백|건전지|전구|필터|방향제|탈취제|수건|타월|양말|마스크|위생|소독|로션|선크림|화장솜|면봉)/;

export function normalizeReceiptText(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

export function receiptItems(receipt = {}, parsed = {}) {
  if (Array.isArray(receipt.items) && receipt.items.length) return receipt.items;
  return Array.isArray(parsed.items) ? parsed.items : [];
}

export function classifyReceiptCategory(receipt = {}, parsed = {}) {
  const source = normalizeReceiptText(parsed.source || receipt.source);
  const merchant = normalizeReceiptText(parsed.merchant || receipt.merchant);
  const text = `${source} ${merchant}`;
  if (/coupangeats|쿠팡이츠/.test(text)) return null;
  if (!(source === 'coupang' || /쿠팡/.test(merchant))) return null;
  const subcategory = classifyCoupangSubcategory(receiptItems(receipt, parsed));
  return {
    category: COUPANG_RECEIPT_CATEGORY,
    subcategory,
    confidence: subcategory ? 0.86 : 0.78,
    source: subcategory ? 'gmail_receipt_items' : 'gmail_receipt_merchant',
  };
}

export function classifyCoupangSubcategory(items = []) {
  const scores = items.reduce((acc, item) => {
    const name = normalizeReceiptText(item?.name);
    const amount = Math.max(1, Math.round((Number(item?.price) || 0) * (Number(item?.qty) || 1)));
    if (FOOD_ITEM_RE.test(name)) acc.food += amount;
    else if (DAILY_GOODS_ITEM_RE.test(name)) acc.goods += amount;
    else acc.unknown += amount;
    return acc;
  }, { food: 0, goods: 0, unknown: 0 });
  const known = scores.food + scores.goods;
  if (!known) return '생활용품';
  if (scores.food >= known * 0.6 || scores.food > scores.goods * 1.25) return '식재료비';
  return '생활용품';
}

export function buildReceiptMemo(receipt = {}, parsed = {}) {
  const items = receiptItems(receipt, parsed);
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

export function mergeReceiptMemo(current, receiptMemo, options = {}) {
  const existing = String(current || '').trim();
  if (!existing) return receiptMemo;
  if (existing.includes(receiptMemo)) return existing;
  const header = String(receiptMemo || '').split('\n')[0]?.trim();
  if (header && existing.includes(header)) {
    if (options.replaceExistingSection === false) return existing;
    return replaceReceiptMemoSection(existing, header, receiptMemo);
  }
  return `${existing}\n\n${receiptMemo}`;
}

export function isBlankOrCoupangAliasCategory(value, uncategorized = DEFAULT_UNCATEGORIZED_RECEIPT_CATEGORY) {
  return !value || value === uncategorized || value === '생활용품';
}

export function isGenericReceiptMerchant(value, merchants = DEFAULT_GENERIC_MERCHANTS) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return merchants.some(name => text === name.toLowerCase() || text.includes(name.toLowerCase()));
}

function replaceReceiptMemoSection(existing, header, receiptMemo) {
  const parts = existing.split(/\n{2,}/);
  const index = parts.findIndex(part => part.trim().startsWith(header));
  if (index < 0) return `${existing}\n\n${receiptMemo}`;
  parts[index] = receiptMemo;
  return parts.map(part => part.trim()).filter(Boolean).join('\n\n');
}
