// ================================================================
// choice/capture-ui.js — selection capture and preview UI helpers
// ================================================================

import { fmtKRW } from '../utils/format.js';
import { escHtml } from '../utils/dom.js';
import {
  domainFromUrl,
  safeExternalUrl,
} from './share-preview.js?v=20260505-visual-modal';
import { searchSiteRepresentativeImages } from './visual-search.js?v=20260506-site-images';

export function choiceInlineCaptureForm() {
  return `
    <form id="choice-feed-capture-form" class="choice-feed-search" data-choice-capture-form autocomplete="off">
      <span class="glyph">⌕</span>
      <input name="url" placeholder="상품 링크, 이미지 URL, 릴스 붙여넣기">
      <button class="cart-preview-btn" type="submit">확인</button>
      <input type="hidden" name="type" value="simple">
      <input type="hidden" name="kind" value="other">
      <input type="hidden" name="title" value="">
      <input type="hidden" name="price" value="">
      <input type="hidden" name="note" value="">
      <input type="hidden" name="imageUrl" value="">
      <input type="hidden" name="sourcePlatform" value="">
      <input type="hidden" name="recipeSummary" value="">
      <input type="hidden" name="recipeStepsJson" value="">
      <textarea name="siteImagesJson" hidden></textarea>
      <textarea name="ingredientsText" hidden></textarea>
      <textarea name="stepsText" hidden></textarea>
    </form>
  `;
}

export function previewHtml(item) {
  const imageUrl = safeExternalUrl(item.imageUrl);
  const sourceText = item.previewSource === 'google_shopping'
    ? `Google Shopping${item.source ? ` · ${item.source}` : ''}`
    : item.domain;
  return `
    ${imageUrl ? `<img src="${escHtml(imageUrl)}" alt="" onerror="this.remove()">` : ''}
    <div>
      <strong>${escHtml(item.title || '정보 후보')}</strong>
      <span>${item.type === 'recipe' ? '레시피 링크' : (item.price ? fmtKRW(item.price) : '가격 미확인')}${sourceText ? ` · ${escHtml(sourceText)}` : ''}</span>
    </div>
  `;
}

export async function fillSiteImagePreview(form, url, previewEl) {
  const candidates = await searchSiteRepresentativeImages(url, { limit: 6 }).catch(() => []);
  if (form?.elements?.siteImagesJson) {
    form.elements.siteImagesJson.value = JSON.stringify(candidates);
  }
  if (candidates[0]?.url && form?.elements?.imageUrl && !safeExternalUrl(form.elements.imageUrl.value)) {
    form.elements.imageUrl.value = candidates[0].url;
  }
  if (previewEl && candidates.length) {
    previewEl.innerHTML = siteImagePreviewHtml(url, candidates);
  }
  return candidates;
}

export function parseSiteImageCandidates(value) {
  try {
    const rows = JSON.parse(String(value || '[]'));
    if (!Array.isArray(rows)) return [];
    return rows.map(row => ({
      label: String(row?.label || '사이트 이미지').slice(0, 80),
      url: safeExternalUrl(row?.url || row?.imageUrl),
      query: String(row?.query || ''),
      credit: String(row?.credit || row?.source || '사이트 대표 이미지').slice(0, 160),
    })).filter(row => row.url).slice(0, 6);
  } catch {
    return [];
  }
}

export function emptyCartHtml() {
  return `
    <div class="empty-state compact cart-empty">
      <div>아직 담긴 후보가 없습니다</div>
      <p>상품 링크, 레시피 영상, 공유 텍스트를 아래 도크에 붙여넣어 보세요.</p>
    </div>
  `;
}

export function visualSearchEmptyHtml(searched) {
  return `<div class="choice-condition-empty">${searched ? '검색 결과가 없습니다. 상품명이나 장소명을 더 구체적으로 바꿔보세요.' : '검색어를 확인하고 공개 이미지 검색을 눌러주세요.'}</div>`;
}

export function choiceVisualCandidateButtonHtml(candidate, actionAttr, ownerAttrs) {
  const imageUrl = safeExternalUrl(candidate?.url || candidate?.imageUrl);
  const label = candidate?.label || candidate?.title || '이미지 후보';
  const credit = candidate?.credit || candidate?.source || '이미지 후보';
  return `
    <button type="button" class="choice-stock-option" ${actionAttr} ${ownerAttrs} data-image-url="${escAttr(imageUrl)}" data-credit="${escAttr(credit)}" data-query="${escAttr(candidate?.query || '')}">
      <span class="choice-stock-thumb">
        ${imageUrl ? `<img src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.closest('.choice-stock-option')?.classList.add('image-failed'); this.remove()">` : ''}
        <i>${escHtml(label.slice(0, 2) || '이미지')}</i>
      </span>
      <span class="choice-stock-copy">
        <strong>${escHtml(label)}</strong>
        <em>${escHtml(credit)}</em>
      </span>
    </button>
  `;
}

function siteImagePreviewHtml(url, candidates = []) {
  const first = candidates[0] || {};
  const imageUrl = safeExternalUrl(first.url);
  return `
    ${imageUrl ? `<img src="${escHtml(imageUrl)}" alt="" onerror="this.remove()">` : ''}
    <div>
      <strong>${escHtml(domainFromUrl(url) || '사이트')} 대표 이미지 ${candidates.length}개</strong>
      <span>저장 후 이미지 바꾸기에서 후보를 고를 수 있습니다.</span>
    </div>
  `;
}

function escAttr(value) {
  return escHtml(String(value || ''));
}
