// ================================================================
// choice/recipe-autofill.js - static-host recipe metadata fallback
// ================================================================

import {
  domainFromUrl,
  safeExternalUrl,
} from './share-preview.js?v=20260505-visual-modal';

const NOEMBED_ENDPOINT = 'https://noembed.com/embed?url=';

const PRESETS = [
  {
    pattern: /(광어|흰살생선|white\s*fish).{0,16}(카르파|carpaccio)|카르파.{0,16}(광어|흰살생선|white\s*fish)/i,
    title: '광어 카르파초',
    summary: '영상 제목에서 광어 카르파초로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['광어', '회 또는 필렛'],
      ['올리브오일', ''],
      ['레몬즙', ''],
      ['소금', ''],
      ['후추', ''],
      ['딜', '선택'],
      ['핑크페퍼', '선택'],
      ['래디시', '선택'],
    ],
    steps: ['광어를 얇게 펼치기', '올리브오일과 레몬즙을 뿌리기', '소금, 후추, 허브로 마무리하기'],
  },
  {
    pattern: /(연어).{0,16}(카르파|carpaccio)|카르파.{0,16}(연어)/i,
    title: '연어 카르파초',
    summary: '영상 제목에서 연어 카르파초로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['연어', ''],
      ['올리브오일', ''],
      ['레몬즙', ''],
      ['소금', ''],
      ['후추', ''],
      ['케이퍼', '선택'],
      ['딜', '선택'],
    ],
    steps: ['연어를 얇게 펼치기', '오일과 산미를 더하기', '허브와 향신료로 마무리하기'],
  },
  {
    pattern: /(알리오\s*올리오|aglio|오일\s*파스타)/i,
    title: '알리오 올리오',
    summary: '영상 제목에서 오일 파스타로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['파스타면', ''],
      ['마늘', ''],
      ['올리브오일', ''],
      ['페페론치노', ''],
      ['소금', ''],
      ['후추', '선택'],
      ['파슬리', '선택'],
    ],
    steps: ['면 삶기', '마늘과 오일 향 내기', '면수와 함께 섞기'],
  },
  {
    pattern: /(토마토).{0,12}(파스타)|파스타.{0,12}(토마토)/i,
    title: '토마토 파스타',
    summary: '영상 제목에서 토마토 파스타로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['파스타면', ''],
      ['토마토소스', ''],
      ['마늘', ''],
      ['양파', '선택'],
      ['올리브오일', ''],
      ['소금', ''],
      ['후추', ''],
    ],
    steps: ['면 삶기', '소스를 데우고 재료 볶기', '면과 소스를 섞기'],
  },
  {
    pattern: /(된장찌개|된장\s*찌개)/i,
    title: '된장찌개',
    summary: '영상 제목에서 된장찌개로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['된장', ''],
      ['두부', ''],
      ['애호박', ''],
      ['양파', ''],
      ['대파', ''],
      ['마늘', ''],
      ['멸치육수', ''],
    ],
    steps: ['육수 끓이기', '된장을 풀고 채소 넣기', '두부와 대파로 마무리하기'],
  },
  {
    pattern: /(김치찌개|김치\s*찌개)/i,
    title: '김치찌개',
    summary: '영상 제목에서 김치찌개로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['김치', ''],
      ['돼지고기', '선택'],
      ['두부', ''],
      ['대파', ''],
      ['마늘', ''],
      ['고춧가루', ''],
      ['국간장', '선택'],
    ],
    steps: ['김치와 고기 볶기', '물을 넣고 끓이기', '두부와 대파로 마무리하기'],
  },
  {
    pattern: /(카레|curry)/i,
    title: '카레',
    summary: '영상 제목에서 카레로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['카레가루', ''],
      ['양파', ''],
      ['감자', ''],
      ['당근', ''],
      ['고기', '선택'],
      ['버터', '선택'],
    ],
    steps: ['재료 볶기', '물을 넣고 익히기', '카레를 풀어 농도 맞추기'],
  },
  {
    pattern: /(스테이크|steak)/i,
    title: '스테이크',
    summary: '영상 제목에서 스테이크로 인식해 기본 재료 후보를 채웠어요.',
    ingredients: [
      ['스테이크용 소고기', ''],
      ['소금', ''],
      ['후추', ''],
      ['버터', ''],
      ['마늘', '선택'],
      ['로즈마리', '선택'],
    ],
    steps: ['고기 밑간하기', '팬에 굽기', '버터와 허브로 베이스팅하기'],
  },
];

const INGREDIENT_NAMES = [
  '엑스트라버진 올리브오일', '토마토소스', '스테이크용 소고기', '멸치육수',
  '올리브오일', '페페론치노', '파스타면', '고춧가루', '국간장', '레몬즙',
  '핑크페퍼', '토마토', '래디시', '케이퍼', '파슬리', '로즈마리',
  '광어', '연어', '도미', '참치', '관자', '새우', '오징어',
  '소고기', '돼지고기', '닭고기', '닭가슴살', '고기',
  '김치', '된장', '고추장', '간장', '식초', '설탕', '꿀', '소금', '후추',
  '마늘', '양파', '대파', '쪽파', '애호박', '감자', '당근', '두부',
  '버터', '계란', '달걀', '딜', '레몬', '라임', '쌀', '밥',
];

export async function buildStaticRecipePreview(url, rawText = '', visual = null) {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) return null;
  const youtubeId = youtubeIdFromUrl(safeUrl);
  if (!youtubeId && !isVideoRecipeUrl(safeUrl)) return null;

  const meta = youtubeId ? await fetchYouTubeNoembed(youtubeId).catch(() => ({})) : {};
  const sourceText = [
    rawText,
    meta.title,
    meta.author_name,
  ].filter(Boolean).join('\n');
  const preset = PRESETS.find(row => row.pattern.test(sourceText));
  const heuristicIngredients = inferIngredients(sourceText);
  const ingredients = mergeIngredients(
    preset?.ingredients?.map(([name, quantity]) => ({ name, quantity })) || [],
    heuristicIngredients
  );
  const title = cleanRecipeTitle(preset?.title || meta.title || visual?.title || '영상 레시피');
  const imageUrl = safeExternalUrl(visual?.imageUrl) || safeExternalUrl(meta.thumbnail_url) || (youtubeId ? youtubeThumb(youtubeId) : '');

  return {
    ok: true,
    title,
    url: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : safeUrl,
    domain: domainFromUrl(safeUrl),
    imageUrl,
    source: {
      platform: youtubeId ? 'youtube' : sourcePlatformFromUrl(safeUrl),
      id: youtubeId,
      caption: String(sourceText || '').slice(0, 1200),
    },
    ingredients,
    steps: preset?.steps || [],
    summary: preset?.summary || (ingredients.length
      ? '영상 제목/공유 텍스트에서 재료 후보를 자동으로 뽑았어요.'
      : '대표 이미지는 담았고, 재료는 영상 확인 후 직접 보완해야 합니다.'),
    provider: 'static-title-heuristic',
    transcriptAvailable: false,
    warning: ingredients.length
      ? '자막 대신 제목/공유 텍스트 기반으로 재료 후보를 채웠어요.'
      : '영상 자막을 읽지 못해 재료 후보를 만들지 못했어요.',
  };
}

function inferIngredients(text) {
  const source = normalizeText(text);
  const found = [];
  for (const name of INGREDIENT_NAMES.sort((a, b) => b.length - a.length)) {
    const compactName = normalizeText(name);
    if (!source.includes(compactName)) continue;
    if (found.some(item => item.name.includes(name) || name.includes(item.name))) continue;
    found.push({ name, quantity: quantityNear(text, name) });
  }
  return found.slice(0, 18);
}

function mergeIngredients(...groups) {
  const seen = new Set();
  return groups.flat()
    .map((ing, index) => ({
      id: `ing_static_${index}`,
      name: String(ing?.name || '').trim(),
      quantity: String(ing?.quantity || '').trim(),
      decidedSourceId: '',
      sources: [],
    }))
    .filter(ing => {
      const key = normalizeText(ing.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

async function fetchYouTubeNoembed(videoId) {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const res = await fetch(`${NOEMBED_ENDPOINT}${encodeURIComponent(watchUrl)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`noembed ${res.status}`);
  return res.json();
}

function youtubeIdFromUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') return normalizeYoutubeId(parts[0]);
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (['shorts', 'embed', 'live'].includes(parts[0])) return normalizeYoutubeId(parts[1]);
      return normalizeYoutubeId(url.searchParams.get('v'));
    }
  } catch {}
  return '';
}

function normalizeYoutubeId(value) {
  const match = String(value || '').match(/[A-Za-z0-9_-]{11}/);
  return match ? match[0] : '';
}

function youtubeThumb(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function isVideoRecipeUrl(value) {
  return /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i.test(String(value || ''));
}

function sourcePlatformFromUrl(value) {
  const url = String(value || '').toLowerCase();
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/instagram\.com/.test(url)) return 'instagram';
  if (/tiktok\.com/.test(url)) return 'tiktok';
  return '';
}

function cleanRecipeTitle(value) {
  return String(value || '')
    .replace(/\s*#\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[“”"']/g, '');
}

function quantityNear(text, name) {
  const source = String(text || '');
  const idx = source.indexOf(name);
  if (idx === -1) return '';
  const near = source.slice(Math.max(0, idx - 24), idx + name.length + 42);
  const ratio = near.match(/(\d+\s*:\s*\d+)\s*비율/);
  if (ratio) return ratio[1].replace(/\s+/g, '');
  const qty = near.match(/(\d+(?:\.\d+)?\s*(?:g|그램|kg|개|큰술|작은술|스푼|컵|ml|mL|장|쪽|알|꼬집))/);
  return qty ? qty[1].replace(/\s+/g, '') : '';
}
