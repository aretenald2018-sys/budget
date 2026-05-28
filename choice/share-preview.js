// ================================================================
// choice/share-preview.js — URL, share target, and static-host preview helpers
// ================================================================

import { escHtml } from '../utils/dom.js';
import { externalApiUrl } from '../utils/api-base.js?v=20260514-vercel-api';
import { hasServerApi } from '../utils/runtime.js?v=20260505-github-pages';

function escAttr(value) {
  return escHtml(String(value || ''));
}

export function productPreviewEndpoint(url) {
  const external = externalApiUrl('/api/preview', { kind: 'product', url });
  if (external) return external;
  if (!hasServerApi()) return '';
  return `/api/market-symbol-search?productUrl=${encodeURIComponent(url)}`;
}

export function recipePreviewEndpoint(url, { text, title } = {}) {
  const external = externalApiUrl('/api/preview', { kind: 'recipe', url, text, title });
  if (external) return external;
  if (!hasServerApi()) return '';
  const params = new URLSearchParams({ recipeUrl: url });
  if (text) params.set('text', text);
  if (title) params.set('title', title);
  return `/api/market-symbol-search?${params.toString()}`;
}

export async function fetchRecipePreview(url, options = {}) {
  const endpoint = recipePreviewEndpoint(url, options);
  if (!endpoint) return null;
  const response = await fetch(endpoint);
  const data = await readJsonResponse(response);
  return response.ok && data.ok ? data : null;
}

export function visualSearchEndpoint(query) {
  if (!hasServerApi()) return '';
  return `/api/visual-search?q=${encodeURIComponent(query)}`;
}

export function shouldFetchRemoteVisualSearch() {
  return hasServerApi();
}

export function apiUnavailableError() {
  const err = new Error('GitHub Pages에서는 미리보기 API를 사용할 수 없습니다.');
  err.code = 'API_UNAVAILABLE';
  return err;
}

export async function readJsonResponse(response) {
  const text = await response.text();
  const type = response.headers.get('content-type') || '';
  if (type.includes('text/html') || /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) {
    const err = new Error('상품 미리보기 API를 사용할 수 없습니다.');
    err.code = 'API_UNAVAILABLE';
    throw err;
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const err = new Error('상품 미리보기 API 응답을 읽지 못했어요.');
    err.code = 'API_UNAVAILABLE';
    throw err;
  }
}

export function cartBookmarkletHref() {
  const targetBase = typeof window !== 'undefined'
    ? new URL('./', window.location.href).href.replace(/\/$/, '')
    : '';
  const code = `(function(){function meta(k){var e=document.querySelector('meta[property="'+k+'"],meta[name="'+k+'"]');return e?(e.content||'').trim():''}function one(s){try{return document.querySelector(s)}catch(e){return null}}function text(e){return e?(e.textContent||e.content||'').trim():''}function price(){var keys=['product:price:amount','og:price:amount','twitter:data1'];for(var i=0;i<keys.length;i++){var v=meta(keys[i]);if(/[0-9]/.test(v))return v.replace(/[^0-9]/g,'')}var sels=['.total-price strong','.prod-price-content strong','.prod-sale-price strong','[class*="totalPrice"] strong','[class*="price"] strong','[data-testid*="price"]'];for(var j=0;j<sels.length;j++){var v=text(one(sels[j]));if(/[0-9]/.test(v))return v.replace(/[^0-9]/g,'')}var body=(document.body&&document.body.innerText||'').match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\\s*원/);return body?body[1].replace(/,/g,''):''}var title=meta('og:title')||meta('twitter:title')||document.title||'';var image=meta('og:image')||meta('twitter:image')||'';var selected=(window.getSelection&&String(window.getSelection()))||'';var u='${targetBase}/?shareTarget=cart&title='+encodeURIComponent(title)+'&text='+encodeURIComponent(selected)+'&url='+encodeURIComponent(location.href)+'&imageUrl='+encodeURIComponent(image)+'&price='+encodeURIComponent(price());window.open(u,'_blank','noopener')})();`;
  return `javascript:${encodeURI(code)}`;
}

export function cartBookmarkletHint() {
  const href = cartBookmarkletHref();
  return `
    <details class="cart-bookmarklet">
      <summary>
        <span>쿠팡이 자동입력 안 될 때</span>
        <em>북마클릿 설치</em>
      </summary>
      <p>쿠팡처럼 서버 읽기가 막히는 사이트는 <b>내 브라우저가 보고 있는 페이지</b>에서 제목·이미지·가격을 읽어 앱으로 보내는 방식이 가장 현실적입니다. 아래 버튼을 북마크바로 끌어두거나, 복사해서 북마크 URL에 붙여넣으세요.</p>
      <div class="cart-bookmarklet-actions">
        <a class="cart-bookmarklet-btn" href="${escAttr(href)}" data-cart-action="explain-bookmarklet" draggable="true">＋ 소계획에 담기</a>
        <button type="button" class="cart-bookmarklet-copy" data-cart-action="copy-bookmarklet">스크립트 복사</button>
      </div>
      <p class="cart-bookmarklet-hint">설치 후 쿠팡 상품 페이지에서 이 북마크를 누르면 소계획 탭이 열리고 제목·이미지·가격 후보가 채워집니다. 가격은 페이지 구조에 따라 비어 있을 수 있어요.</p>
    </details>
  `;
}

export function fillIfEmpty(input, value) {
  if (!input || !value) return;
  if (!String(input.value || '').trim()) input.value = value;
}

export function inferTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('q')
      || parsed.searchParams.get('query')
      || parsed.searchParams.get('keyword')
      || parsed.searchParams.get('search')
      || '';
  } catch {
    return '';
  }
}

export function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function safeExternalUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

export function extractFirstUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[)\].,;]+$/, '') : '';
}

export function extractPrice(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ');
  const patterns = [
    /(?:₩|￦)\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})/i,
    /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\s*원/i,
    /가격[:\s]*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return Number(match[1].replace(/,/g, '')) || 0;
  }
  return 0;
}

export function cleanSharedTitle(text, url, price) {
  let title = String(text || '').split(/\r?\n/).find(Boolean) || '';
  if (url) title = title.replace(url, '');
  if (price) {
    const comma = price.toLocaleString('ko-KR');
    title = title
      .replace(new RegExp(`${comma}\\s*원?`, 'g'), '')
      .replace(new RegExp(`${price}\\s*원?`, 'g'), '');
  }
  title = title
    .replace(/https?:\/\/[^\s]+/ig, '')
    .replace(/(?:₩|￦)\s*[0-9,]+/g, '')
    .replace(/\s*[-|·]\s*쿠팡.*$/i, '')
    .replace(/\s*[-|·]\s*NAVER.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return title.slice(0, 80);
}

export function compactSharedNote(text, url) {
  return String(text || '')
    .replace(url || '', '')
    .replace(/https?:\/\/[^\s]+/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function inferKind(text) {
  const value = String(text || '').toLowerCase();
  if (/와인|wine|pinot|chardonnay|샤르도네|피노/.test(value)) return 'wine';
  if (/셔츠|팬츠|니트|자켓|코트|신발|의류|clothes|shirt|pants|jacket|shoes/.test(value)) return 'wear';
  if (/식품|먹|과자|커피|음식|food|meal|recipe|reels|shorts|youtube|instagram/.test(value)) return 'eat';
  if (/수납|조명|침구|가구|생활|home|interior/.test(value)) return 'home';
  return 'other';
}
