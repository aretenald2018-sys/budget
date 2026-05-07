// ================================================================
// utils/market-data.js — portfolio tracks and market quote helpers
// ================================================================

import { hasServerApi } from './runtime.js?v=20260505-github-pages';

export const ASSET_TRACKS = [
  {
    id: 'jeonse',
    name: '전세금',
    role: '회수예정금액',
    desc: '수익률을 만들기보다 회수 가능성을 지키는 자산',
    principal: 50000000,
    currentValue: 50000000,
    holdings: [],
  },
  {
    id: 'conviction',
    name: '국내/해외주식',
    role: '적극 증식 · 신념 투자',
    desc: '세부 종목을 연결하기 전까지는 현재 평가액 기준으로 봅니다',
    principal: 32000000,
    currentValue: 32000000,
    holdings: [
      { symbol: '069500.KS', name: 'KODEX 200', market: 'KR', weight: 0.35 },
      { symbol: 'QQQ', name: 'Nasdaq 100 대표', market: 'US', weight: 0.65 },
    ],
  },
  {
    id: 'irp',
    name: '퇴직연금 IRP',
    role: '연금 계좌 운용',
    desc: '나스닥·미국채 혼합 액티브와 나스닥 축',
    principal: 0,
    currentValue: 0,
    holdings: [
      { symbol: '438100.KS', name: 'ACE 미국나스닥100미국채혼합50액티브', market: 'KR', weight: 0.7 },
      { symbol: '379810.KS', name: 'KODEX 미국나스닥100TR', market: 'KR', weight: 0.3 },
    ],
  },
  {
    id: 'all-weather',
    name: '올웨더 실험',
    role: '분산 포트폴리오',
    desc: '미국국채, 금, 나스닥 ETF 조합의 실험 트랙',
    principal: 0,
    currentValue: 0,
    holdings: [
      { symbol: 'TLT', name: '미국 장기국채', market: 'US', weight: 0.4 },
      { symbol: 'GLD', name: '금', market: 'US', weight: 0.3 },
      { symbol: 'QQQ', name: 'Nasdaq ETF', market: 'US', weight: 0.3 },
    ],
  },
];

const CACHE_KEY = 'budget_market_quotes_v1';
const CACHE_TIME_KEY = 'budget_market_quotes_time_v1';
const CACHE_HOURS = 12;

export function marketSymbols(tracks = ASSET_TRACKS) {
  return [...new Set(tracks
    .flatMap(track => track.holdings || [])
    .map(item => normalizeQuoteSymbol(item.symbol, item.market))
    .filter(isQuoteableSymbol))];
}

export async function fetchUsdKrwOnDate(date) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : 'latest';
  const url = normalized === 'latest'
    ? 'https://api.frankfurter.dev/v1/latest?from=USD&to=KRW'
    : `https://api.frankfurter.dev/v1/${normalized}?from=USD&to=KRW`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fx ${res.status}`);
  const data = await res.json();
  return Number(data.rates?.KRW) || 0;
}

export async function loadMarketQuotes(symbols = marketSymbols()) {
  const quoteSymbols = [...new Set((symbols || []).filter(isQuoteableSymbol))];
  const cached = readMarketCache();
  if (cached && quoteSymbols.every(sym => cached.quotes?.[sym])) return cached;
  if (!quoteSymbols.length) {
    const fx = await fetchUsdKrwViaBrowser().catch(() => cached?.fx || 1450);
    return { quotes: {}, fx, updatedAt: new Date().toISOString(), source: '시세 조회 대상 없음' };
  }
  try {
    const endpoint = marketQuotesEndpoint();
    if (!endpoint) throw new Error('static host has no market quotes API');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: quoteSymbols }),
    });
    if (!res.ok) throw new Error(`market quotes ${res.status}`);
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || 'market quotes failed');
    const payload = {
      quotes: data.quotes || {},
      fx: Number(data.fx?.USDKRW) || 0,
      updatedAt: data.updatedAt || new Date().toISOString(),
      source: data.source || 'Yahoo Finance',
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    return payload;
  } catch (err) {
    console.warn('[market-quotes:api-fallback]', err);
    try {
      const quotes = await fetchQuotesViaBrowser(quoteSymbols);
      const fx = await fetchUsdKrwViaBrowser().catch(() => cached?.fx || 1450);
      const payload = { quotes, fx, updatedAt: new Date().toISOString(), source: 'Yahoo Finance proxy' };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
      return payload;
    } catch (proxyErr) {
      console.warn('[market-quotes:proxy-fallback]', proxyErr);
      return cached || { quotes: {}, updatedAt: null, source: '시세 연결 대기' };
    }
  }
}

function isQuoteableSymbol(symbol) {
  const raw = String(symbol || '').trim();
  if (!raw) return false;
  if (/^(UST|GOLD|BOND|CASH|ASSET|UNKNOWN|ETF|STOCK)-/i.test(raw)) return false;
  if (/[가-힣]/.test(raw)) return false;
  return /^[A-Z0-9.^=_-]+(\.[A-Z]+)?$/i.test(raw);
}

function marketQuotesEndpoint() {
  return hasServerApi() ? '/api/market-quotes' : '';
}

async function fetchQuotesViaBrowser(symbols) {
  const entries = await Promise.all(symbols.map(async (symbol) => {
    try {
      return [symbol, await fetchYahooProxyQuote(symbol)];
    } catch (err) {
      return [symbol, { symbol, error: err.message }];
    }
  }));
  return Object.fromEntries(entries);
}

async function fetchYahooProxyQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const data = await proxyFetchJson(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`${symbol} quote missing`);
  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => Number.isFinite(Number(v)));
  const price = Number(meta.regularMarketPrice ?? closes.at(-1) ?? 0);
  const previousClose = Number(meta.chartPreviousClose ?? closes.at(-2) ?? price);
  const changePct = previousClose ? (price - previousClose) / previousClose * 100 : 0;
  return {
    symbol,
    currency: meta.currency || '',
    exchangeName: meta.exchangeName || '',
    regularMarketTime: meta.regularMarketTime || null,
    price,
    previousClose,
    changePct: Number(changePct.toFixed(2)),
  };
}

async function proxyFetchJson(url) {
  const proxies = [
    value => `https://corsproxy.io/?${encodeURIComponent(value)}`,
    value => `https://api.allorigins.win/raw?url=${encodeURIComponent(value)}`,
  ];
  for (const build of proxies) {
    try {
      const res = await fetch(build(url));
      if (res.ok) return await res.json();
    } catch {}
  }
  throw new Error('all quote proxies failed');
}

export function readMarketCache() {
  const last = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
  if (!last || Date.now() - last > CACHE_HOURS * 3600000) return null;
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function portfolioSnapshot(tracks = ASSET_TRACKS, quotes = {}) {
  const rows = tracks.map(track => trackSnapshot(track, quotes));
  return portfolioTotals(rows);
}

export function portfolioSnapshotWithFx(tracks = ASSET_TRACKS, market = {}) {
  const rows = tracks.map(track => trackSnapshot(track, market.quotes || {}, Number(market.fx) || 1450));
  return portfolioTotals(rows);
}

function portfolioTotals(rows) {
  const totalPrincipal = rows.reduce((sum, row) => sum + row.principal, 0);
  const totalValue = rows.reduce((sum, row) => sum + row.currentValue, 0);
  const operatingRows = rows.filter(row => !isNonOperatingAsset(row));
  const operatingPrincipal = operatingRows.reduce((sum, row) => sum + row.principal, 0);
  const operatingValue = operatingRows.reduce((sum, row) => sum + row.currentValue, 0);
  const operatingProfit = operatingValue - operatingPrincipal;
  const totalProfit = totalValue - totalPrincipal;
  const operatingReturnPct = operatingPrincipal ? operatingProfit / operatingPrincipal * 100 : 0;
  return {
    rows,
    totalPrincipal,
    totalValue,
    totalProfit,
    operatingPrincipal,
    operatingValue,
    operatingProfit,
    operatingReturnPct,
  };
}

function isNonOperatingAsset(row) {
  const text = `${row.id || ''} ${row.name || ''} ${row.role || ''} ${row.desc || ''}`.toLowerCase();
  return /jeonse|전세|보증금|회수예정/.test(text);
}

function trackSnapshot(track, quotes, currentFx = 1450) {
  const holdings = (track.holdings || []).map(item => {
    const quoteSymbol = normalizeQuoteSymbol(item.symbol, item.market);
    return holdingSnapshot(item, quotes[item.symbol] || quotes[quoteSymbol], currentFx);
  });
  const holdingCost = holdings.reduce((sum, item) => sum + item.costKRW, 0);
  const holdingValue = holdings.reduce((sum, item) => sum + item.currentValueKRW, 0);
  const weightedHoldings = holdings.map(item => ({
    ...item,
    portfolioWeight: holdingValue ? item.currentValueKRW / holdingValue * 100 : null,
  }));
  const principal = holdingCost || Number(track.principal) || 0;
  const currentValue = holdingValue || Number(track.currentValue) || principal;
  const profit = currentValue - principal;
  const returnPct = principal ? profit / principal * 100 : null;
  return {
    ...track,
    holdings: weightedHoldings,
    principal,
    currentValue,
    profit,
    returnPct,
    dailyChangePct: weightedHoldingChange(weightedHoldings),
    quoteReady: (track.holdings || []).some(item => quotes[item.symbol]),
  };
}

function holdingSnapshot(item, quote, currentFx) {
  const qty = Number(item.quantity ?? item.qty) || 0;
  const avgPrice = Number(item.avgPrice) || 0;
  const snapshotValueKRW = Number(item.currentValueKRW) || 0;
  const snapshotPrincipalKRW = Number(item.principalKRW) || 0;
  const currency = item.currency || quote?.currency || (String(item.market || '').toUpperCase() === 'US' ? 'USD' : 'KRW');
  const avgFx = Number(item.avgFx) || (currency === 'USD' ? currentFx : 1);
  const quotePrice = Number(quote?.price) || 0;
  const price = quotePrice || Number(item.currentPrice) || avgPrice;
  const fxNow = currency === 'USD' ? currentFx : 1;
  const avgPriceMode = normalizeAvgPriceMode(item.avgPriceMode)
    || inferAvgPriceMode({ item, avgPrice, price, qty, currency, fxNow, hasPurchaseFx: Number(item.avgFx) > 0 });
  const calculatedCostKRW = holdingCostKRW({ qty, avgPrice, avgFx, avgPriceMode });
  const costKRW = correctedBondSnapshotKRW(snapshotPrincipalKRW, calculatedCostKRW, avgPriceMode) || calculatedCostKRW;
  const liveValueKRW = qty && quotePrice ? holdingValueKRW({ qty, price: quotePrice, fx: fxNow, avgPriceMode }) : 0;
  const calculatedValueKRW = qty && price ? holdingValueKRW({ qty, price, fx: fxNow, avgPriceMode }) : 0;
  const performanceValueKRW = valueFromStoredPerformance(costKRW, item);
  const correctedSnapshotValueKRW = correctedSnapshotValue(snapshotValueKRW, performanceValueKRW, costKRW, avgPriceMode, calculatedValueKRW);
  const currentValueKRW = liveValueKRW || correctedSnapshotValueKRW || performanceValueKRW || calculatedValueKRW;
  const fxPnL = currency === 'USD' && ['USD_UNIT', 'BOND_PRICE_100'].includes(avgPriceMode) && qty && avgPrice
    ? holdingValueKRW({ qty, price: avgPrice, fx: fxNow - avgFx, avgPriceMode })
    : 0;
  const pricePnL = avgPriceMode === 'KRW_UNIT' || avgPriceMode === 'TOTAL_KRW'
    ? currentValueKRW - costKRW
    : (qty && avgPrice && price ? holdingValueKRW({ qty, price: price - avgPrice, fx: fxNow, avgPriceMode }) : 0);
  return {
    ...item,
    quantity: qty,
    avgPrice,
    avgPriceUnit: ['USD_UNIT', 'BOND_PRICE_100'].includes(avgPriceMode) ? 'USD' : 'KRW',
    avgPriceMode,
    avgFx,
    currency,
    quote,
    currentPrice: price,
    currentFx: fxNow,
    costKRW,
    currentValueKRW,
    profitKRW: currentValueKRW - costKRW,
    returnPct: costKRW ? (currentValueKRW - costKRW) / costKRW * 100 : null,
    fxPnL,
    pricePnL,
  };
}

function holdingCostKRW({ qty, avgPrice, avgFx, avgPriceMode }) {
  if (!avgPrice) return 0;
  if (avgPriceMode === 'TOTAL_KRW') return Math.round(avgPrice);
  if (!qty) return 0;
  if (avgPriceMode === 'BOND_PRICE_100') return Math.round(qty * (avgPrice / 100) * avgFx);
  if (avgPriceMode === 'KRW_UNIT') return Math.round(qty * avgPrice);
  return Math.round(qty * avgPrice * avgFx);
}

function holdingValueKRW({ qty, price, fx, avgPriceMode }) {
  if (!qty || !price) return 0;
  if (avgPriceMode === 'BOND_PRICE_100') return Math.round(qty * (price / 100) * fx);
  return Math.round(qty * price * fx);
}

function correctedBondSnapshotKRW(snapshotKRW, calculatedKRW, avgPriceMode) {
  if (avgPriceMode !== 'BOND_PRICE_100') return snapshotKRW;
  if (!snapshotKRW || !calculatedKRW) return snapshotKRW;
  const ratio = snapshotKRW / calculatedKRW;
  if (ratio > 50 && ratio < 150) return calculatedKRW;
  return snapshotKRW;
}

function correctedSnapshotValue(snapshotKRW, performanceKRW, costKRW, avgPriceMode, calculatedKRW) {
  const bondCorrected = correctedBondSnapshotKRW(snapshotKRW, calculatedKRW, avgPriceMode);
  if (!bondCorrected || !performanceKRW || !costKRW) return bondCorrected;
  const snapshotReturnPct = (bondCorrected - costKRW) / costKRW * 100;
  const performanceReturnPct = (performanceKRW - costKRW) / costKRW * 100;
  if (snapshotReturnPct < -90 && Math.abs(performanceReturnPct) < 90) return performanceKRW;
  return bondCorrected;
}

function valueFromStoredPerformance(costKRW, item = {}) {
  if (!costKRW) return 0;
  const profitKRW = Number(item.profitKRW);
  const returnPct = Number(item.returnPct);
  if (Number.isFinite(profitKRW) && profitKRW) {
    const valueKRW = Math.max(0, Math.round(costKRW + profitKRW));
    const profitReturnPct = (valueKRW - costKRW) / costKRW * 100;
    if (profitReturnPct > -95 || !Number.isFinite(returnPct)) return valueKRW;
  }
  if (Number.isFinite(returnPct) && Math.abs(returnPct) < 95) {
    return Math.max(0, Math.round(costKRW * (1 + returnPct / 100)));
  }
  return 0;
}

function normalizeQuoteSymbol(symbol, market = '') {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return '';
  if (/^\d{6}\.(KS|KQ)$/.test(raw)) return raw;
  const compactKr = raw.match(/^(\d{6})(KS|KQ)$/);
  if (compactKr) return `${compactKr[1]}.${compactKr[2]}`;
  if (String(market || '').toUpperCase() === 'KR' && /^\d{6}$/.test(raw)) return `${raw}.KS`;
  return raw;
}

function normalizeAvgPriceMode(mode) {
  const raw = String(mode || '').trim().toUpperCase();
  return ['TOTAL_KRW', 'KRW_UNIT', 'USD_UNIT', 'BOND_PRICE_100'].includes(raw) ? raw : '';
}

function inferAvgPriceMode({ item, avgPrice, price, qty, currency, fxNow, hasPurchaseFx }) {
  if (isTreasuryBondHolding(item) && currency === 'USD') return 'BOND_PRICE_100';
  if (!avgPrice || !price) return currency === 'USD' ? 'USD_UNIT' : 'KRW_UNIT';
  if (currency !== 'USD') {
    if (qty > 1 && avgPrice > price * 10) return 'TOTAL_KRW';
    return 'KRW_UNIT';
  }
  const impliedKrwPrice = price * fxNow;
  if (impliedKrwPrice && avgPrice > price * 10 && avgPrice > impliedKrwPrice * 0.2) {
    if (qty > 1 && avgPrice > impliedKrwPrice * 1.5) return 'TOTAL_KRW';
    return 'KRW_UNIT';
  }
  if (hasPurchaseFx) return 'USD_UNIT';
  return 'USD_UNIT';
}

function isTreasuryBondHolding(item = {}) {
  const text = [
    item.symbol,
    item.name,
    item.assetClass,
    item.exchange,
    item.type,
  ].filter(Boolean).join(' ').toLowerCase();
  return /^ust-\d{4}-\d{2}-\d{2}$/i.test(String(item.symbol || ''))
    || /(미국\s*국채|us\s*treasury|treasury\s*bond)/i.test(text);
}

async function fetchUsdKrwViaBrowser() {
  const res = await fetch('https://api.frankfurter.dev/v1/latest?from=USD&to=KRW');
  if (!res.ok) throw new Error('fx failed');
  const data = await res.json();
  return Number(data.rates?.KRW) || 1450;
}

function weightedHoldingChange(holdings) {
  const quoted = holdings
    .filter(item => item.quote && Number.isFinite(Number(item.quote.changePct)));
  const totalWeight = quoted.reduce((sum, item) => sum + (Number(item.currentValueKRW) || 0), 0);
  if (!totalWeight) return null;
  return quoted.reduce((sum, item) => sum + Number(item.quote.changePct) * (Number(item.currentValueKRW) || 0), 0) / totalWeight;
}

function weightedAverage(rows, valueKey, weightKey) {
  const ready = rows.filter(row => Number.isFinite(Number(row[valueKey])) && Number(row[weightKey]) > 0);
  const totalWeight = ready.reduce((sum, row) => sum + Number(row[weightKey]), 0);
  if (!totalWeight) return null;
  return ready.reduce((sum, row) => sum + Number(row[valueKey]) * Number(row[weightKey]), 0) / totalWeight;
}
