// ================================================================
// api/_lib/public-visual-search.js — server-side public image search
// ================================================================

export const PUBLIC_VISUAL_PROVIDER_LABEL = 'Google / 공개 이미지 검색';

const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/images/';
const COMMONS_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
const JINA_READER_PREFIX = 'https://r.jina.ai/http://';
const SEARCH_TIMEOUT_MS = 9000;

export async function searchPublicVisualCandidates(query, opts = {}) {
  const q = normalizeQuery(query);
  if (!q) return [];

  const limit = Math.max(1, Math.min(12, Number(opts.limit) || 6));
  const settled = await Promise.allSettled([
    searchOpenverse(q, limit * 2),
    searchWikimediaCommons(q, limit * 2),
  ]);

  const items = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  return uniqueByImageUrl(items)
    .filter(item => safeImageUrl(item.url))
    .slice(0, limit);
}

export async function searchSiteRepresentativeImages(pageUrl, opts = {}) {
  const page = safeUrl(pageUrl);
  if (!page) return [];
  const limit = Math.max(1, Math.min(12, Number(opts.limit) || 6));
  const readerTexts = await fetchReaderTexts(page);
  if (!readerTexts.length) return [];

  const title = readerTexts.map(extractReaderTitle).find(Boolean) || hostLabel(page);
  const markdownImages = readerTexts.flatMap((text, readerIndex) => (
    extractMarkdownImages(text, page).map((item, index) => ({
      ...item,
      score: siteImageScore(item, index) - readerIndex,
    }))
  ));

  return uniqueByImageUrl(markdownImages)
    .filter(item => !isLikelyUiAsset(item))
    .filter(item => item.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => ({
      label: item.label || `${title} 대표 이미지 ${index + 1}`,
      url: item.url,
      sourceUrl: page,
      credit: `${hostLabel(page)} · 사이트 대표 이미지`,
      provider: 'site',
    }));
}

async function searchOpenverse(q, limit) {
  const url = new URL(OPENVERSE_ENDPOINT);
  url.searchParams.set('q', q);
  url.searchParams.set('page_size', String(Math.max(1, Math.min(20, limit))));
  url.searchParams.set('mature', 'false');

  const data = await fetchJson(url);
  return (data.results || []).map(item => {
    const creator = plainText(item.creator || '').slice(0, 40);
    const license = plainText(item.license || '').toUpperCase();
    return {
      label: plainText(item.title || q).slice(0, 70) || q,
      url: safeImageUrl(item.thumbnail || item.url),
      sourceUrl: safeUrl(item.foreign_landing_url),
      credit: ['Openverse', creator, license].filter(Boolean).join(' · '),
      provider: 'openverse',
    };
  }).filter(item => item.url);
}

async function searchWikimediaCommons(q, limit) {
  const url = new URL(COMMONS_ENDPOINT);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', q);
  url.searchParams.set('gsrnamespace', '6');
  url.searchParams.set('gsrlimit', String(Math.max(1, Math.min(20, limit))));
  url.searchParams.set('prop', 'imageinfo|info');
  url.searchParams.set('iiprop', 'url|mime|extmetadata');
  url.searchParams.set('iiurlwidth', '900');
  url.searchParams.set('inprop', 'url');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const data = await fetchJson(url);
  const pages = Object.values(data.query?.pages || {});
  return pages
    .sort((a, b) => (a.index || 999) - (b.index || 999))
    .map(page => {
      const info = page.imageinfo?.[0] || {};
      if (info.mime && !String(info.mime).startsWith('image/')) return null;
      const meta = info.extmetadata || {};
      const creator = plainText(meta.Artist?.value || meta.Credit?.value || '').slice(0, 40);
      const license = plainText(meta.LicenseShortName?.value || meta.License?.value || '').slice(0, 24);
      return {
        label: plainText(meta.ObjectName?.value || page.title || q).replace(/^File:/i, '').slice(0, 70) || q,
        url: safeImageUrl(info.thumburl || info.url),
        sourceUrl: safeUrl(page.fullurl || info.descriptionurl),
        credit: ['Wikimedia Commons', creator, license].filter(Boolean).join(' · '),
        provider: 'wikimedia-commons',
      };
    })
    .filter(Boolean)
    .filter(item => item.url);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`image search ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`site image search ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchReaderTexts(page) {
  const settled = await Promise.allSettled(
    readerUrlCandidates(page).map(url => fetchText(url))
  );
  return settled
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value);
}

function readerUrlCandidates(page) {
  const urls = [`${JINA_READER_PREFIX}${page}`];
  try {
    const parsed = new URL(page);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    urls.push(`${JINA_READER_PREFIX}${parsed.host}${path}`);

    const altHost = parsed.hostname.startsWith('www.')
      ? parsed.host.replace(/^www\./i, '')
      : `www.${parsed.host}`;
    urls.push(`${JINA_READER_PREFIX}${altHost}${path}`);
  } catch {
    // Invalid URLs are already filtered by safeUrl; keep the original reader URL only.
  }
  return [...new Set(urls)];
}

function extractMarkdownImages(text, baseUrl) {
  const out = [];
  const imageRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of text.matchAll(imageRe)) {
    const url = absolutizeImageUrl(match[2], baseUrl);
    if (!url) continue;
    out.push({
      label: readableImageLabel(match[1], url),
      url,
    });
  }
  return out;
}

function absolutizeImageUrl(value, baseUrl) {
  try {
    const url = new URL(String(value || '').trim(), baseUrl).href;
    return safeImageUrl(url);
  } catch {
    return '';
  }
}

function isLikelyUiAsset(item) {
  const text = `${item?.url || ''} ${item?.label || ''}`.toLowerCase();
  return /icon|logo|favicon|sprite|badge|marker|symbol|btn|button|arrow|sns|facebook|instagram|youtube|kakao/.test(text);
}

function siteImageScore(item, index) {
  const url = item.url.toLowerCase();
  const label = String(item.label || '').toLowerCase();
  let score = 80 - index;
  if (/card|hero|visual|main|slide|banner|room|stay|spa|fnb|wellness|treatment|experience|gallery|photo|image/.test(url)) score += 35;
  if (/대표|메인|객실|숙소|호텔|스파|웰니스|갤러리|hero|main|room|stay|spa|wellness|gallery/.test(label)) score += 18;
  if (/\.(jpe?g|png|webp)(?:[?#]|$)/.test(url)) score += 10;
  if (/icon|logo|favicon|sprite|badge|marker|symbol|btn|button|arrow|sns|facebook|instagram|youtube|kakao/.test(url)) score -= 75;
  if (/icon|logo|favicon/.test(label)) score -= 35;
  if (/\.(gif|svg)(?:[?#]|$)/.test(url)) score -= 60;
  return score;
}

function readableImageLabel(label, url) {
  const clean = plainText(label).replace(/^image\s*\d+$/i, '').trim();
  if (clean) return clean.slice(0, 70);
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b[0-9a-f]{6,}\b/ig, '')
      .replace(/\s+/g, ' ')
      .trim();
    return last.slice(0, 70);
  } catch {
    return '';
  }
}

function extractReaderTitle(text) {
  const match = String(text || '').match(/^Title:\s*(.+)$/m);
  return match ? plainText(match[1]).slice(0, 60) : '';
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '사이트';
  }
}

function uniqueByImageUrl(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const url = safeImageUrl(item.url);
    const key = canonicalImageKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, url });
  }
  return out;
}

function canonicalImageKey(url) {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.href.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeQuery(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function safeImageUrl(value) {
  const url = safeUrl(value);
  if (!url) return '';
  if (/\.(svg)(?:[?#]|$)/i.test(url)) return '';
  return url;
}

function safeUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
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
