// ================================================================
// api/_lib/server-parser.js — raw message -> transaction parser
// ================================================================

import { callGeminiJSON } from './gemini.js';

const SYSTEM_PROMPT = `당신은 한국 결제·이체 메시지를 구조화된 JSON으로 변환하는 파서입니다.

## 출력 (반드시 JSON 객체)
{
  "type": "card_payment" | "transfer_out" | "transfer_in" | "settlement_in" | "settlement_out" | "skip",
  "amount": number,
  "occurredAt": string,
  "merchant": string|null,
  "counterparty": string|null,
  "accountKeyword": string|null,
  "category": string|null,
  "confidence": number,
  "needsReview": boolean,
  "reason": string
}

## 절대 규칙
1. 카카오페이로 보낸 돈/받은 돈은 settlement_out / settlement_in.
2. 카드 결제는 card_payment. amount는 결제금액 양수.
3. 은행 이체는 송금이면 transfer_out, 수금이면 transfer_in. 카카오페이 아닌 경우만.
4. 광고/스팸/결제 외 메시지는 skip.
5. 자동이체/CMS는 transfer_out.
6. 환불/취소는 card_payment + amount 양수, reason에 "환불" 명시.

## occurredAt 규칙 (매우 중요)
- 출력 형식: ISO 8601 ("YYYY-MM-DDTHH:MM:SS").
- 한국 알림/SMS의 시각은 Asia/Seoul(KST, UTC+09:00) 기준. 가능하면 "+09:00" 오프셋을 포함.
- **본문에 연도가 없으면 receivedAt 의 연도를 그대로 사용. 절대 임의의 연도를 추측하지 말 것.**
- 본문에 월/일이 없으면 receivedAt 의 월/일을 사용.
- 본문에 시각만 있고 날짜가 없으면 receivedAt 의 날짜에 그 시각을 결합.
- 결과는 receivedAt ±7일 이내여야 함. 그 밖이면 receivedAt 를 그대로 사용.
- 본문이 깨진 글자(예: ��, mojibake)면 needsReview=true 로 두고, occurredAt 은 receivedAt.

확실하지 않으면 category=null + needsReview=true.
JSON 객체만 출력.`;

export async function parseRawMessage(raw, accounts, categories) {
  const deterministic = parseKnownRawMessage(raw);
  if (deterministic) return enrichParsed(deterministic, accounts, categories);

  const accountsHint = accounts.map(a =>
    `- ${a.alias} (type=${a.type}${a.last4 ? `, last4=${a.last4}` : ''}): keywords=[${(a.matchKeywords || []).join(', ')}]`
  ).join('\n') || '(등록된 계좌 없음)';

  const categoryHint = categories.map(c =>
    `- ${c.name}: keywords=[${(c.autoMatch || []).join(', ')}]`
  ).join('\n') || '(등록된 카테고리 없음)';

  const userPrompt = `## 본인 계좌 목록
${accountsHint}

## 카테고리 목록
${categoryHint}

## 메시지
source=${raw.source}${raw.app ? ` app=${raw.app}` : ''} sender=${raw.sender || ''}
receivedAt=${raw.receivedAt instanceof Date ? raw.receivedAt.toISOString() : raw.receivedAt || ''}
body: ${raw.body}`;

  const parsed = await callGeminiJSON(SYSTEM_PROMPT, userPrompt, 2048);
  return enrichParsed(parsed, accounts, categories);
}

function parseKnownRawMessage(raw) {
  const text = normalizeMessageText(raw?.body);
  const card = parseKoreanCardApproval(text, raw?.receivedAt);
  if (card) return card;
  return null;
}

function parseKoreanCardApproval(text, receivedAt) {
  const match = text.match(/(승인|취소)\s+[^\n]*?([\d,]+)\s*원\s+(?:일시불|할부|체크)?\s*(\d{2})\/(\d{2})\s+(\d{1,2}):(\d{2})\s+(.+?)(?:\s+누적|\n|$)/);
  if (!match) return null;

  const action = match[1];
  const amount = parseWon(match[2]);
  const occurredAt = buildKstDateTime(receivedAt, match[3], match[4], match[5], match[6]);
  const merchant = cleanMerchant(match[7]);
  const accountKeyword = text.match(/([가-힣A-Za-z]+[\d*]{2,})\s*(?:승인|취소)/)?.[1] || null;
  if (!amount || !merchant) return null;

  return {
    type: 'card_payment',
    amount,
    occurredAt,
    merchant,
    counterparty: null,
    accountKeyword,
    category: null,
    confidence: 0.97,
    needsReview: false,
    reason: action === '취소' ? '카드 취소 문자' : '카드 승인 문자',
  };
}

function normalizeMessageText(value) {
  return String(value || '')
    .replace(/[\u2066-\u2069]/g, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parseWon(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d]/g, '')) || 0));
}

function buildKstDateTime(receivedAt, mm, dd, hh, min) {
  const base = receivedAt instanceof Date ? receivedAt : new Date(receivedAt || Date.now());
  const kst = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  return `${year}-${mm}-${dd}T${String(hh).padStart(2, '0')}:${min}:00+09:00`;
}

function cleanMerchant(value) {
  return String(value || '')
    .replace(/\s+누적[\d,]+원.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function enrichParsed(result, accounts, categories) {
  let accountId = null;
  if (result.accountKeyword && accounts.length) {
    const kw = String(result.accountKeyword).toLowerCase();
    const match = accounts.find(a => {
      const keys = [a.alias, a.issuer, a.last4, ...(a.matchKeywords || [])].filter(Boolean);
      return keys.some(k => kw.includes(String(k).toLowerCase()) || String(k).toLowerCase().includes(kw));
    });
    if (match) accountId = match.id;
  }

  let category = normalizeParsedCategory(result.category, categories);
  if (!category && result.merchant) {
    const merchantLow = String(result.merchant).toLowerCase();
    const cat = categories.find(c =>
      (c.autoMatch || []).some(kw => merchantLow.includes(String(kw).toLowerCase()))
    );
    if (cat) category = cat.name;
  }

  return { ...result, accountId, category };
}

function normalizeParsedCategory(value, categories) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const exact = categories.find(c => c.name === raw);
  if (exact) return exact.name;
  const normalized = raw.replace(/\s+/g, '').toLowerCase();
  const aliases = {
    생활용품: '생활비용',
    생필품: '생활비용',
    식재료비: '생활비용',
    식료품: '생활비용',
    장보기: '생활비용',
  };
  const mapped = aliases[normalized];
  return mapped && categories.some(c => c.name === mapped) ? mapped : null;
}
