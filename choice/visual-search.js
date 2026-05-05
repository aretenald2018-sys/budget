// ================================================================
// choice/visual-search.js — browser-safe public image search
// ================================================================

export const PUBLIC_VISUAL_PROVIDER_LABEL = 'Openverse / Wikimedia Commons';

const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/images/';
const COMMONS_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
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
