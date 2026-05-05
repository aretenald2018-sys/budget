const LOCAL_SYMBOLS = [
  {
    symbol: '133690.KS',
    name: 'TIGER 미국나스닥100',
    exchange: 'KSC',
    type: 'ETF',
    aliases: ['tiger 미국 나스닥', 'tiger 미국나스닥', '타이거 미국 나스닥', '타이거 나스닥', '미국나스닥100', '나스닥100'],
  },
  {
    symbol: '379810.KS',
    name: 'KODEX 미국나스닥100TR',
    exchange: 'KSC',
    type: 'ETF',
    aliases: ['kodex 미국 나스닥', '코덱스 미국 나스닥', 'kodex 나스닥100', '미국나스닥100tr'],
  },
  {
    symbol: '438100.KS',
    name: 'ACE 미국나스닥100미국채혼합50액티브',
    exchange: 'KSC',
    type: 'ETF',
    aliases: ['ace 미국 나스닥 미국채', 'ace 나스닥 미국채', '나스닥 미국채 혼합'],
  },
  {
    symbol: '360750.KS',
    name: 'TIGER 미국S&P500',
    exchange: 'KSC',
    type: 'ETF',
    aliases: ['tiger 미국 sp500', 'tiger 미국 s&p500', '타이거 미국 s&p500', '미국 s&p500', '미국sp500'],
  },
  {
    symbol: '381170.KS',
    name: 'TIGER 미국테크TOP10 INDXX',
    exchange: 'KSC',
    type: 'ETF',
    aliases: ['tiger 미국 테크', 'tiger 미국테크', '타이거 미국 테크', '미국테크top10', '테크top10'],
  },
  {
    symbol: '371460.KS',
    name: 'TIGER 차이나전기차SOLACTIVE',
    exchange: 'KSC',
    type: 'ETF',
    aliases: ['tiger 차이나 전기차', '타이거 차이나 전기차', '차이나전기차'],
  },
  {
    symbol: '069500.KS',
    name: 'KODEX 200',
    exchange: 'KSC',
    type: 'ETF',
    aliases: ['kodex 200', '코덱스 200', '코스피200'],
  },
  {
    symbol: '005930.KS',
    name: '삼성전자',
    exchange: 'KSC',
    type: 'EQUITY',
    aliases: ['삼성전자', 'samsung electronics'],
  },
  {
    symbol: '000660.KS',
    name: 'SK하이닉스',
    exchange: 'KSC',
    type: 'EQUITY',
    aliases: ['sk하이닉스', '하이닉스', 'sk hynix'],
  },
  { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NMS', type: 'EQUITY', aliases: ['테슬라', 'tesla'] },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NMS', type: 'ETF', aliases: ['qqq', '나스닥 etf', 'nasdaq 100'] },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', exchange: 'NGM', type: 'ETF', aliases: ['tlt', '미국 장기국채', '미국채 장기'] },
  { symbol: 'GLD', name: 'SPDR Gold Shares', exchange: 'PCX', type: 'ETF', aliases: ['gld', '금 etf', 'gold'] },
];

export function searchLocalMarketSymbols(query, limit = 8) {
  const q = normalizeSearchText(query);
  if (!q) return [];
  return mergeSymbolItems([parseTreasuryBond(query), ...LOCAL_SYMBOLS
    .map(item => ({ item, score: scoreSymbol(item, q) }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'ko-KR'))
    .map(row => ({ ...row.item }))])
    .slice(0, limit);
}

function parseTreasuryBond(query) {
  const raw = String(query || '').trim();
  const q = normalizeSearchText(raw);
  if (!/(미국|us|u s|treasury)/.test(q) || !/(국채|채권|treasury|bond)/.test(q)) return null;
  const date = parseKoreanMaturityDate(raw) || parseISODate(raw);
  if (!date) return null;
  return {
    symbol: `UST-${date}`,
    name: `미국 국채 ${date} 만기`,
    exchange: 'TREASURY',
    type: 'BOND',
    aliases: [raw],
  };
}

function parseKoreanMaturityDate(value) {
  const match = String(value || '').match(/(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!match) return '';
  const yearRaw = Number(match[1]);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  const month = String(Number(match[2])).padStart(2, '0');
  const day = String(Number(match[3])).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseISODate(value) {
  const match = String(value || '').match(/(20\d{2})[-./\s](\d{1,2})[-./\s](\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
}

function mergeSymbolItems(items) {
  const seen = new Set();
  return items.filter(Boolean).filter(item => {
    const key = String(item.symbol || '').toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreSymbol(item, query) {
  const haystacks = [item.symbol, item.name, ...(item.aliases || [])].map(normalizeSearchText);
  if (haystacks.some(text => text === query)) return 100;
  if (haystacks.some(text => text.includes(query))) return 70;
  const tokens = query.split(' ').filter(Boolean);
  if (tokens.length && haystacks.some(text => tokens.every(token => text.includes(token)))) return 50 + tokens.length;
  return 0;
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s._-]+/g, ' ')
    .replace(/&/g, '')
    .trim();
}
