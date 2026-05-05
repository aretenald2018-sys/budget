// ================================================================
// api/market-quotes.js — Yahoo Finance daily close proxy
// ================================================================

const MAX_SYMBOLS = 30;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid JSON' }); }
  }
  const symbols = [...new Set((body?.symbols || [])
    .map(sym => String(sym || '').trim())
    .filter(isQuoteableSymbol))]
    .slice(0, MAX_SYMBOLS);
  if (!symbols.length) return res.status(400).json({ error: 'symbols 필요' });

  const quotes = {};
  await Promise.all(symbols.map(async (symbol) => {
    try {
      quotes[symbol] = await fetchYahooChart(symbol);
    } catch (err) {
      quotes[symbol] = { symbol, error: err.message };
    }
  }));

  const fx = await fetchUsdKrw().catch(() => null);
  return res.status(200).json({
    ok: true,
    source: 'Yahoo Finance chart',
    updatedAt: new Date().toISOString(),
    fx: fx ? { USDKRW: fx, source: 'Frankfurter' } : null,
    quotes,
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isQuoteableSymbol(symbol) {
  const raw = String(symbol || '').trim();
  if (!raw) return false;
  if (/^(UST|GOLD|BOND|CASH|ASSET|UNKNOWN|ETF|STOCK)-/i.test(raw)) return false;
  if (/[가-힣]/.test(raw)) return false;
  return /^[A-Z0-9.^=_-]+(\.[A-Z]+)?$/i.test(raw);
}

async function fetchYahooChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 budgetproject market quotes',
      'Accept': 'application/json',
    },
  });
  if (!response.ok) throw new Error(`quote ${response.status}`);
  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('quote missing');
  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => Number.isFinite(Number(v)));
  const close = Number(meta.regularMarketPrice ?? closes.at(-1) ?? 0);
  const previousClose = Number(meta.chartPreviousClose ?? closes.at(-2) ?? close);
  const changePct = previousClose ? (close - previousClose) / previousClose * 100 : 0;
  return {
    symbol,
    currency: meta.currency || '',
    exchangeName: meta.exchangeName || '',
    regularMarketTime: meta.regularMarketTime || null,
    price: close,
    previousClose,
    changePct: Number(changePct.toFixed(2)),
  };
}

async function fetchUsdKrw() {
  const response = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=KRW');
  if (!response.ok) throw new Error(`fx ${response.status}`);
  const data = await response.json();
  return Number(data.rates?.KRW) || null;
}
