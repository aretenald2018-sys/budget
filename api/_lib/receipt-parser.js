import { callGeminiJSON } from './gemini.js';

const SYSTEM_PROMPT = `You convert Korean payment receipt emails into one JSON object.

Output schema:
{
  "source": "kakaopay" | "baemin" | "coupangeats" | "coupang" | "unknown",
  "merchant": string | null,
  "amount": number,
  "occurredAt": string,
  "items": [{"name": string, "qty": number, "price": number}],
  "skip": boolean,
  "skipReason": string | null
}

Rules:
- source must identify KakaoPay, Baemin, Coupang Eats, Coupang shopping, or unknown.
- merchant is the real restaurant/store name. For KakaoPay, use the counterparty name.
- amount is the final consumer-paid amount as a positive integer. Do not double count delivery fee.
- occurredAt prefers payment/order time in the email. If missing, use emailDate. Use "YYYY-MM-DDTHH:MM:SS+09:00".
- items are receipt line items. Use unit price when quantity is available. KakaoPay money transfer receipts should use [].
- skip=true for marketing, non-payment emails, emails without amount, and unrelated messages.
- Return JSON only.`;

export async function parseReceiptEmail(emailText, emailDate) {
  const deterministic = parseKnownReceipt(emailText, emailDate);
  if (deterministic) return deterministic;

  const userPrompt = `emailDate=${toKstIso(emailDate)}

Email text:
${emailText}`;
  const parsed = await callGeminiJSON(SYSTEM_PROMPT, userPrompt, 2048);
  return normalizeParsed(parsed, emailDate);
}

function parseKnownReceipt(emailText, emailDate) {
  const text = String(emailText || '');
  if (isKnownNonReceipt(text)) {
    return {
      source: 'unknown',
      merchant: null,
      amount: 0,
      occurredAt: toKstIso(emailDate),
      items: [],
      skip: true,
      skipReason: 'known non-payment notification',
    };
  }
  if (isCoupangReceipt(text)) return parseCoupangReceipt(text, emailDate);
  if (isEasyPayReceipt(text)) return parseEasyPayReceipt(text, emailDate);
  if (isKcpReceipt(text)) return parseKcpReceipt(text, emailDate);
  return null;
}

function isKnownNonReceipt(text) {
  return /쿠팡/.test(text)
    && /(로그인|인증번호|인증 코드|비밀번호|이메일 주소|계정|보안 알림|변경)/.test(text)
    && !hasCoupangPaymentSignal(text);
}

function isCoupangReceipt(text) {
  return /쿠팡/.test(text)
    && /(구매하신\s*내역|주문하신\s*내역|구매내역|구매\s*상세내역|결제\s*정보|총\s*결제금액|주문(?:이)?\s*완료|결제\s*완료|쿠페이)/.test(text)
    && /(총\s*결제금액|결제\s*금액|구매\s*금액|상품\s*가격|쿠페이(?:\(카드\))?\s*\/\s*일시불)/.test(text);
}

function hasCoupangPaymentSignal(text) {
  return /(총\s*결제금액|결제\s*금액|구매\s*금액|상품\s*가격|결제\s*정보|구매\s*상세내역|구매하신\s*내역|주문하신\s*내역|주문(?:이)?\s*완료|결제\s*완료|쿠페이)/.test(text);
}

function isEasyPayReceipt(text) {
  return /(이지페이|한국정보통신|easypay)/i.test(text)
    && /(결제하신 내역|결제정보|결제일시|상품금액)/.test(text)
    && /([\d,]+)\s*원/.test(text);
}

function isKcpReceipt(text) {
  return /(NHN\s*KCP|KCP|pgadmcust|쿠팡\(쿠페이\))/i.test(text)
    && /(결제하신 내역|결제 내역|결제금액|주문상품명)/.test(text)
    && /결제금액\s*([\d,]+)\s*원/.test(text);
}

function parseCoupangReceipt(text, emailDate) {
  const amount = extractWon(text, /총\s*결제금액\s*([\d,]+)\s*원/)
    || extractWon(text, /쿠페이\(카드\)\s*\/\s*일시불\s*([\d,]+)\s*원/)
    || extractWon(text, /결제\s*금액\s*([\d,]+)\s*원/)
    || extractWon(text, /구매\s*금액\s*([\d,]+)\s*원/)
    || extractWon(text, /상품\s*가격\s*([\d,]+)\s*원/);

  const items = extractCoupangItems(text);
  const fallbackItem = items.length ? '' : extractCoupangFallbackItem(text);
  if (fallbackItem && amount > 0) {
    items.push({ name: fallbackItem, qty: 1, price: amount });
  }
  return {
    source: 'coupang',
    merchant: '쿠팡',
    amount,
    occurredAt: toKstIso(emailDate),
    items,
    skip: amount <= 0,
    skipReason: amount <= 0 ? 'amount missing' : null,
  };
}

function extractCoupangItems(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const items = [];
  const startIndex = lines.findIndex(line => line === '구매 상세내역');
  const endIndex = lines.findIndex((line, index) => index > startIndex && line === '결제 정보');

  if (startIndex >= 0 && endIndex > startIndex) {
    const detailLines = lines
      .slice(startIndex + 1, endIndex)
      .filter(line => !['쿠팡가', '수량', '구매금액', '판매자'].includes(line));

    for (let i = 0; i < detailLines.length - 3; i++) {
      const name = detailLines[i];
      const unitPrice = parseWonLine(detailLines[i + 1]);
      const qty = Number(detailLines[i + 2]);
      const totalPrice = parseWonLine(detailLines[i + 3]);
      if (name && unitPrice > 0 && Number.isFinite(qty) && qty > 0 && totalPrice > 0) {
        items.push({
          name,
          qty: Math.max(1, Math.round(qty)),
          price: unitPrice,
        });
        i += 4;
      }
    }
  }

  for (const line of lines) {
    const compact = line.replace(/\s+/g, ' ');
    if (/^(구매 상세내역|쿠팡가|수량|구매금액|판매자|결제 정보|상품 가격|배송비|총 결제금액)/.test(compact)) continue;

    const row = compact.match(/^(.+?)\s+([\d,]+)\s*원\s+(\d+)\s+([\d,]+)\s*원(?:\s+.+)?$/);
    if (row) {
      items.push({
        name: row[1].trim(),
        qty: Math.max(1, Math.round(Number(row[3]) || 1)),
        price: parseWon(row[2]),
      });
      continue;
    }

    const fallback = compact.match(/^(.+?),?\s+([\d,]+)\s*원$/);
    if (fallback && !/결제|배송|상품\s*가격/.test(fallback[1])) {
      items.push({ name: fallback[1].trim(), qty: 1, price: parseWon(fallback[2]) });
    }
  }

  return dedupeItems(items).slice(0, 30);
}

function extractCoupangFallbackItem(text) {
  return cleanCoupangItemName(
    extractTextBetween(text, /(?:상품명|주문상품명|구매상품명)\s+/, /\s+(?:결제\s*(?:일시|금액|정보)|배송|주문번호|상점정보|구매상점명|총\s*결제금액|$)/)
    || extractTextBetween(text, /(?:주문이\s*완료되었습니다|주문\s*완료|결제\s*완료|구매하신\s*내역|주문하신\s*내역)\s+/, /(?:^|\s)(?:결제\s*(?:금액|정보)|총\s*결제금액|배송|주문번호|$)/)
  );
}

function cleanCoupangItemName(value) {
  const text = String(value || '')
    .replace(/^(?:상품명|주문상품명|구매상품명)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(?:결제\s*금액|결제\s*정보|총\s*결제금액|배송|주문번호)/.test(text)) return '';
  if (!text || /^(쿠팡|결제|주문|배송|고객|안내)$/.test(text)) return '';
  return text.slice(0, 120);
}

function parseEasyPayReceipt(text, emailDate) {
  const amount = extractWon(text, /(?:상품금액|결제금액)\s*([\d,]+)\s*원/);
  const itemName = extractTextBetween(text, /상품명\s+/, /\s+결제일시/);
  return {
    source: /쿠팡/.test(text) ? 'coupang' : 'unknown',
    merchant: itemName || extractTextBetween(text, /상점명\s+/, /\s+(?:상품명|결제일시|대표자|사업자)/) || '카드 결제',
    amount,
    occurredAt: extractKoreanDateTime(text) || toKstIso(emailDate),
    items: itemName && amount ? [{ name: itemName, qty: 1, price: amount }] : [],
    skip: amount <= 0,
    skipReason: amount <= 0 ? 'amount missing' : null,
  };
}

function parseKcpReceipt(text, emailDate) {
  const amount = extractWon(text, /결제금액\s*([\d,]+)\s*원/);
  const itemName = extractTextBetween(text, /주문상품명\s+/, /\s+(?:상점정보|구매상점명|주문번호|할부기간|$)/);
  const storeName = extractTextBetween(text, /구매상점명\s+/, /\s+(?:주문상품명|주문번호|할부기간|$)/);
  return {
    source: /쿠팡/.test(text) ? 'coupang' : 'unknown',
    merchant: itemName || storeName || '카드 결제',
    amount,
    occurredAt: extractKoreanDateTime(text) || toKstIso(emailDate),
    items: itemName && amount ? [{ name: itemName, qty: 1, price: amount }] : [],
    skip: amount <= 0,
    skipReason: amount <= 0 ? 'amount missing' : null,
  };
}

function extractTextBetween(text, startPattern, endPattern) {
  const source = String(text || '').replace(/\s+/g, ' ');
  const start = source.match(startPattern);
  if (!start) return '';
  const rest = source.slice((start.index || 0) + start[0].length);
  const end = rest.search(endPattern);
  return (end >= 0 ? rest.slice(0, end) : rest).trim();
}

function extractKoreanDateTime(text) {
  const match = String(text || '').match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2})시\s*(\d{1,2})분/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00+09:00`;
}

function extractWon(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? parseWon(match[1]) : 0;
}

function parseWon(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d]/g, '')) || 0));
}

function parseWonLine(value) {
  return /원/.test(String(value || '')) ? parseWon(value) : 0;
}

function dedupeItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.name}|${item.qty}|${item.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeParsed(parsed, emailDate) {
  const amount = Math.abs(Math.round(Number(parsed.amount) || 0));
  const items = Array.isArray(parsed.items)
    ? parsed.items.map(normalizeItem).filter(item => item.name)
    : [];
  return {
    source: normalizeSource(parsed.source),
    merchant: parsed.merchant ? String(parsed.merchant).trim() : null,
    amount,
    occurredAt: parsed.occurredAt || toKstIso(emailDate),
    items,
    skip: !!parsed.skip || amount <= 0,
    skipReason: parsed.skipReason || parsed.reason || null,
  };
}

function normalizeItem(item) {
  return {
    name: item?.name ? String(item.name).trim() : '',
    qty: Math.max(1, Math.round(Number(item?.qty) || 1)),
    price: Math.max(0, Math.round(Number(item?.price) || 0)),
  };
}

function normalizeSource(source) {
  const value = String(source || '').toLowerCase();
  if (['kakaopay', 'baemin', 'coupangeats', 'coupang'].includes(value)) return value;
  return 'unknown';
}

function toKstIso(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.toISOString().slice(0, 19)}+09:00`;
}
