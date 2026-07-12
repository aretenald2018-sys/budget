// ================================================================
// shared/recipe/runtime.js - recipe item normalization/runtime helpers
// ================================================================

import { domainFromUrl, sourcePlatformFromUrl } from '../url.js';

export function isRecipeItem(item) {
  return item?.type === 'recipe' || Array.isArray(item?.ingredients) && item.ingredients.length > 0;
}

export function hasUnresolvedIngredients(item) {
  if (!isRecipeItem(item)) return false;
  const ingredients = normalizedIngredients(item);
  return !ingredients.length || ingredients.some(ing => !isIngredientDecided(ing));
}

export function isIngredientDecided(ing) {
  return !!ing?.acquired || !!selectedSource(ing);
}

export function normalizedIngredients(item) {
  return Array.isArray(item?.ingredients)
    ? item.ingredients.map((ing, index) => ({
      id: ing.id || `ing_${index}`,
      name: String(ing.name || '').trim() || `재료 ${index + 1}`,
      quantity: String(ing.quantity || '').trim(),
      decidedSourceId: String(ing.decidedSourceId || '').trim(),
      acquired: !!ing.acquired,
      sources: normalizedSources(ing),
    }))
    : [];
}

export function mergeRecipeIngredients(primary = [], fallback = []) {
  const seen = new Set();
  return [...primary, ...fallback].filter(ing => {
    const key = String(ing?.name || '').toLowerCase().replace(/\s+/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizedSources(ing) {
  return Array.isArray(ing?.sources)
    ? ing.sources.map((src, index) => ({
      id: src.id || `src_${index}`,
      store: String(src.store || '').trim(),
      title: String(src.title || '').trim(),
      url: String(src.url || '').trim(),
      domain: String(src.domain || domainFromUrl(src.url) || '').trim(),
      price: Math.max(0, Math.round(Number(src.price) || 0)),
      imageUrl: String(src.imageUrl || src.image || '').trim(),
      shipping: String(src.shipping || '').trim(),
    }))
    : [];
}

export function selectedSource(ing) {
  const sources = normalizedSources(ing);
  if (!sources.length) return null;
  return sources.find(src => src.id === ing.decidedSourceId) || null;
}

export function itemDecisionTotal(item) {
  if (!isRecipeItem(item)) return Number(item.price) || 0;
  return normalizedIngredients(item).reduce((sum, ing) => sum + (Number(selectedSource(ing)?.price) || 0), 0);
}

export function sourcePlatform(item) {
  const platform = String(item?.source?.platform || '').toLowerCase();
  if (platform === 'youtube') return { platform, label: 'YT', name: 'YouTube', className: 'yt' };
  if (platform === 'instagram') return { platform, label: 'REELS', name: 'Instagram', className: 'ig' };
  if (platform === 'tiktok') return { platform, label: 'TT', name: 'TikTok', className: 'tk' };
  if (platform === 'web') return { platform, label: 'WEB', name: 'Web', className: 'web' };
  return sourcePlatformFromUrl(item?.url || '');
}

export function storeClassName(src) {
  const text = `${src.store || ''} ${src.domain || ''}`.toLowerCase();
  if (/coupang|쿠팡/.test(text)) return 'coupang';
  if (/kurly|컬리/.test(text)) return 'kurly';
  if (/oasis|오아시스/.test(text)) return 'oasis';
  if (/naver|smartstore|스마트|네이버/.test(text)) return 'naver';
  return 'store';
}

export function storeInitial(src) {
  const name = src.store || src.domain || '몰';
  if (/coupang|쿠팡/i.test(name)) return '쿠';
  if (/kurly|컬리/i.test(name)) return '컬';
  if (/oasis|오아시스/i.test(name)) return '오';
  if (/naver|smartstore|스마트|네이버/i.test(name)) return 'N';
  return name.slice(0, 1).toUpperCase();
}

export function storeNameFromDomain(domain) {
  const value = String(domain || '').toLowerCase();
  if (value.includes('coupang')) return '쿠팡';
  if (value.includes('kurly')) return '컬리';
  if (value.includes('oasis')) return '오아시스';
  if (value.includes('naver') || value.includes('smartstore')) return '스마트스토어';
  return domain || '쇼핑몰';
}

export function formatPriceShort(value) {
  const n = Number(value) || 0;
  return n ? n.toLocaleString('ko-KR') : '';
}
