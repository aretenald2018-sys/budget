const MAX_HTML_CHARS = 900000;
const FETCH_TIMEOUT_MS = 7000;
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export async function buildProductPreview(rawUrl) {
  const target = validateProductUrl(String(rawUrl || '').trim());
  try {
    const fetched = await fetchProductHtml(target.href);
    const html = fetched.html;
    // Coupang fetch may have followed link.coupang.com → real URL; use that for absolutising images.
    const effectiveUrl = fetched.finalUrl || target.href;
    const preview = parseProductPreview(html, effectiveUrl);
    if (!preview.title && !preview.imageUrl && !preview.price) {
      const shoppingPreview = await fetchShoppingPreview(target);
      if (shoppingPreview) {
        return {
          ok: true,
          ...shoppingPreview,
          url: target.href,
          domain: target.hostname.replace(/^www\./, ''),
        };
      }
      return {
        ok: false,
        blocked: false,
        warning: '상품 정보를 찾지 못했어요. 링크만 저장할 수 있습니다.',
        title: inferTitleFromUrl(target),
        price: 0,
        imageUrl: '',
        url: target.href,
        domain: target.hostname.replace(/^www\./, ''),
      };
    }
    return {
      ok: true,
      ...preview,
      url: effectiveUrl,
      domain: hostnameOf(effectiveUrl) || target.hostname.replace(/^www\./, ''),
    };
  } catch (err) {
    const shoppingPreview = await fetchShoppingPreview(target);
    if (shoppingPreview) {
      return {
        ok: true,
        ...shoppingPreview,
        url: target.href,
        domain: target.hostname.replace(/^www\./, ''),
        warning: err.message,
      };
    }
    const blocked = /403|Access Denied|Forbidden|쿠팡 차단/i.test(err.message);
    return {
      ok: false,
      blocked,
      warning: blocked && isCoupangUrl(target.href)
        ? '쿠팡이 자동 읽기를 막았어요. 쿠팡 앱의 "공유 → 장바구니"로 보내면 자동으로 채워져요.'
        : err.message,
      title: inferTitleFromUrl(target),
      price: 0,
      imageUrl: '',
      url: target.href,
      domain: target.hostname.replace(/^www\./, ''),
    };
  }
}

function validateProductUrl(rawUrl) {
  if (!rawUrl) throw new Error('url 필요');
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('올바른 URL이 아닙니다.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('http/https URL만 지원합니다.');
  if (isPrivateHost(parsed.hostname)) throw new Error('내부 주소는 미리보기를 만들 수 없습니다.');
  return parsed;
}

function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost'
    || host.endsWith('.local')
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    || host === '0.0.0.0'
    || host === '::1';
}

async function fetchProductHtml(url) {
  // Coupang는 데스크톱 UA + 데이터센터 IP 조합을 막음. 모바일 도메인 + iOS UA로 우회 시도.
  if (isCoupangUrl(url)) {
    const result = await fetchCoupangHtml(url);
    if (result) return result;
    // 쿠팡 전용 경로가 모두 실패했어도 일반 경로로 한 번 더 시도(혹시 통과할 수도)하되, 실패 시 차단으로 라벨링.
    const generic = await fetchGenericHtml(url).catch(() => null);
    if (generic && !looksLikeCoupangBlock(generic.html)) return generic;
    throw new Error('쿠팡 차단: Access Denied');
  }
  return fetchGenericHtml(url);
}

async function fetchGenericHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`상품 페이지 접근 실패 (${response.status}) ${text.includes('Access Denied') ? 'Access Denied' : ''}`.trim());
    return { html: text.slice(0, MAX_HTML_CHARS), finalUrl: response.url || url };
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────
// Coupang-specific fetch path
// ────────────────────────────────────────────────────────────────
function isCoupangUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'coupang.com'
      || host.endsWith('.coupang.com');
  } catch {
    return false;
  }
}

async function resolveCoupangShortLink(url) {
  // link.coupang.com/a/... 같은 단축 링크면 실제 상품 URL로 펼쳐야 파싱 가능.
  if (!/(^|\.)link\.coupang\.com$/i.test(safeHost(url))) return url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    });
    return response.url || url;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}

function toCoupangMobileUrl(url) {
  try {
    const parsed = new URL(url);
    if (!isCoupangUrl(url)) return url;
    parsed.hostname = parsed.hostname.replace(/^(www\.)?coupang\.com$/i, 'm.coupang.com');
    // 봇 시그널이 될 수 있는 트래킹 파라미터 제거 — itemId/vendorItemId/q만 유지
    const KEEP = new Set(['itemId', 'vendorItemId', 'q']);
    const next = new URLSearchParams();
    for (const [key, value] of parsed.searchParams) {
      if (KEEP.has(key)) next.set(key, value);
    }
    parsed.search = next.toString();
    return parsed.href;
  } catch {
    return url;
  }
}

async function fetchCoupangHtml(rawUrl) {
  const resolved = await resolveCoupangShortLink(rawUrl);
  const mobileUrl = toCoupangMobileUrl(resolved);
  const desktopUrl = resolved;

  const attempts = [
    { url: mobileUrl, headers: coupangHeaders(MOBILE_UA, 'https://m.coupang.com/') },
    { url: desktopUrl, headers: coupangHeaders(DESKTOP_UA, 'https://www.coupang.com/') },
    // 마지막 안전장치: 모바일 UA로 데스크톱 URL — 도메인 강제 변경이 실패한 경로 형식 케이스
    { url: desktopUrl, headers: coupangHeaders(MOBILE_UA, 'https://m.coupang.com/') },
  ];

  for (const attempt of attempts) {
    try {
      const html = await fetchHtmlWithHeaders(attempt.url, attempt.headers);
      if (!html) continue;
      if (looksLikeCoupangBlock(html)) continue;
      return { html, finalUrl: attempt.url };
    } catch {
      // 다음 전략
    }
  }
  return null;
}

function coupangHeaders(userAgent, referer) {
  const isMobile = /iPhone|Android/i.test(userAgent);
  return {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.6,en;q=0.4',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': referer,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...(isMobile
      ? { 'Sec-Ch-Ua-Mobile': '?1', 'Sec-Ch-Ua-Platform': '"iOS"' }
      : { 'Sec-Ch-Ua-Mobile': '?0', 'Sec-Ch-Ua-Platform': '"macOS"' }),
  };
}

async function fetchHtmlWithHeaders(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers });
    const text = await response.text();
    if (!response.ok) return null;
    return text.slice(0, MAX_HTML_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeCoupangBlock(html) {
  if (!html) return true;
  const head = String(html).slice(0, 8000);
  if (/Access Denied|You don't have permission|허용되지 않은 접근|cdn\.akamai\.net.*denied/i.test(head)) return true;
  // 차단 페이지는 보통 OG 태그·JSON-LD 모두 비어있음. 정상 페이지면 어느 하나는 있음.
  const hasOg = /<meta[^>]+og:title/i.test(head);
  const hasLd = /application\/ld\+json/i.test(html.slice(0, 30000));
  const hasNext = /__NEXT_DATA__/i.test(html.slice(0, 30000));
  if (!hasOg && !hasLd && !hasNext) return true;
  return false;
}

function safeHost(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function parseProductPreview(html, pageUrl) {
  const jsonLd = parseJsonLdProducts(html).find(item => item.title || item.imageUrl || item.price) || {};
  const nextData = parseNextDataProduct(html) || {};
  const title = cleanText(
    jsonLd.title
    || nextData.title
    || metaContent(html, 'property', 'og:title')
    || metaContent(html, 'name', 'twitter:title')
    || titleTag(html)
  );
  const imageUrl = absolutizeUrl(
    jsonLd.imageUrl
    || nextData.imageUrl
    || metaContent(html, 'property', 'og:image')
    || metaContent(html, 'name', 'twitter:image'),
    pageUrl
  );
  const price = Number(
    jsonLd.price
    || nextData.price
    || metaContent(html, 'property', 'product:price:amount')
    || findPriceInHtml(html)
    || 0
  );
  return {
    title: normalizeProductTitle(title),
    imageUrl: imageUrl || '',
    price: Number.isFinite(price) ? Math.round(price) : 0,
  };
}

// Next.js 페이지(쿠팡 등)는 상품 정보를 __NEXT_DATA__ JSON에 내장하는 경우가 많음.
function parseNextDataProduct(html) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  let data;
  try { data = JSON.parse(match[1]); } catch { return null; }
  const found = findProductLikeNode(data);
  if (!found) return null;
  return {
    title: found.productName || found.name || found.title || '',
    imageUrl: found.imageUrl || found.image || found.thumbnailUrl || (Array.isArray(found.images) ? found.images[0] : '') || '',
    price: Number(found.salePrice || found.finalPrice || found.discountedPrice || found.price || 0),
  };
}

function findProductLikeNode(node, depth = 0) {
  if (!node || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findProductLikeNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const hasName = node.productName || node.name || node.title;
  const hasPrice = node.salePrice || node.finalPrice || node.discountedPrice || node.price;
  if (hasName && hasPrice) return node;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (!value || typeof value !== 'object') continue;
    const found = findProductLikeNode(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function parseJsonLdProducts(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const items = [];
  for (const block of blocks) {
    const raw = decodeHtml(stripTags(block[1]).trim());
    try {
      collectJsonLdProducts(JSON.parse(raw), items);
    } catch {
      // ignore invalid embedded JSON
    }
  }
  return items;
}

function collectJsonLdProducts(value, items) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach(item => collectJsonLdProducts(item, items));
    return;
  }
  if (typeof value !== 'object') return;
  const type = Array.isArray(value['@type']) ? value['@type'].join(' ') : String(value['@type'] || '');
  if (/Product/i.test(type)) {
    const image = Array.isArray(value.image) ? value.image[0] : value.image;
    const offers = Array.isArray(value.offers) ? value.offers[0] : value.offers;
    items.push({
      title: value.name || '',
      imageUrl: image?.url || image || '',
      price: offers?.price || offers?.lowPrice || '',
    });
  }
  collectJsonLdProducts(value['@graph'], items);
}

function metaContent(html, attr, value) {
  const pattern = new RegExp(`<meta[^>]+${attr}=["']${escapeRegExp(value)}["'][^>]*>`, 'i');
  const tag = html.match(pattern)?.[0] || '';
  return decodeHtml(tag.match(/\scontent=["']([^"']*)["']/i)?.[1] || '');
}

function titleTag(html) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
}

function findPriceInHtml(html) {
  const compact = html.replace(/\s+/g, ' ');
  const patterns = [
    /"price"\s*:\s*"?([0-9]{3,})"?/i,
    /"salePrice"\s*:\s*"?([0-9]{3,})"?/i,
    /"finalPrice"\s*:\s*"?([0-9]{3,})"?/i,
    /([0-9]{1,3}(?:,[0-9]{3})+)\s*원/i,
  ];
  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (match) return String(match[1]).replace(/,/g, '');
  }
  return '';
}

function normalizeProductTitle(title) {
  return cleanText(title)
    .replace(/\s*[-|·]\s*(쿠팡|COUPANG|네이버.*|NAVER.*)$/i, '')
    .slice(0, 120);
}

function inferTitleFromUrl(url) {
  return cleanText(
    url.searchParams.get('q')
    || url.searchParams.get('query')
    || url.searchParams.get('keyword')
    || url.searchParams.get('search')
    || ''
  ).slice(0, 80);
}

async function fetchShoppingPreview(url) {
  const apiKey = process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY;
  const query = inferTitleFromUrl(url);
  if (!apiKey || !query) return null;
  try {
    const endpoint = new URL('https://serpapi.com/search.json');
    endpoint.searchParams.set('engine', 'google_shopping');
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('hl', 'ko');
    endpoint.searchParams.set('gl', 'kr');
    endpoint.searchParams.set('api_key', apiKey);
    const response = await fetch(endpoint.href, {
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const items = Array.isArray(data.shopping_results) ? data.shopping_results : [];
    const picked = pickShoppingResult(items, url.hostname);
    if (!picked) return null;
    return {
      title: cleanText(picked.title || query).slice(0, 120),
      imageUrl: picked.thumbnail || picked.serpapi_thumbnail || '',
      price: Math.round(Number(picked.extracted_price) || parsePriceText(picked.price) || 0),
      previewSource: 'google_shopping',
      source: picked.source || '',
    };
  } catch {
    return null;
  }
}

function pickShoppingResult(items, hostname) {
  const host = String(hostname || '').replace(/^www\./, '').toLowerCase();
  const coupangFirst = host.includes('coupang');
  const scored = items
    .filter(item => item && (item.title || item.thumbnail || item.price))
    .map(item => ({
      item,
      score: shoppingResultScore(item, host, coupangFirst),
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item || null;
}

function shoppingResultScore(item, host, coupangFirst) {
  const source = String(item.source || '').toLowerCase();
  const link = String(item.link || item.product_link || '').toLowerCase();
  let score = 0;
  if (item.thumbnail || item.serpapi_thumbnail) score += 3;
  if (item.extracted_price || item.price) score += 3;
  if (item.title) score += 2;
  if (host && (source.includes(host) || link.includes(host))) score += 6;
  if (coupangFirst && (source.includes('coupang') || source.includes('쿠팡') || link.includes('coupang'))) score += 8;
  return score;
}

function parsePriceText(value) {
  const match = String(value || '').replace(/\s+/g, ' ').match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})/);
  return match ? Number(match[1].replace(/,/g, '')) || 0 : 0;
}

function cleanText(value) {
  return decodeHtml(String(value || '').replace(/\s+/g, ' ').trim());
}

function stripTags(value) {
  return String(value || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function absolutizeUrl(value, baseUrl) {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return '';
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
