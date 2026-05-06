import { searchLocalMarketSymbols } from '../utils/market-symbol-catalog.js';

const MODEL = 'gemini-flash-latest';

const SYSTEM_PROMPT = `You parse Korean brokerage/bank portfolio screenshots into JSON only.

Output schema:
{
  "asOf": "YYYY-MM-DD|null",
  "groupName": "string|null",
  "summary": {"currentValueKRW": number|null, "returnPct": number|null},
  "positions": [
    {
      "name": "string",
      "broker": "string|null",
      "quantity": number|null,
      "currentValueKRW": number,
      "profitKRW": number|null,
      "returnPct": number|null,
      "assetClass": "etf"|"bond"|"gold"|"stock"|"cash"|"unknown",
      "trackHint": "irp"|"all-weather"|"conviction"|"deposit"|"unknown",
      "confidence": number
    }
  ]
}

Rules:
- Extract visible portfolio rows only. Ignore totals unless they are in summary.
- Korean amounts are KRW. Remove commas and 원.
- Red positive values are positive profit. Blue negative values are negative profit.
- If return amount and return pct differ across duplicate-looking rows, do not create extra rows.
- If quantity is visible, extract it. If quantity is not visible, use null and do not invent quantity.
- Return JSON only.`;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const image = body?.imageBase64 || body?.image || '';
  const mimeType = body?.mimeType || 'image/jpeg';
  if (!image) return res.status(400).json({ error: 'imageBase64 필요' });

  try {
    const parsed = await callGeminiImageJSON(image, mimeType);
    return res.status(200).json({ ok: true, parsed: normalizeParsed(parsed) });
  } catch (err) {
    console.error('[asset-image-parse]', err);
    return res.status(500).json({ error: err.message });
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function callGeminiImageJSON(imageBase64, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY env 미설정');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
      contents: [{
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT },
          { inline_data: { mime_type: mimeType, data: stripDataUrl(imageBase64) } },
        ],
      }],
    }),
  });
  const data = await upstream.json();
  if (!upstream.ok || data.error) throw new Error(data.error?.message || `Gemini ${upstream.status}`);
  return cleanJSON(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
}

function normalizeParsed(parsed = {}) {
  const positions = Array.isArray(parsed.positions) ? parsed.positions : [];
  return {
    asOf: normalizeDate(parsed.asOf),
    groupName: parsed.groupName ? String(parsed.groupName).trim() : null,
    summary: {
      currentValueKRW: money(parsed.summary?.currentValueKRW),
      returnPct: pct(parsed.summary?.returnPct),
    },
    positions: positions.map(normalizePosition).filter(item => item.name && item.currentValueKRW > 0),
  };
}

function normalizePosition(item = {}) {
  const name = String(item.name || '').replace(/\s+/g, ' ').trim();
  const match = searchLocalMarketSymbols(name, 1)[0] || null;
  const market = inferMarketFromMatch(match);
  const currentValueKRW = money(item.currentValueKRW);
  const profitKRW = item.profitKRW == null ? null : signedMoney(item.profitKRW);
  const returnPct = item.returnPct == null ? null : pct(item.returnPct);
  const principalKRW = inferPrincipal(currentValueKRW, profitKRW, returnPct);
  const quantity = positiveNumber(item.quantity ?? item.qty ?? item.shares ?? item.units);
  return {
    name,
    symbol: match?.symbol || makeSyntheticSymbol(name, item.assetClass),
    broker: item.broker ? String(item.broker).trim() : '',
    market,
    currency: market === 'US' ? 'USD' : 'KRW',
    quantity,
    currentValueKRW,
    profitKRW,
    returnPct,
    principalKRW,
    avgPrice: principalKRW,
    quantity: 1,
    assetClass: normalizeAssetClass(item.assetClass, name),
    trackHint: normalizeTrackHint(item.trackHint, name),
    source: 'asset-screenshot',
    confidence: clamp(Number(item.confidence) || 0.75, 0, 1),
  };
}

function inferMarketFromMatch(match) {
  if (!match) return 'KR';
  const symbol = String(match.symbol || '').toUpperCase();
  const exchange = String(match.exchange || '').toUpperCase();
  if (/(\.KS|\.KQ)$/.test(symbol) || /^(KSC|KOE|KOSPI|KOSDAQ|KRX|KOREA|SEOUL)$/.test(exchange)) return 'KR';
  return 'US';
}

function inferPrincipal(currentValue, profit, returnPct) {
  if (currentValue > 0 && Number.isFinite(profit)) return Math.max(0, Math.round(currentValue - profit));
  if (currentValue > 0 && Number.isFinite(returnPct) && returnPct > -99.9) {
    return Math.max(0, Math.round(currentValue / (1 + returnPct / 100)));
  }
  return currentValue;
}

function normalizeAssetClass(value, name) {
  const text = `${value || ''} ${name || ''}`.toLowerCase();
  if (/금|gold/.test(text)) return 'gold';
  if (/국채|채권|bond|treasury|rp/.test(text)) return 'bond';
  if (/etf|tiger|ace|kodex|나스닥|s&p/.test(text)) return 'etf';
  if (/주식|stock|equity/.test(text)) return 'stock';
  if (/현금|cash/.test(text)) return 'cash';
  return 'unknown';
}

function normalizeTrackHint(value, name) {
  const text = `${value || ''} ${name || ''}`.toLowerCase();
  if (/irp|퇴직|연금|하나/.test(text)) return 'irp';
  if (/올웨더|금|gold|국채/.test(text)) return 'all-weather';
  if (/전세|보증금/.test(text)) return 'deposit';
  if (/주식|나스닥|tiger|ace|kodex/.test(text)) return 'conviction';
  return 'unknown';
}

function makeSyntheticSymbol(name, assetClass) {
  const slug = String(name || 'ASSET')
    .toUpperCase()
    .replace(/[^A-Z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${String(assetClass || 'ASSET').toUpperCase()}-${slug || 'UNKNOWN'}`;
}

function money(value) {
  return Math.max(0, Math.round(Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0));
}

function positiveNumber(value) {
  const n = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function signedMoney(value) {
  return Math.round(Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0);
}

function pct(value) {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeDate(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function stripDataUrl(value) {
  return String(value || '').replace(/^data:[^;]+;base64,/, '');
}

function cleanJSON(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(s);
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
