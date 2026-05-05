// ================================================================
// api/visual-search.js — free/optional-key visual candidate search
// ================================================================

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  const q = String(req.query?.q || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: 'q 필요', items: [] });

  try {
    const remote = await searchProvider(q);
    const items = remote.items.length ? remote.items : localVisualCandidates(q);
    return res.status(200).json({
      ok: true,
      provider: remote.items.length ? remote.provider : 'local',
      items: items.slice(0, 3),
    });
  } catch (err) {
    return res.status(200).json({
      ok: true,
      provider: 'local',
      warning: err.message,
      items: localVisualCandidates(q).slice(0, 3),
    });
  }
}

async function searchProvider(q) {
  if (process.env.PEXELS_API_KEY) {
    const items = await searchPexels(q).catch(() => []);
    if (items.length) return { provider: 'pexels', items };
  }
  if (process.env.PIXABAY_API_KEY) {
    const items = await searchPixabay(q).catch(() => []);
    if (items.length) return { provider: 'pixabay', items };
  }
  if (process.env.GOOGLE_CUSTOM_SEARCH_KEY && (process.env.GOOGLE_CSE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID)) {
    const items = await searchGoogleCustomImages(q).catch(() => []);
    if (items.length) return { provider: 'google-custom-search', items };
  }
  return { provider: 'local', items: [] };
}

async function searchGoogleCustomImages(q) {
  const cx = process.env.GOOGLE_CSE_ID || process.env.GOOGLE_SEARCH_ENGINE_ID;
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', process.env.GOOGLE_CUSTOM_SEARCH_KEY);
  url.searchParams.set('cx', cx);
  url.searchParams.set('searchType', 'image');
  url.searchParams.set('safe', 'active');
  url.searchParams.set('num', '3');
  url.searchParams.set('q', q);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`google custom search ${response.status}`);
  const data = await response.json();
  return (data.items || []).slice(0, 3).map((item, index) => ({
    label: item.title || `${q} 이미지 ${index + 1}`,
    url: item.link,
    credit: '이미지 검색 후보',
    sourceUrl: item.image?.contextLink || item.link,
  })).filter(item => item.url);
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
  })).filter(item => item.url);
}

function localVisualCandidates(q) {
  const key = semanticKey(q);
  const sets = {
    'travel-japan': [
      ['교토 산책', 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80'],
      ['일본 여행', 'https://images.unsplash.com/photo-1528164344705-47542687000d?auto=format&fit=crop&w=900&q=80'],
      ['도시의 밤', 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=900&q=80'],
    ],
    'wellness-stay': [
      ['리조트 라운지', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80'],
      ['스파 휴식', 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80'],
      ['마운틴 스테이', 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80'],
    ],
    salad: [
      ['샐러드 볼', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80'],
      ['그린 플레이트', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80'],
      ['토마토 샐러드', 'https://images.unsplash.com/photo-1568158879083-c42860933ed7?auto=format&fit=crop&w=900&q=80'],
    ],
    food: [
      ['홈 쿠킹', 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80'],
      ['마켓 채소', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80'],
      ['푸드 테이블', 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=80'],
    ],
    'muscle-fit-top': [
      ['머슬핏 티셔츠', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80'],
      ['슬림핏 상의', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80'],
      ['운동 상의', 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=80'],
    ],
    'shirt-top': [
      ['티셔츠 상품', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80'],
      ['상의 디테일', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80'],
      ['기본 셔츠', 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=80'],
    ],
    'pants-shorts': [
      ['팬츠 상품', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=80'],
      ['데일리 팬츠', 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80'],
      ['하프팬츠 후보', 'https://images.unsplash.com/photo-1506629905607-d9d297d5f5f2?auto=format&fit=crop&w=900&q=80'],
    ],
    outerwear: [
      ['아우터 상품', 'https://images.unsplash.com/photo-1520975954732-35dd22299614?auto=format&fit=crop&w=900&q=80'],
      ['자켓 디테일', 'https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=900&q=80'],
      ['코트 후보', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80'],
    ],
    activewear: [
      ['운동복 상의', 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=80'],
      ['러닝 팬츠', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=80'],
      ['트레이닝 슈즈', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80'],
    ],
    shoes: [
      ['러닝화 상품', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80'],
      ['스니커즈 디테일', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80'],
      ['운동화 후보', 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=900&q=80'],
    ],
    fashion: [
      ['티셔츠 상품', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80'],
      ['팬츠 상품', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=80'],
      ['스니커즈 상품', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80'],
    ],
    lifestyle: [
      ['라이프스타일', 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80'],
      ['데일리 오브젝트', 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=900&q=80'],
      ['라이트 무드', 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80'],
    ],
  };
  return (sets[key] || sets.lifestyle).map(([label, url]) => ({
    label,
    url,
    credit: 'Unsplash 후보',
  }));
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
