import { escHtml } from '../utils/dom.js';
import { safeExternalUrl } from './share-preview.js?v=20260505-refactor';

export function choiceDisplayImageUrl(item, originalImageUrl = '', autoCandidate = null) {
  const visualMode = item?.visualMode || 'auto';
  const savedImage = safeExternalUrl(item?.imageUrl || originalImageUrl);
  if (visualMode === 'custom' || visualMode === 'stock' || visualMode === 'original') {
    return safeExternalUrl(savedImage || autoCandidate?.url);
  }
  return safeExternalUrl(savedImage || autoCandidate?.url);
}

export function choiceCardTargetAttrs(row = {}) {
  if (row.item) return `data-visual-kind="item" data-item-id="${escAttr(row.item.id)}"`;
  if (row.pact) return `data-visual-kind="pact" data-pact-id="${escAttr(row.pact.id)}"`;
  return '';
}

export function choiceVisualMarkup(row, size = 'card') {
  const imageUrl = safeExternalUrl(row?.imageUrl);
  const fallback = choiceGeneratedVisual(row?.title || '이미지 후보', row?.kind || 'calm', size);
  if (imageUrl) {
    return `
      <div class="choice-image-stack has-image">
        ${fallback}
        <img class="choice-image-bg" src="${escHtml(imageUrl)}" alt="" loading="lazy" aria-hidden="true" onerror="this.remove()">
        <img class="choice-image-main" src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()">
      </div>
    `;
  }
  return fallback;
}

export function choiceDetailVisualMarkup(row, actionAttrs = '') {
  const imageUrl = safeExternalUrl(row?.imageUrl);
  const title = row?.title || '선택 후보';
  const badge = row?.visualMode === 'generated'
    ? '생성형 비주얼'
    : row?.visualMode === 'stock'
      ? '추천 이미지'
      : imageUrl
        ? '현재 이미지'
        : '앱 비주얼';
  return `
    <section class="choice-detail-visual choice-detail-poster ${imageUrl ? 'has-image' : 'is-generated'}">
      <div class="choice-detail-poster-fallback">${choiceGeneratedVisual(title, row?.kind || 'calm', 'hero')}</div>
      ${imageUrl ? `
        <div class="choice-detail-poster-bg"><img src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()"></div>
        <div class="choice-detail-poster-frame"><img src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.closest('.choice-detail-poster')?.classList.add('image-failed'); this.remove()"></div>
      ` : ''}
      <div class="choice-detail-poster-copy">
        <span>${escHtml(badge)}</span>
        <strong>${escHtml(title)}</strong>
      </div>
      <button class="choice-detail-image-action" type="button" ${actionAttrs}>이미지 바꾸기</button>
    </section>
  `;
}

export function choiceGeneratedVisual(title, kind = 'calm', size = 'card') {
  return `
    <div class="choice-generated-visual ${escAttr(kind)} ${escAttr(size)}">
      <b>${escHtml(generatedVisualKeyword(title))}</b>
    </div>
  `;
}

export function choiceOriginalImageUrl(item) {
  return safeExternalUrl(item?.originalImageUrl)
    || safeExternalUrl(item?.imageUrl)
    || youtubeThumbnailFromUrl(item?.url)
    || '';
}

export function choiceImageSearchQuery(item) {
  const source = choiceVisualSourceText(item);
  const title = choiceVisualProductTitle(item);
  const linkKeyword = choiceVisualLinkKeyword(item);
  const queryTitle = title || linkKeyword || '선택 후보';
  const intent = choiceVisualIntentKey(source);
  if (intent === 'travel-china') return '중국 여행';
  if (intent === 'travel-japan') return '일본 여행';
  if (intent === 'wellness-stay') return `${queryTitle} 호텔 리조트`;
  if (intent === 'salad') return '샐러드';
  if (intent === 'fresh-food') return /피코|pico|salsa|토마토|tomato/.test(source) ? '피코 데 가요' : '홈 쿠킹';
  if (intent === 'muscle-fit-top') return `${queryTitle} 머슬핏 티셔츠 상품 사진`;
  if (intent === 'shoes') return `${queryTitle} 신발 상품 사진`;
  if (intent === 'pants-shorts') return `${queryTitle} 팬츠 상품 사진`;
  if (intent === 'outerwear') return `${queryTitle} 아우터 상품 사진`;
  if (intent === 'shirt-top') return `${queryTitle} 상의 상품 사진`;
  if (intent === 'activewear') return `${queryTitle} 운동복 상품 사진`;
  if (intent === 'fashion') return `${queryTitle} 의류 상품 사진`;
  if (intent === 'sensory') return '와인 테이블';
  return title || '라이프스타일';
}

export function choiceAutoVisualCandidate(item) {
  return null;
}

export function choiceVisualSourceText(item, queryText = '') {
  return `${queryText || ''} ${item?.title || ''} ${item?.what?.title || ''} ${item?.kind || ''} ${item?.what?.category || ''} ${item?.note || ''} ${item?.what?.note || ''} ${item?.url || ''} ${item?.what?.sourceUrl || ''}`.toLowerCase();
}

function choiceVisualProductTitle(item) {
  return String(item?.title || item?.what?.title || '').trim().replace(/\s+/g, ' ');
}

function choiceVisualLinkKeyword(item) {
  const url = item?.url || item?.what?.sourceUrl || item?.sourceUrl || '';
  try {
    const parsed = new URL(url);
    const queryKeys = ['q', 'query', 'keyword', 'search', 'k', 'title', 'name'];
    const fromQuery = queryKeys.map(key => parsed.searchParams.get(key)).find(Boolean);
    const pathWords = decodeURIComponent(parsed.pathname || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .split(/[\/\-_+.,]+/)
      .filter(part => /[가-힣a-zA-Z]{2,}/.test(part) && !/^\d+$/.test(part))
      .slice(-5)
      .join(' ');
    return String(fromQuery || pathWords || parsed.hostname.replace(/^www\./, '').split('.')[0] || '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

export function choiceVisualIntentKey(sourceText) {
  const source = String(sourceText || '').toLowerCase();
  if (/중국|china|베이징|beijing|상하이|shanghai|홍콩|hong ?kong|대만|taiwan|타이베이|taipei|중화/.test(source)) return 'travel-china';
  if (/일본|japan|도쿄|tokyo|오사카|osaka|교토|kyoto|여행|travel/.test(source)) return 'travel-japan';
  if (/park\s*roche|parkroche|파크\s*로쉬|파크로쉬|파크\s*로체|파크로체|호텔|리조트|숙소|호캉스|스파|웰니스|hotel|resort|stay|spa|wellness/.test(source)) return 'wellness-stay';
  if (/샐러드|salad/.test(source)) return 'salad';
  if (/피코|pico|salsa|토마토|tomato|recipe|레시피|eat|food|요리/.test(source)) return 'fresh-food';
  if (/머슬\s*핏|머슬핏|muscle\s*fit|슬림\s*핏|슬림핏|slim\s*fit|컴프레션|compression|짐웨어|gymwear|헬스\s*(티|상의|셔츠)|운동\s*(티|상의|셔츠)/.test(source)) return 'muscle-fit-top';
  if (/러닝화|운동화|스니커즈|신발|sneakers?|running\s*shoes?|shoes?/.test(source)) return 'shoes';
  if (/반바지|하프\s*팬츠|하프팬츠|쇼츠|팬츠|바지|shorts?|pants?|trousers?/.test(source)) return 'pants-shorts';
  if (/패딩|다운|점퍼|자켓|재킷|코트|아우터|롱패딩|숏패딩|outer|outerwear|padding|puffer|down\s*jacket|jacket|coat|parka/.test(source)) return 'outerwear';
  if (/티셔츠|반팔|긴팔|셔츠|상의|후드|맨투맨|shirt|t-?shirt|tee|top|hood|sweatshirt/.test(source)) return 'shirt-top';
  if (/액티브|러닝|매쉬|메쉬|운동복|스포츠웨어|active|running|workout|athletic|sportswear/.test(source)) return 'activewear';
  if (/wear|fashion|옷|의류|musinsa|dope|발리안트/.test(source)) return 'fashion';
  if (/wine|와인|drink|술/.test(source)) return 'sensory';
  return 'lifestyle';
}

function youtubeThumbnailFromUrl(url) {
  const id = youtubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : '';
}

function youtubeVideoId(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.replace(/^\//, '').split('/')[0] || '';
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    const parts = parsed.pathname.split('/').filter(Boolean);
    const shortsIndex = parts.indexOf('shorts');
    if (shortsIndex >= 0) return parts[shortsIndex + 1] || '';
    const embedIndex = parts.indexOf('embed');
    if (embedIndex >= 0) return parts[embedIndex + 1] || '';
  } catch {
    return '';
  }
  return '';
}

function generatedVisualKeyword(title) {
  const clean = String(title || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts.slice(0, 3).join(' ') || 'Choice';
}

function escAttr(value) {
  return escHtml(String(value || ''));
}
