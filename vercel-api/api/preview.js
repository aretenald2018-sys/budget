// ================================================================
// vercel-api/api/preview.js — single Vercel API gateway for GitHub Pages
// ================================================================

const FETCH_TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const INGREDIENT_HINTS = [
  '숙성 광어회', '엑스트라버진 올리브오일', '파스타면', '스테이크용 소고기', '토마토소스', '페페론치노',
  '김치', '돼지고기', '소고기', '닭고기', '닭가슴살', '계란', '달걀', '두부', '대파', '쪽파', '양파', '마늘',
  '고추', '청양고추', '애호박', '감자', '당근', '버섯', '양배추', '깻잎', '상추', '토마토', '방울토마토',
  '파스타면', '라면', '우동면', '밥', '쌀', '떡', '떡볶이떡', '어묵', '베이컨', '햄', '참치', '연어',
  '새우', '오징어', '고추장', '된장', '간장', '국간장', '굴소스', '고춧가루', '설탕', '올리고당', '꿀',
  '식초', '참기름', '들기름', '올리브오일', '올리브유', '버터', '치즈', '우유', '생크림', '밀가루', '전분',
  '빵가루', '래디쉬', '래디시', '자색양파', '핑크페퍼', '레몬즙', '레몬', '딜', '파슬리', '맛소금',
];

const RECIPE_PRESETS = [
  preset(/(광어|흰살생선).{0,18}(카르파|카르파쵸|carpaccio)|(?:카르파|카르파쵸).{0,18}(광어|흰살생선)/i, '광어 카르파초', [['광어', '회 또는 필렛'], ['올리브오일', ''], ['레몬즙', ''], ['소금', ''], ['후추', ''], ['딜', '선택'], ['핑크페퍼', '선택'], ['래디쉬', '선택']], ['광어를 얇게 펼치기', '올리브오일과 레몬즙을 뿌리기', '소금, 후추, 허브로 마무리하기']),
  preset(/(연어).{0,18}(카르파|카르파쵸|carpaccio)|(?:카르파|카르파쵸).{0,18}(연어)/i, '연어 카르파초', [['연어', ''], ['올리브오일', ''], ['레몬즙', ''], ['소금', ''], ['후추', ''], ['케이퍼', '선택'], ['딜', '선택']], ['연어를 얇게 펼치기', '오일과 산미를 더하기', '허브와 향신료로 마무리하기']),
  preset(/(알리오\s*올리오|aglio|오일\s*파스타)/i, '알리오 올리오', [['파스타면', ''], ['마늘', ''], ['올리브오일', ''], ['페페론치노', ''], ['소금', ''], ['후추', '선택'], ['파슬리', '선택']], ['면 삶기', '마늘과 오일 향 내기', '면수와 함께 섞기']),
  preset(/(다이어트|저칼로리|단백질).{0,18}(파스타)|파스타.{0,18}(다이어트|저칼로리|단백질)/i, '다이어트 파스타', [['파스타면', ''], ['올리브오일', ''], ['마늘', '선택'], ['방울토마토', '선택'], ['닭가슴살', '선택'], ['소금', ''], ['후추', '']], ['면을 삶기', '오일과 재료를 가볍게 볶기', '면과 함께 섞어 간 맞추기']),
  preset(/(샐러드|salad)/i, '샐러드', [['양상추', '선택'], ['토마토', '선택'], ['양파', '선택'], ['레몬즙', '선택'], ['올리브오일', ''], ['소금', ''], ['후추', '']], ['채소 손질하기', '드레싱 만들기', '가볍게 버무리기']),
  preset(/(김치찌개|김치\s*찌개)/i, '김치찌개', [['김치', ''], ['돼지고기', '선택'], ['두부', ''], ['대파', ''], ['마늘', ''], ['고춧가루', '']], ['김치와 고기 볶기', '물을 넣고 끓이기', '두부와 대파로 마무리하기']),
  preset(/(된장찌개|된장\s*찌개)/i, '된장찌개', [['된장', ''], ['두부', ''], ['애호박', ''], ['양파', ''], ['대파', ''], ['마늘', '']], ['육수 끓이기', '된장을 풀고 채소 넣기', '두부와 대파로 마무리하기']),
  preset(/(계란말이|달걀말이|omelette)/i, '계란말이', [['계란', ''], ['대파', '선택'], ['청양고추', '선택'], ['소금', ''], ['식용유', '']], ['계란물 풀기', '약불에서 접어가며 익히기', '한 김 식힌 뒤 썰기']),
  preset(/(떡볶이|tteokbokki)/i, '떡볶이', [['떡볶이떡', ''], ['어묵', ''], ['고추장', ''], ['고춧가루', ''], ['설탕', ''], ['대파', '']], ['양념장 풀기', '떡과 어묵 넣고 졸이기', '대파로 마무리하기']),
  preset(/(라자냐|lasagna)/i, '라자냐', [['라자냐면', ''], ['토마토소스', ''], ['다진소고기', ''], ['양파', ''], ['모차렐라치즈', '']], ['미트소스 만들기', '면과 소스를 층층이 쌓기', '치즈 올려 굽기']),
  preset(/(마파두부|마파\s*두부|mapo)/i, '마파두부', [['두부', ''], ['다진돼지고기', ''], ['두반장', ''], ['대파', ''], ['마늘', '']], ['고기와 향신채 볶기', '양념과 두부 넣기', '전분물로 농도 맞추기']),
  preset(/(오므라이스|오무라이스|omurice)/i, '오므라이스', [['밥', ''], ['계란', ''], ['양파', ''], ['케첩', ''], ['햄', '선택'], ['버터', '선택']], ['케첩밥 만들기', '계란 지단 만들기', '밥을 감싸 소스 올리기']),
  preset(/(브라우니|brownie)/i, '브라우니', [['초콜릿', ''], ['버터', ''], ['설탕', ''], ['계란', ''], ['밀가루', '']], ['초콜릿과 버터 녹이기', '반죽 섞기', '틀에 넣어 굽기']),
];

export default async function handler(req, res) {
  const cors = setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(cors.allowed ? 204 : 403).end();
  if (!cors.allowed) return res.status(403).json({ ok: false, error: 'origin not allowed' });
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  const kind = String(req.query?.kind || (req.query?.recipeUrl ? 'recipe' : req.query?.productUrl ? 'product' : '')).toLowerCase();
  const rawUrl = String(req.query?.url || req.query?.recipeUrl || req.query?.productUrl || '').trim();
  try {
    if (kind === 'recipe') return res.status(200).json(await buildRecipePreview(rawUrl));
    if (kind === 'product') return res.status(200).json(await buildProductPreview(rawUrl));
    return res.status(400).json({ ok: false, error: 'kind=recipe 또는 kind=product 필요' });
  } catch (err) {
    return res.status(kind === 'recipe' ? 200 : 400).json({
      ok: false,
      error: err.message || 'preview failed',
      ingredients: [],
      steps: [],
    });
  }
}

function setCors(req, res) {
  const origin = String(req.headers.origin || '');
  const allowed = isAllowedOrigin(origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return { allowed: true };
  }
  if (allowed) res.setHeader('Access-Control-Allow-Origin', origin);
  return { allowed };
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const allowlist = String(process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map(row => row.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const normalized = origin.replace(/\/+$/, '');
  if (allowlist.includes('*') || allowlist.includes(normalized)) return true;
  if (process.env.CORS_ALLOW_LOCAL !== '0' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized)) return true;
  return false;
}

async function buildRecipePreview(rawUrl) {
  const target = validateVideoUrl(rawUrl);
  const platform = detectPlatform(target);
  const meta = await fetchVideoMeta(target, platform);
  const transcript = platform === 'youtube' ? await fetchYouTubeTranscript(target).catch(() => '') : '';
  const textForAi = [meta.title, meta.author, meta.description, transcript].filter(Boolean).join('\n\n').slice(0, 18000);
  const fallback = fallbackRecipe(meta, transcript, target, platform);
  if (!textForAi.trim()) return { ...fallback, ok: false, warning: '영상 제목이나 자막을 읽지 못했어요. 재료를 직접 입력해 주세요.' };

  try {
    const { data, provider } = await extractRecipeJSON({ target, platform, meta, transcript, textForAi, fallback });
    const normalized = normalizeRecipe(data, fallback);
    return {
      ok: true,
      ...meta,
      title: normalized.title || meta.title,
      url: target.href,
      domain: target.hostname.replace(/^www\./, ''),
      source: { platform, id: videoIdFromUrl(target), caption: (transcript || meta.description || '').slice(0, 1200) },
      ingredients: normalized.ingredients,
      steps: normalized.steps,
      summary: normalized.summary,
      servings: normalized.servings,
      confidence: normalized.confidence,
      provider,
      transcriptAvailable: !!transcript,
      warning: transcript ? '' : '자막을 찾지 못해 영상 설명/제목 중심으로 정리했어요.',
    };
  } catch (err) {
    return {
      ...fallback,
      ok: true,
      warning: `AI 정리가 실패해 가능한 후보만 채웠어요: ${err.message}`,
    };
  }
}

async function buildProductPreview(rawUrl) {
  const target = validateHttpUrl(rawUrl);
  const html = await fetchText(target.href, { timeout: 7000, maxChars: 900000 });
  const title = metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || titleTag(html) || target.hostname;
  const imageUrl = absolutize(metaContent(html, 'og:image') || metaContent(html, 'twitter:image'), target.href);
  const price = extractPrice(html);
  return {
    ok: true,
    title: cleanText(title).slice(0, 120),
    imageUrl,
    price,
    url: target.href,
    domain: target.hostname.replace(/^www\./, ''),
    previewSource: 'vercel-api',
  };
}

async function extractRecipeJSON({ target, platform, meta, transcript, textForAi, fallback }) {
  const systemPrompt = 'You extract cooking recipe data from video metadata/transcripts. Return only JSON. Be conservative: if uncertain, leave fields empty rather than inventing ingredients.';
  const userPrompt = JSON.stringify({
    instruction: [
      'Input may be a Korean/English Shorts/Reels title, description, and transcript.',
      'Extract only plausible cooking ingredients and cooking steps.',
      'Return {title, summary, servings, ingredients:[{name, quantity}], steps:[string], confidence, notes}.',
      'Korean UI copy. Ingredient quantity can be empty if unknown.',
      'Do not include shopping links. Do not hallucinate specific brands.',
    ],
    input: { url: target.href, platform, title: meta.title, author: meta.author, transcriptAvailable: !!transcript, text: textForAi },
    fallbackShape: fallback,
  });
  return callLLMJSON(systemPrompt, userPrompt, 4096, { prefer: process.env.RECIPE_LLM_PROVIDER || 'groq' });
}

async function callLLMJSON(systemPrompt, userPrompt, maxTokens = 4096, opts = {}) {
  const prefer = String(opts.prefer || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  const providers = prefer === 'groq' ? ['groq', 'gemini'] : ['gemini', 'groq'];
  let lastErr = null;
  for (const provider of providers) {
    if (provider === 'groq' && !process.env.GROQ_API_KEY) continue;
    if (provider === 'gemini' && !process.env.GEMINI_API_KEY) continue;
    try {
      const data = provider === 'groq'
        ? await callGroqJSON(systemPrompt, userPrompt, maxTokens)
        : await callGeminiJSON(systemPrompt, userPrompt, maxTokens);
      return { data, provider };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('사용 가능한 LLM provider가 없습니다.');
}

async function callGeminiJSON(systemPrompt, userPrompt, maxTokens) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || data.error) throw new Error(`Gemini: ${data.error?.message || upstream.status}`);
  return cleanJSON(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

async function callGroqJSON(systemPrompt, userPrompt, maxTokens) {
  const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.2,
      max_tokens: Math.min(maxTokens || 2000, 8000),
      response_format: { type: 'json_object' },
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || data.error) throw new Error(`Groq: ${data.error?.message || upstream.status}`);
  return cleanJSON(data.choices?.[0]?.message?.content || '');
}

async function fetchVideoMeta(url, platform) {
  if (platform === 'youtube') {
    const oembed = await fetchJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(url.href)}&format=json`).catch(() => null);
    const details = await fetchYouTubePlayerDetails(url).catch(() => ({}));
    return {
      title: details.title || oembed?.title || 'YouTube 레시피',
      author: details.author || oembed?.author_name || '',
      imageUrl: oembed?.thumbnail_url || youtubeThumb(videoIdFromUrl(url)),
      description: details.shortDescription || '',
      platform,
    };
  }
  const html = await fetchText(url.href).catch(() => '');
  const description = postCaptionFromHtml(html, platform);
  return {
    title: metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || titleTag(html) || (platform === 'instagram' ? 'Instagram 레시피' : 'TikTok 레시피'),
    author: '',
    imageUrl: absolutize(metaContent(html, 'og:image') || '', url.href),
    description,
    platform,
  };
}

async function fetchYouTubeTranscript(url) {
  const id = videoIdFromUrl(url);
  if (!id) return '';
  const player = await fetchYouTubeInnerPlayer(id).catch(() => null);
  const playerTranscript = await transcriptFromTracks(player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []).catch(() => '');
  if (playerTranscript) return playerTranscript;
  const html = await fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=ko`);
  return transcriptFromTracks(extractCaptionTracks(html));
}

async function fetchYouTubePlayerDetails(url) {
  const id = videoIdFromUrl(url);
  const player = id ? await fetchYouTubeInnerPlayer(id).catch(() => null) : null;
  const details = player?.videoDetails || {};
  return {
    title: String(details.title || '').trim(),
    author: String(details.author || '').trim(),
    shortDescription: String(details.shortDescription || '').trim(),
  };
}

async function fetchYouTubeInnerPlayer(videoId) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'Origin': 'https://www.youtube.com',
      'Referer': `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    },
    body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20240531.01.00', hl: 'ko', gl: 'KR' } }, videoId }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `youtubei ${res.status}`);
  return data;
}

async function transcriptFromTracks(tracks = []) {
  if (!tracks.length) return '';
  const preferred = tracks.find(t => /^ko/i.test(t.languageCode || '')) || tracks.find(t => /^en/i.test(t.languageCode || '')) || tracks[0];
  const baseUrl = decodeUnicodeEscapes(preferred.baseUrl || '').replace(/\\u0026/g, '&');
  if (!baseUrl) return '';
  const body = await fetchText(baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`);
  return parseTranscript(body).slice(0, 16000);
}

function extractCaptionTracks(html) {
  const decoded = decodeUnicodeEscapes(String(html || '')).replace(/\\u0026/g, '&');
  const match = decoded.match(/"captionTracks":(\[.*?\])\s*,\s*"audioTracks"/s);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

function parseTranscript(body) {
  const text = String(body || '');
  try {
    const data = JSON.parse(text);
    return (data.events || []).flatMap(event => event.segs || []).map(seg => seg.utf8 || '').join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return text.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }
}

function fallbackRecipe(meta, transcript, target, platform) {
  const text = [meta.title, meta.description, transcript].filter(Boolean).join('\n');
  const matched = recipePresetFromText(text);
  const ingredients = mergeIngredients(matched?.ingredients || [], extractIngredientCandidates(text));
  const steps = matched?.steps || [];
  return {
    ok: true,
    title: cleanRecipeTitle(meta.title || '영상 레시피'),
    url: target.href,
    domain: target.hostname.replace(/^www\./, ''),
    imageUrl: meta.imageUrl || '',
    source: { platform, id: videoIdFromUrl(target), caption: (transcript || meta.description || '').slice(0, 1200) },
    ingredients,
    steps,
    summary: matched?.summary || (ingredients.length ? '영상 텍스트에서 재료 후보를 자동으로 뽑았어요.' : '대표 정보만 담았고 재료는 직접 보완해야 합니다.'),
    confidence: matched ? 0.45 : ingredients.length ? 0.35 : 0.1,
    provider: 'vercel-heuristic',
    transcriptAvailable: !!transcript,
  };
}

function extractIngredientCandidates(text) {
  const source = normalizeText(text);
  const found = [];
  for (const name of INGREDIENT_HINTS.sort((a, b) => b.length - a.length)) {
    const key = normalizeText(name);
    if (!source.includes(key)) continue;
    if (found.some(row => row.name.includes(name) || name.includes(row.name))) continue;
    found.push({ id: `ing_api_${found.length}`, name, quantity: quantityNear(text, name), decidedSourceId: '', acquired: false, sources: [] });
  }
  return found.slice(0, 20);
}

function normalizeRecipe(data, fallback) {
  const ingredients = normalizeIngredients(data?.ingredients);
  const steps = Array.isArray(data?.steps) ? data.steps.map(step => String(step || '').trim()).filter(Boolean).slice(0, 24) : [];
  const nextIngredients = ingredients.length && ingredients.length < 2 && fallback.ingredients.length > ingredients.length
    ? mergeIngredients(ingredients, fallback.ingredients)
    : ingredients.length ? ingredients : fallback.ingredients;
  return {
    title: cleanRecipeTitle(data?.title || fallback.title),
    summary: String(data?.summary || fallback.summary || '').trim().slice(0, 500),
    servings: String(data?.servings || '').trim().slice(0, 60),
    confidence: Math.max(0, Math.min(1, Number(data?.confidence) || fallback.confidence || 0)),
    ingredients: nextIngredients,
    steps: steps.length ? steps : fallback.steps,
  };
}

function recipePresetFromText(text) {
  const source = String(text || '');
  return RECIPE_PRESETS.find(row => row.pattern.test(source)) || null;
}

function preset(pattern, title, ingredients, steps) {
  return {
    pattern,
    title,
    summary: `영상 제목에서 ${title}로 인식해 기본 재료 후보를 채웠어요.`,
    ingredients: ingredients.map(([name, quantity], index) => ({
      id: `ing_api_preset_${index}`,
      name,
      quantity,
      decidedSourceId: '',
      acquired: false,
      sources: [],
    })),
    steps,
  };
}

function mergeIngredients(...groups) {
  const seen = new Set();
  return groups.flat().filter(ing => {
    const key = normalizeText(ing?.name || '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

function normalizeIngredients(value) {
  return Array.isArray(value)
    ? value.map((ing, index) => ({
      id: `ing_api_${index}`,
      name: String(ing?.name || '').trim(),
      quantity: String(ing?.quantity || '').trim(),
      decidedSourceId: '',
      acquired: false,
      sources: [],
    })).filter(ing => ing.name).slice(0, 30)
    : [];
}

async function fetchJSON(url) {
  const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!response.ok) throw new Error(`fetch ${response.status}`);
  return response.json();
}

async function fetchText(url, opts = {}) {
  const response = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*' }, timeout: opts.timeout });
  if (!response.ok) throw new Error(`fetch ${response.status}`);
  const text = await response.text();
  return opts.maxChars ? text.slice(0, opts.maxChars) : text;
}

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout || FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function validateVideoUrl(rawUrl) {
  const parsed = validateHttpUrl(rawUrl);
  if (!detectPlatform(parsed)) throw new Error('YouTube, Instagram, TikTok 영상 링크만 지원합니다.');
  return parsed;
}

function validateHttpUrl(rawUrl) {
  if (!rawUrl) throw new Error('url 필요');
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    throw new Error('올바른 URL이 아닙니다.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('http/https URL만 지원합니다.');
  return parsed;
}

function detectPlatform(url) {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube';
  if (host.endsWith('instagram.com')) return 'instagram';
  if (host.endsWith('tiktok.com')) return 'tiktok';
  return '';
}

function videoIdFromUrl(url) {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') return normalizeYoutubeId(parts[0]);
  if (host.endsWith('youtube.com')) {
    if (['shorts', 'embed', 'live'].includes(parts[0])) return normalizeYoutubeId(parts[1]);
    return normalizeYoutubeId(url.searchParams.get('v'));
  }
  return '';
}

function normalizeYoutubeId(value) {
  return String(value || '').match(/[A-Za-z0-9_-]{11}/)?.[0] || '';
}

function youtubeThumb(id) {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return '';
}

function postCaptionFromHtml(html, platform = '') {
  const source = String(html || '');
  const candidates = [
    metaContent(source, 'og:description'),
    metaContent(source, 'twitter:description'),
    metaContent(source, 'description'),
    ...jsonLdCaptionCandidates(source),
    ...embeddedCaptionCandidates(source),
  ];
  return bestCaption(candidates, platform);
}

function jsonLdCaptionCandidates(html) {
  const candidates = [];
  const scripts = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    const raw = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      collectCaptionValues(JSON.parse(decodeHtml(raw)), candidates);
    } catch {}
  }
  return candidates;
}

function collectCaptionValues(value, out) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach(item => collectCaptionValues(item, out));
    return;
  }
  if (typeof value !== 'object') return;
  for (const key of ['description', 'caption', 'text', 'articleBody']) {
    if (typeof value[key] === 'string') out.push(value[key]);
  }
  for (const key of ['@graph', 'video', 'mainEntity', 'sharedContent']) collectCaptionValues(value[key], out);
}

function embeddedCaptionCandidates(html) {
  const decoded = decodeUnicodeEscapes(String(html || '')).replace(/\\u0026/g, '&');
  const patterns = [
    /"edge_media_to_caption"\s*:\s*\{\s*"edges"\s*:\s*\[\s*\{\s*"node"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/g,
    /"caption"\s*:\s*\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"/g,
    /"caption"\s*:\s*"((?:\\.|[^"\\]){12,})"/g,
    /"description"\s*:\s*"((?:\\.|[^"\\]){12,})"/g,
    /"share_desc"\s*:\s*"((?:\\.|[^"\\]){12,})"/g,
    /"desc"\s*:\s*"((?:\\.|[^"\\]){12,})"/g,
  ];
  return patterns.flatMap(pattern => [...decoded.matchAll(pattern)].map(match => decodeJsonString(match[1])));
}

function bestCaption(values, platform) {
  return [...new Set(values.map(cleanCaption).filter(Boolean))]
    .map(value => ({ value, score: captionScore(value, platform) }))
    .filter(row => row.score > -100)
    .sort((a, b) => b.score - a.score)[0]?.value || '';
}

function cleanCaption(value) {
  return cleanText(decodeJsonString(value)).replace(/\\\//g, '/').slice(0, 6000);
}

function captionScore(value, platform) {
  const text = String(value || '');
  let score = Math.min(text.length, 800);
  if (/(재료|레시피|만드는\s*법|조리|큰술|작은술|g|그램|분량|ingredients?|recipe|directions?)/i.test(text)) score += 500;
  if (/(김치|계란|파스타|두부|마늘|양파|소금|후추|오일|버터|치즈)/i.test(text)) score += 180;
  if (/see instagram photos and videos|watch.*tiktok|log in|sign up|팔로워|following/i.test(text)) score -= platform === 'instagram' ? 700 : 300;
  return score;
}

function decodeJsonString(value) {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`);
  } catch {
    return decodeUnicodeEscapes(raw)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, ' ')
      .replace(/\\\\/g, '\\');
  }
}

function titleTag(html) {
  return decodeHtml(String(html || '').match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '');
}

function extractPrice(text) {
  const plain = cleanText(text);
  const match = plain.match(/(?:₩|￦)\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})|([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\s*원/);
  return Number((match?.[1] || match?.[2] || '').replace(/,/g, '')) || 0;
}

function quantityNear(text, name) {
  const source = String(text || '');
  const idx = source.indexOf(name);
  if (idx === -1) return '';
  const near = source.slice(Math.max(0, idx - 24), idx + name.length + 42);
  const qty = near.match(/(\d+(?:\.\d+)?\s*(?:g|그램|kg|개|큰술|작은술|스푼|컵|ml|mL|장|쪽|알|꼬집|봉|팩|캔|줌|술|대))/);
  return qty ? qty[1].replace(/\s+/g, '') : '';
}

function cleanRecipeTitle(value) {
  return cleanText(value).replace(/\s*#\S+/g, '').slice(0, 90);
}

function cleanText(value) {
  return decodeHtml(String(value || '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeText(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, '').replace(/[“”"']/g, '');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function decodeUnicodeEscapes(value) {
  return String(value || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function absolutize(value, base) {
  try {
    const url = new URL(String(value || '').trim(), base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function cleanJSON(text) {
  let s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const slice = extractFirstJSON(s);
  if (slice) s = slice;
  s = s.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(s);
}

function extractFirstJSON(text) {
  const s = String(text || '');
  const starts = ['{', '['].map(ch => s.indexOf(ch)).filter(idx => idx >= 0).sort((a, b) => a - b);
  if (!starts.length) return '';
  const start = starts[0];
  const opener = s[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return '';
}
