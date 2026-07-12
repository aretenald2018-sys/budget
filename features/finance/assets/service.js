import { searchLocalMarketSymbols } from '../../../utils/market-symbol-catalog.js';
import { hasServerApi } from '../../../utils/runtime.js';

export async function parseAssetImage(dataUrl, mimeType, options = {}) {
  const serverAvailable = options.serverAvailable || hasServerApi;
  const post = options.post || postAssetImageParse;
  if (!serverAvailable()) throw new Error('GitHub Pages에서는 사진 분석 API를 사용할 수 없습니다');
  const res = await post('/api/asset-image-parse', { imageBase64: dataUrl, mimeType });
  if (!res.ok) {
    throw new Error(res.status === 404 || res.status === 501 ? '이미지 파싱 API에 연결할 수 없습니다' : `parse ${res.status}`);
  }
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '사진 분석 실패');
  return data.parsed || {};
}

export async function mergeParsedAssetPositions(parsed, assignments, assetTracks, saveAssetTrack) {
  const positions = Array.isArray(parsed.positions) ? parsed.positions : [];
  let added = 0;
  let skipped = 0;
  const trackMap = new Map(assetTracks.map(track => [track.id, { ...track, holdings: [...(track.holdings || [])] }]));
  for (const [index, position] of positions.entries()) {
    const assignedTrackId = assignments[String(index)] || '';
    const track = trackMap.get(assignedTrackId);
    if (!track) {
      skipped += 1;
      continue;
    }
    const holding = positionToHolding(position, parsed.asOf);
    if (isDuplicateHolding(track.holdings, holding)) {
      skipped += 1;
      continue;
    }
    track.holdings.push(holding);
    added += 1;
  }
  const changed = [...trackMap.values()].filter(track => {
    const original = assetTracks.find(item => item.id === track.id);
    return (original?.holdings || []).length !== track.holdings.length;
  });
  await Promise.all(changed.map(track => saveAssetTrack(track)));
  return { added, skipped };
}

export function pickTrackForPosition(position, tracks) {
  const hint = String(position.trackHint || '').toLowerCase();
  const hay = `${position.name || ''} ${position.broker || ''} ${position.assetClass || ''}`.toLowerCase();
  const scored = tracks.map(track => {
    const text = `${track.id || ''} ${track.name || ''} ${track.role || ''} ${track.desc || ''}`.toLowerCase();
    let score = 0;
    if (hint && text.includes(hint)) score += 20;
    if (/irp|퇴직|연금|하나/.test(hay) && /irp|퇴직|연금/.test(text)) score += 30;
    if (/금|gold|국채|채권|bond|treasury/.test(hay) && /올웨더|분산|국채|금/.test(text)) score += 18;
    if (/tiger|ace|kodex|나스닥|주식|etf/.test(hay) && /주식|투자|적극|conviction|irp/.test(text)) score += 12;
    return { track, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].track : tracks.find(track => track.id !== 'deposit') || tracks[0] || null;
}

export function positionToHolding(position, asOf) {
  const principal = Math.max(0, Math.round(Number(position.principalKRW) || Number(position.avgPrice) || 0));
  const currentValue = Math.max(0, Math.round(Number(position.currentValueKRW) || 0));
  const quantity = Math.max(0, Number(position.quantity ?? position.qty) || 0);
  const market = position.market === 'US' ? 'US' : 'KR';
  const currency = position.currency || (market === 'US' ? 'USD' : 'KRW');
  const avgPrice = quantity > 0 && principal > 0 ? Math.round(principal / quantity) : principal || currentValue;
  return {
    symbol: normalizeSymbol(String(position.symbol || '').trim().toUpperCase(), market),
    name: String(position.name || position.symbol || '').trim(),
    market,
    currency,
    quantity,
    avgPrice,
    avgPriceMode: quantity > 0 ? 'KRW_UNIT' : 'TOTAL_KRW',
    principalKRW: principal || currentValue,
    currentValueKRW: currentValue,
    profitKRW: Math.round(Number(position.profitKRW) || (currentValue - principal) || 0),
    returnPct: Number.isFinite(Number(position.returnPct)) ? Number(position.returnPct) : null,
    broker: String(position.broker || '').trim(),
    assetClass: String(position.assetClass || '').trim(),
    source: 'asset-screenshot',
    snapshotAt: asOf || todayISO(),
  };
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

export function inferMarketFromTicker(symbol, exchange = '') {
  const exchangeText = String(exchange || '').toUpperCase();
  if (/(\.KS|\.KQ)$/.test(symbol) || /^\d{6}$/.test(symbol)) return 'KR';
  if (/(KSC|KOSPI|KOSDAQ|KRX|KOREA|SEOUL)/.test(exchangeText)) return 'KR';
  return 'US';
}

export async function searchTickerSymbols(query, options = {}) {
  const localSearch = options.localSearch || searchLocalMarketSymbols;
  const serverAvailable = options.serverAvailable || hasServerApi;
  const request = options.request || fetch;
  const proxyRequest = options.proxyRequest || proxyFetchJson;
  const localItems = localSearch(query, 8);
  if (!serverAvailable()) return localItems;
  try {
    const res = await request(`/api/market-symbol-search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`search ${res.status}`);
    const data = await res.json();
    return mergeSymbolItems(localItems, data.items || []).slice(0, 8);
  } catch {
    if (localItems.length) return localItems;
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
      const data = await proxyRequest(url);
      const yahooItems = (data.quotes || []).slice(0, 8).map(item => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchange || '',
        type: item.quoteType || '',
      }));
      return mergeSymbolItems(yahooItems).slice(0, 8);
    } catch {
      return [];
    }
  }
}

export function mergeSymbolItems(...groups) {
  const seen = new Set();
  return groups.flat().filter(item => {
    const key = String(item.symbol || '').toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function postAssetImageParse(url, payload) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function isDuplicateHolding(holdings, candidate) {
  const key = holdingIdentity(candidate);
  return holdings.some(item => {
    if (holdingIdentity(item) !== key) return false;
    const valueA = Number(item.currentValueKRW) || Number(item.principalKRW) || Number(item.avgPrice) || 0;
    const valueB = Number(candidate.currentValueKRW) || Number(candidate.principalKRW) || Number(candidate.avgPrice) || 0;
    return nearMoney(valueA, valueB) || nearMoney(Number(item.principalKRW) || Number(item.avgPrice) || 0, Number(candidate.principalKRW) || 0);
  });
}

function holdingIdentity(item) {
  const symbol = String(item.symbol || '').toUpperCase().replace(/\s+/g, '');
  const name = normalizeAssetName(item.name || symbol);
  const broker = normalizeAssetName(item.broker || '');
  return `${symbol || name}|${broker}`;
}

function normalizeAssetName(value) {
  return String(value || '').toLowerCase().replace(/[\s._-]+/g, '');
}

function nearMoney(a, b) {
  if (!a || !b) return false;
  return Math.abs(a - b) <= Math.max(5000, Math.max(a, b) * 0.03);
}

function normalizeSymbol(symbol, market = 'KR') {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('.')) return raw;
  const compactKr = raw.match(/^(\d{6})(KS|KQ)$/);
  if (compactKr) return `${compactKr[1]}.${compactKr[2]}`;
  if (market === 'KR' && /^\d{6}$/.test(raw)) return `${raw}.KS`;
  return raw;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
  throw new Error('검색 프록시 실패');
}
