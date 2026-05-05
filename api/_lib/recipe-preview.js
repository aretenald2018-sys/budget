import { callLLMJSON } from './llm-router.js';

const FETCH_TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function buildRecipePreview(rawUrl) {
  const target = validateRecipeUrl(String(rawUrl || '').trim());
  const platform = detectPlatform(target);
  const meta = await fetchVideoMeta(target, platform);
  const transcript = platform === 'youtube' ? await fetchYouTubeTranscript(target).catch(() => '') : '';
  const textForAi = [meta.title, meta.author, meta.description, transcript].filter(Boolean).join('\n\n').slice(0, 18000);
  if (!textForAi.trim()) {
    return {
      ok: false,
      warning: '영상 제목이나 자막을 읽지 못했어요. 재료를 직접 입력해 주세요.',
      transcriptAvailable: false,
      ...meta,
      url: target.href,
      domain: target.hostname.replace(/^www\./, ''),
      source: { platform, id: videoIdFromUrl(target), caption: '' },
      ingredients: [],
      steps: [],
      summary: '',
    };
  }

  const fallback = fallbackRecipe(meta, transcript);
  try {
    const { data: parsed, provider } = await extractRecipeJSON({
      target,
      platform,
      meta,
      transcript,
      textForAi,
      fallback,
    });
    const normalized = normalizeRecipe(parsed, fallback);
    return {
      ok: true,
      ...meta,
      title: normalized.title || meta.title,
      url: target.href,
      domain: target.hostname.replace(/^www\./, ''),
      source: { platform, id: videoIdFromUrl(target), caption: transcript.slice(0, 1200) },
      ingredients: normalized.ingredients,
      steps: normalized.steps,
      summary: normalized.summary,
      servings: normalized.servings,
      confidence: normalized.confidence,
      provider,
      transcriptAvailable: !!transcript,
      warning: transcript
        ? ''
        : meta.description
          ? '자막을 찾지 못해 영상 설명문 중심으로 정리했어요.'
          : '자막과 영상 설명문을 서버에서 읽지 못해 제목/썸네일만 반영했어요.',
    };
  } catch (err) {
    return {
      ok: true,
      ...meta,
      ...fallback,
      url: target.href,
      domain: target.hostname.replace(/^www\./, ''),
      source: { platform, id: videoIdFromUrl(target), caption: transcript.slice(0, 1200) },
      transcriptAvailable: !!transcript,
      provider: fallback.provider || 'heuristic',
      warning: `AI 정리가 실패해 기본 정보만 채웠어요: ${err.message}`,
    };
  }
}

async function extractRecipeJSON({ target, platform, meta, transcript, textForAi, fallback }) {
  const systemPrompt = 'You extract cooking recipe data from video metadata/transcripts. Return only JSON. Be conservative: if uncertain, leave fields empty rather than inventing ingredients.';
  const userPrompt = JSON.stringify({
    instruction: [
      'Input may be a Korean/English YouTube Shorts title, description, and transcript.',
      'Extract only plausible cooking ingredients and cooking steps.',
      'Return {title, summary, servings, ingredients:[{name, quantity}], steps:[string], confidence, notes}.',
      'Korean UI copy. Ingredient quantity can be empty if unknown.',
      'Do not include shopping links. Do not hallucinate specific brands.',
    ],
    input: {
      url: target.href,
      platform,
      title: meta.title,
      author: meta.author,
      transcriptAvailable: !!transcript,
      text: textForAi,
    },
    fallbackShape: fallback,
  });
  return callLLMJSON(systemPrompt, userPrompt, 4096, {
    prefer: process.env.RECIPE_LLM_PROVIDER || 'groq',
  });
}

function validateRecipeUrl(rawUrl) {
  if (!rawUrl) throw new Error('url 필요');
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('올바른 URL이 아닙니다.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('http/https URL만 지원합니다.');
  const platform = detectPlatform(parsed);
  if (!platform) throw new Error('YouTube, Instagram, TikTok 영상 링크만 지원합니다.');
  return parsed;
}

function detectPlatform(url) {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube';
  if (host.endsWith('instagram.com')) return 'instagram';
  if (host.endsWith('tiktok.com')) return 'tiktok';
  return '';
}

async function fetchVideoMeta(url, platform) {
  if (platform === 'youtube') {
    const oembed = await fetchJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(url.href)}&format=json`).catch(() => null);
    const details = await fetchYouTubePlayerDetails(url).catch(() => ({}));
    return {
      title: details.title || oembed?.title || 'YouTube 레시피',
      author: details.author || oembed?.author_name || '',
      imageUrl: oembed?.thumbnail_url || '',
      description: details.shortDescription || '',
      platform,
    };
  }
  const html = await fetchText(url.href).catch(() => '');
  return {
    title: metaContent(html, 'og:title') || (platform === 'instagram' ? 'Instagram 레시피' : 'TikTok 레시피'),
    author: '',
    imageUrl: metaContent(html, 'og:image') || '',
    description: metaContent(html, 'og:description') || '',
    platform,
  };
}

async function fetchYouTubeTranscript(url) {
  const id = videoIdFromUrl(url);
  if (!id) return '';
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=ko`;
  const html = await fetchText(watchUrl);
  const tracks = extractCaptionTracks(html);
  if (!tracks.length) return '';
  const preferred = tracks.find(t => /^ko/i.test(t.languageCode || ''))
    || tracks.find(t => /^en/i.test(t.languageCode || ''))
    || tracks[0];
  const baseUrl = decodeUnicodeEscapes(preferred.baseUrl || '').replace(/\\u0026/g, '&');
  if (!baseUrl) return '';
  const transcriptUrl = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
  const body = await fetchText(transcriptUrl);
  return parseTranscript(body).slice(0, 16000);
}

async function fetchYouTubePlayerDetails(url) {
  const id = videoIdFromUrl(url);
  if (!id) return {};
  const player = await fetchYouTubeInnerPlayer(id).catch(() => null);
  if (player?.videoDetails) {
    const details = player.videoDetails;
    return {
      title: String(details.title || '').trim(),
      author: String(details.author || '').trim(),
      shortDescription: String(details.shortDescription || '').trim(),
    };
  }
  const html = await fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=ko`);
  const response = extractInitialPlayerResponse(html);
  const details = response?.videoDetails || {};
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
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240531.01.00',
          hl: 'ko',
          gl: 'KR',
        },
      },
      videoId,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message || `youtubei ${res.status}`);
  return data;
}

function extractInitialPlayerResponse(html) {
  const text = String(html || '');
  const marker = 'ytInitialPlayerResponse';
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const eq = text.indexOf('{', idx);
  if (eq === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = eq; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(eq, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractCaptionTracks(html) {
  const marker = '"captionTracks":';
  const idx = html.indexOf(marker);
  if (idx === -1) return [];
  const start = idx + marker.length;
  const end = html.indexOf(']', start);
  if (end === -1) return [];
  const raw = html.slice(start, end + 1);
  try {
    return JSON.parse(decodeUnicodeEscapes(raw));
  } catch {
    try {
      return JSON.parse(raw.replace(/\\"/g, '"').replace(/\\u0026/g, '&'));
    } catch {
      return [];
    }
  }
}

function parseTranscript(body) {
  const text = String(body || '').trim();
  if (!text) return '';
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      return (json.events || [])
        .flatMap(ev => ev.segs || [])
        .map(seg => seg.utf8 || '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return '';
    }
  }
  return [...text.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map(match => htmlDecode(match[1]))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackRecipe(meta, transcript) {
  const source = String(transcript || meta.description || '').trim();
  const ingredients = heuristicIngredients(source);
  const steps = heuristicSteps(source);
  return {
    title: meta.title || '레시피',
    summary: source
      ? '영상 설명/자막에서 읽은 내용을 바탕으로 만든 레시피 후보입니다.'
      : '영상 메타데이터만 읽혀 재료를 직접 확인해야 합니다.',
    servings: '',
    ingredients,
    steps,
    confidence: transcript ? 0.45 : source ? 0.34 : 0.2,
  };
}

function heuristicIngredients(text) {
  const source = String(text || '').replace(/#[^\s#]+/g, ' ');
  const names = [
    '양파', '토마토', '레몬즙', '레몬', '맛소금', '소금', '후추',
    '마늘', '대파', '쪽파', '올리브오일', '들기름', '참기름', '간장', '식초',
    '고추장', '된장', '설탕', '꿀', '계란', '달걀', '닭가슴살', '두부',
  ];
  const found = [];
  for (const name of names) {
    if (!source.includes(name)) continue;
    if (found.some(item => item.name === name || item.name.includes(name) || name.includes(item.name))) continue;
    if (looksLikeServingSuggestion(source, name)) continue;
      found.push({ id: `ing_${name}`, name, quantity: quantityNear(source, name), decidedSourceId: '', sources: [] });
  }
  return found.slice(0, 16);
}

function looksLikeServingSuggestion(text, name) {
  const source = String(text || '');
  const idx = source.indexOf(name);
  if (idx === -1) return false;
  const windowText = source.slice(Math.max(0, idx - 12), idx + name.length + 18);
  return /먹어도|곁들|토핑|플레이팅/.test(windowText);
}

function heuristicSteps(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .filter(line => !/^\(.+\)$/.test(line))
    .filter(line => !/먹어도/.test(line))
    .filter(line => /(썰|담|뿌|넣|섞|삶|굽|볶|끓|올리|먹|비율|취향)/.test(line))
    .map(line => line.replace(/\s+/g, ' '))
    .slice(0, 10);
}

function quantityNear(text, name) {
  const source = String(text || '');
  const idx = source.indexOf(name);
  if (idx === -1) return '';
  const windowText = source.slice(Math.max(0, idx - 20), idx + name.length + 40);
  const ratio = windowText.match(/(\d+\s*:\s*\d+)\s*비율/);
  if (ratio) return ratio[1];
  const qty = windowText.match(/(\d+(?:\.\d+)?\s*(?:g|그램|개|큰술|작은술|스푼|뿌리|컵|ml|mL))/);
  return qty ? qty[1].replace(/\s+/g, '') : '';
}

function normalizeRecipe(parsed, fallback) {
  const ingredients = Array.isArray(parsed?.ingredients) ? parsed.ingredients : [];
  const steps = Array.isArray(parsed?.steps) ? parsed.steps : [];
  return {
    title: String(parsed?.title || fallback.title || '').trim().slice(0, 90),
    summary: String(parsed?.summary || fallback.summary || '').trim().slice(0, 220),
    servings: String(parsed?.servings || fallback.servings || '').trim().slice(0, 30),
    ingredients: ingredients.map((ing, index) => ({
      id: `ing_${Date.now().toString(36)}_${index}`,
      name: String(ing?.name || '').trim().slice(0, 40),
      quantity: String(ing?.quantity || '').trim().slice(0, 40),
      decidedSourceId: '',
      sources: [],
    })).filter(ing => ing.name).slice(0, 20),
    steps: steps.map(step => String(step || '').trim()).filter(Boolean).slice(0, 12),
    confidence: Math.max(0.05, Math.min(0.98, Number(parsed?.confidence) || fallback.confidence || 0.35)),
  };
}

function videoIdFromUrl(url) {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
  if (host.endsWith('youtube.com')) {
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/').filter(Boolean)[1] || '';
    return url.searchParams.get('v') || '';
  }
  return '';
}

async function fetchJSON(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/json,*/*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function metaContent(html, property) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegExp(property)}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escapeRegExp(property)}["'][^>]*>`, 'i');
  const match = String(html || '').match(pattern) || String(html || '').match(reverse);
  return match ? htmlDecode(match[1]) : '';
}

function htmlDecode(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\\n/g, ' ')
    .trim();
}

function decodeUnicodeEscapes(value) {
  return String(value || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
