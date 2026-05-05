// ================================================================
// client-parse.js — 브라우저가 pending raw_messages를 서버 Gemini 프록시로 파싱
// ================================================================

import {
  getAccounts, getCategories, listPendingMailboxRawMessagesById,
  markMailboxRawMessageParsedById, markMailboxRawMessageSkippedById, saveTransaction,
  findSimilarTransaction, linkRawMessageToTransaction,
} from './data.js';
import { hasServerApi } from './utils/runtime.js?v=20260505-github-pages';

const SYSTEM_PROMPT = `당신은 한국 결제·이체 메시지를 구조화된 JSON으로 변환하는 파서입니다.

## 출력 (반드시 JSON 배열, 입력 순서와 동일한 길이)
각 항목:
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

확실하지 않으면 category=null + needsReview=true.
JSON 배열만 출력.`;

export function getClientParseSettings() {
  return { configured: true };
}

export function saveClientParseSettings() {
  return true;
}

export async function processPendingRawMessages({ max = 20 } = {}) {
  const { mailboxId } = await fetchClientConfig();

  const rawMessages = await listPendingMailboxRawMessagesById(mailboxId, max);
  if (rawMessages.length === 0) return { processed: 0, txCreated: 0, skipped: 0, failed: 0 };

  const results = await parseBatchInBrowser(rawMessages, getAccounts(), getCategories());
  let txCreated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < results.length; i++) {
    const { rawId, parsed, error } = results[i];
    const raw = rawMessages[i];

    if (error || !parsed) {
      await markMailboxRawMessageSkippedById(mailboxId, rawId, error || '파싱 실패');
      failed++;
      continue;
    }

    if (parsed.type === 'skip') {
      await markMailboxRawMessageSkippedById(mailboxId, rawId, parsed.reason || '결제 외 메시지');
      skipped++;
      continue;
    }

    const txPayload = {
      type: parsed.type,
      amount: Math.abs(Number(parsed.amount) || 0),
      occurredAt: normalizeOccurredAt(parsed.occurredAt, raw.receivedAt),
      merchant: parsed.merchant || null,
      counterparty: parsed.counterparty || null,
      accountId: parsed.accountId || null,
      category: parsed.category || null,
      confidence: Number(parsed.confidence) || 0,
      needsReview: !!parsed.needsReview || (Number(parsed.confidence) || 0) < 0.7,
      rawMessageIds: [rawId],
      receiptIds: [],
      body: raw.body,
      source: raw.source,
    };
    const existingTx = await findSimilarTransaction(txPayload);
    const txId = existingTx?.id || await saveTransaction(txPayload);
    if (existingTx) await linkRawMessageToTransaction(existingTx.id, rawId);
    await markMailboxRawMessageParsedById(mailboxId, rawId, txId);
    txCreated++;
  }

  return { processed: rawMessages.length, txCreated, skipped, failed };
}

async function fetchClientConfig() {
  if (!hasServerApi()) {
    const err = new Error('static host has no /api routes');
    err.code = 'API_UNAVAILABLE';
    throw err;
  }
  const res = await fetch('/api/client-config');
  const data = await readJsonOrApiUnavailable(res, '설정 API');
  if (!res.ok || data.error) throw new Error(data.error || `설정 API 실패 (${res.status})`);
  if (!data.mailboxId) throw new Error('mailboxId 없음');
  return data;
}

async function parseBatchInBrowser(rawMessages, accounts, categories) {
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

## 메시지 (${rawMessages.length}개)
입력 순서대로 같은 길이의 JSON 배열로 응답.

${rawMessages.map((m, i) => `[${i}] source=${m.source}${m.app ? ` app=${m.app}` : ''} sender=${m.sender || ''}
body: ${m.body}`).join('\n\n')}`;

  const parsed = await callServerParser(SYSTEM_PROMPT, userPrompt, 4096);

  if (!Array.isArray(parsed)) {
    return rawMessages.map(m => ({ rawId: m.id, parsed: null, error: 'non-array response' }));
  }

  return rawMessages.map((m, i) => {
    const result = parsed[i];
    if (!result) return { rawId: m.id, parsed: null, error: 'missing result' };
    return { rawId: m.id, parsed: enrichParsed(result, accounts, categories) };
  });
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

async function callServerParser(systemPrompt, userPrompt, maxTokens) {
  if (!hasServerApi()) {
    const err = new Error('static host has no /api routes');
    err.code = 'API_UNAVAILABLE';
    throw err;
  }
  const res = await fetch('/api/client-parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, userPrompt, maxTokens }),
  });
  const data = await readJsonOrApiUnavailable(res, '파싱 API');
  if (!res.ok || data.error) {
    const err = new Error(data.error || `파싱 API 실패 (${res.status})`);
    err.code = data.code || (res.status === 429 ? 'AI_QUOTA_EXCEEDED' : undefined);
    err.status = res.status;
    err.retryAfterMs = Number(data.retryAfterMs) || 0;
    throw err;
  }
  return data.parsed;
}

async function readJsonOrApiUnavailable(res, label) {
  const contentType = String(res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    const err = new Error(`${label} 사용 불가 (${res.status})`);
    err.code = 'API_UNAVAILABLE';
    err.status = res.status;
    err.bodyHead = text.slice(0, 80);
    throw err;
  }
  return res.json();
}

function normalizeOccurredAt(value, fallback) {
  const fallbackDate = fallback?.toDate ? fallback.toDate() : new Date(fallback || Date.now());
  if (!value) return fallbackDate;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallbackDate : date;
}
