// ================================================================
// api/visual-search.js — free/optional-key visual candidate search
// ================================================================

import { searchPublicVisualCandidates } from '../choice/visual-search.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  const q = String(req.query?.q || '').trim();
  const limit = Math.max(1, Math.min(10, Number(req.query?.limit) || 8));
  if (!q) return res.status(400).json({ ok: false, error: 'q 필요', items: [] });

  try {
    const remote = await searchProvider(q, limit);
    return res.status(200).json({
      ok: true,
      provider: remote.provider,
      items: remote.items.slice(0, limit),
    });
  } catch (err) {
    return res.status(200).json({
      ok: true,
      provider: 'none',
      warning: err.message,
      items: [],
    });
  }
}

async function searchProvider(q, limit) {
  if (googleCustomSearchKey() && googleCustomSearchEngineId()) {
    const items = await searchGoogleCustomImages(q, limit).catch(() => []);
    if (items.length) return { provider: 'google-custom-search', items };
  }
  if (process.env.PEXELS_API_KEY) {
    const items = await searchPexels(q).catch(() => []);
    if (items.length) return { provider: 'pexels', items };
  }
  if (process.env.PIXABAY_API_KEY) {
    const items = await searchPixabay(q).catch(() => []);
    if (items.length) return { provider: 'pixabay', items };
  }
  const publicItems = await searchPublicVisualCandidates(q, { limit }).catch(() => []);
  if (publicItems.length) return { provider: 'public-image-search', items: publicItems };
  return { provider: 'none', items: [] };
}

async function searchGoogleCustomImages(q, limit = 8) {
  const cx = googleCustomSearchEngineId();
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', googleCustomSearchKey());
  url.searchParams.set('cx', cx);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('safe', 'active');
  url.searchParams.set('num', String(Math.max(1, Math.min(10, limit))));
  url.searchParams.set('hl', 'ko');
  url.searchParams.set('gl', 'kr');
  url.searchParams.set('imgType', 'photo');
  url.searchParams.set('q', q);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`google custom search ${response.status}`);
  const data = await response.json();
  return (data.items || []).slice(0, limit).map((item, index) => ({
    label: plainText(item.title || `${q} 이미지 ${index + 1}`).slice(0, 90),
    url: safeImageUrl(item.link || item.image?.thumbnailLink),
    credit: `Google 이미지 검색 · ${hostLabel(item.image?.contextLink || item.displayLink || item.link)}`,
    sourceUrl: item.image?.contextLink || item.link,
    provider: 'google-custom-search',
    query: q,
  })).filter(item => item.url);
}

function googleCustomSearchKey() {
  return process.env.GOOGLE_CUSTOM_SEARCH_KEY || process.env.GOOGLE_CSE_API_KEY || '';
}

function googleCustomSearchEngineId() {
  return process.env.GOOGLE_CSE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID || '';
}

async function searchPexels(q) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(toEnglishQuery(q))}&per_page=8&orientation=portrait`;
  const response = await fetch(url, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (!response.ok) throw new Error(`pexels ${response.status}`);
  const data = await response.json();
  return (data.photos || []).map(photo => ({
    label: photo.alt || q,
    url: photo.src?.large || photo.src?.portrait || photo.src?.medium,
    credit: photo.photographer ? `Pexels · ${photo.photographer}` : 'Pexels',
    sourceUrl: photo.url,
    provider: 'pexels',
    query: q,
  })).filter(item => item.url);
}

async function searchPixabay(q) {
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(process.env.PIXABAY_API_KEY)}&q=${encodeURIComponent(toEnglishQuery(q))}&image_type=photo&orientation=vertical&safesearch=true&per_page=8`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`pixabay ${response.status}`);
  const data = await response.json();
  return (data.hits || []).map(photo => ({
    label: photo.tags || q,
    url: photo.webformatURL || photo.largeImageURL,
    credit: photo.user ? `Pixabay · ${photo.user}` : 'Pixabay',
    sourceUrl: photo.pageURL,
    provider: 'pixabay',
    query: q,
  })).filter(item => item.url);
}

function semanticKey(q) {
  const source = String(q || '').toLowerCase();
  if (/일본|japan|도쿄|tokyo|오사카|osaka|교토|kyoto|여행|travel/.test(source)) return 'travel-japan';
  if (/park\s*roche|parkroche|파크\s*로쉬|파크로쉬|파크\s*로체|파크로체|호텔|리조트|숙소|호캉스|스파|웰니스|hotel|resort|stay|spa|wellness/.test(source)) return 'wellness-stay';
  if (/샐러드|salad/.test(source)) return 'salad';
  if (/피코|pico|salsa|토마토|tomato|recipe|레시피|food|요리/.test(source)) return 'food';
  if (/머슬\s*핏|머슬핏|muscle\s*fit|슬림\s*핏|슬림핏|slim\s*fit|컴프레션|compression|짐웨어|gymwear|헬스\s*(티|상의|셔츠)|운동\s*(티|상의|셔츠)/.test(source)) return 'muscle-fit-top';
  if (/러닝화|운동화|스니커즈|신발|sneakers?|running\s*shoes?|shoes?/.test(source)) return 'shoes';
  if (/반바지|하프\s*팬츠|하프팬츠|쇼츠|팬츠|바지|shorts?|pants?|trousers?/.test(source)) return 'pants-shorts';
  if (/패딩|다운|점퍼|자켓|재킷|코트|아우터|롱패딩|숏패딩|outer|outerwear|padding|puffer|down\s*jacket|jacket|coat|parka/.test(source)) return 'outerwear';
  if (/티셔츠|반팔|긴팔|셔츠|상의|후드|맨투맨|shirt|t-?shirt|tee|top|hood|sweatshirt/.test(source)) return 'shirt-top';
  if (/액티브|러닝|매쉬|메쉬|운동복|스포츠웨어|active|running|workout|athletic|sportswear/.test(source)) return 'activewear';
  if (/shirt|hood|옷|의류|wear|fashion|musinsa|dope|발리안트/.test(source)) return 'fashion';
  return 'lifestyle';
}

function toEnglishQuery(q) {
  const key = semanticKey(q);
  if (key === 'travel-japan') return 'Japan travel Kyoto';
  if (key === 'wellness-stay') return 'wellness resort hotel spa mountain stay';
  if (key === 'salad') return 'fresh salad bowl';
  if (key === 'food') return 'fresh home cooking';
  if (key === 'muscle-fit-top') return 'men muscle fit t-shirt product photo';
  if (key === 'shirt-top') return 'plain t-shirt product photo';
  if (key === 'pants-shorts') return 'running shorts pants product photo';
  if (key === 'outerwear') return 'outerwear jacket coat product photo';
  if (key === 'activewear') return 'activewear sportswear product photo';
  if (key === 'shoes') return 'running shoes product photo';
  if (key === 'fashion') return 'clothing product photo';
  return q;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function safeImageUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    if (/\.(svg)(?:[?#]|$)/i.test(parsed.href)) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function hostLabel(value) {
  try {
    return new URL(String(value || '')).hostname.replace(/^www\./, '');
  } catch {
    return '검색 결과';
  }
}

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
