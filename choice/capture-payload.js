// ================================================================
// choice/capture-payload.js - selection capture normalization
// ================================================================

import {
  cleanSharedTitle,
  domainFromUrl,
  extractFirstUrl,
  fillIfEmpty,
  inferKind,
  safeExternalUrl,
} from './share-preview.js?v=20260505-visual-modal';
import { directVisualFromUrl } from './video-preview.js?v=20260506-instagram-microlink';
import {
  recipeMemoFromParts,
  shouldReplaceAutoRecipeMemo,
  shouldReplaceAutoRecipeTitle,
} from './recipe-autofill.js?v=20260507-recipe-memo-save-fix';

export function capturePayloadFromFormData(fd) {
  const rawCapture = String(fd.get('url') || '').trim();
  const url = safeExternalUrl(rawCapture) || extractFirstUrl(rawCapture);
  const inferredType = fd.get('type') || inferCaptureType(rawCapture);
  const preview = recipePreviewFromFormData(fd);
  const title = String(fd.get('title') || '').trim() || preview.title || cleanSharedTitle(rawCapture, url, 0) || domainFromUrl(url) || '선택 후보';
  const imageUrl = safeExternalUrl(fd.get('imageUrl')) || safeExternalUrl(preview.imageUrl) || directVisualFromUrl(url)?.imageUrl || '';
  const recipeIngredients = inferredType === 'recipe' ? firstNonEmptyArray(parseIngredientsText(fd.get('ingredientsText')), preview.ingredients) : [];
  const recipeSteps = inferredType === 'recipe' ? firstNonEmptyArray(parseStepsText(fd.get('stepsText'), fd.get('recipeStepsJson')), preview.steps) : [];
  const recipeSummary = inferredType === 'recipe' ? String(fd.get('recipeSummary') || preview.summary || '').trim() : '';
  const rawNote = String(fd.get('note') || '').trim();
  const note = inferredType === 'recipe'
    ? recipeMemoFromParts({ summary: recipeSummary || rawNote, ingredients: recipeIngredients, steps: recipeSteps })
    : (rawNote || (!url ? rawCapture : ''));
  return {
    type: inferredType,
    title,
    price: numberFromInput(fd.get('price')),
    kind: fd.get('kind') || (inferredType === 'recipe' ? 'eat' : inferKind(rawCapture)),
    url,
    domain: domainFromUrl(url),
    imageUrl,
    originalImageUrl: imageUrl,
    visualMode: imageUrl ? 'original' : 'generated',
    visualQuery: title,
    note,
    status: 'active',
    source: inferredType === 'recipe'
      ? (preview.source || {
        platform: fd.get('sourcePlatform') || sourcePlatformFromUrl(url).platform,
        caption: rawCapture,
      })
      : null,
    ingredients: recipeIngredients,
    summary: inferredType === 'recipe' ? recipeSummary : '',
    steps: recipeSteps,
  };
}

export function applyRecipePreviewToForm(form, data) {
  if (form.elements.title && data.title && shouldReplaceAutoRecipeTitle(form.elements.title.value)) {
    form.elements.title.value = data.title;
  } else {
    fillIfEmpty(form.elements.title, data.title);
  }
  if (form.elements.imageUrl) form.elements.imageUrl.value = data.imageUrl || '';
  if (form.elements.sourcePlatform) form.elements.sourcePlatform.value = data.source?.platform || sourcePlatformFromUrl(data.url).platform;
  if (form.elements.recipeSummary) form.elements.recipeSummary.value = data.summary || '';
  if (form.elements.recipeStepsJson) form.elements.recipeStepsJson.value = JSON.stringify(Array.isArray(data.steps) ? data.steps : []);
  if (form.elements.recipePreviewJson) form.elements.recipePreviewJson.value = JSON.stringify(recipePreviewForForm(data));
  if (form.elements.ingredientsText && Array.isArray(data.ingredients) && data.ingredients.length) {
    form.elements.ingredientsText.value = data.ingredients
      .map(ing => `${ing.name || ''}${ing.quantity ? ` | ${ing.quantity}` : ''}`.trim())
      .join('\n');
  }
  if (form.elements.stepsText && Array.isArray(data.steps) && data.steps.length) {
    form.elements.stepsText.value = data.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  }
  if (form.elements.note && shouldReplaceAutoRecipeMemo(form.elements.note.value)) {
    form.elements.note.value = recipeMemoFromParts({
      summary: data.summary || '',
      ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
      steps: Array.isArray(data.steps) ? data.steps : [],
    });
  }
  if (form.elements.type) form.elements.type.value = 'recipe';
  if (form.elements.kind) form.elements.kind.value = 'eat';
}

export function inferCaptureType(text) {
  const source = String(text || '').toLowerCase();
  if (/(youtube\.com|youtu\.be|instagram\.com\/reel|tiktok\.com|shorts)/i.test(source)) return 'recipe';
  return /(레시피|재료|요리법|만드는\s*법|recipe|ingredients)/i.test(source) ? 'recipe' : 'simple';
}

export function sourcePlatformFromUrl(url) {
  const value = String(url || '').toLowerCase();
  if (/youtube\.com|youtu\.be/.test(value)) return { platform: 'youtube', label: 'YT', name: 'YouTube', className: 'yt' };
  if (/instagram\.com\/reel/.test(value)) return { platform: 'instagram', label: 'REELS', name: 'Instagram', className: 'ig' };
  if (/instagram\.com/.test(value)) return { platform: 'instagram', label: 'IG', name: 'Instagram', className: 'ig' };
  if (/tiktok\.com/.test(value)) return { platform: 'tiktok', label: 'TT', name: 'TikTok', className: 'tk' };
  return { platform: 'web', label: 'WEB', name: 'Web', className: 'web' };
}

function recipePreviewFromFormData(fd) {
  try {
    const parsed = JSON.parse(String(fd.get('recipePreviewJson') || '{}'));
    if (!parsed || typeof parsed !== 'object') return {};
    return recipePreviewForForm(parsed);
  } catch {
    return {};
  }
}

function recipePreviewForForm(data = {}) {
  return {
    title: String(data.title || '').trim(),
    url: safeExternalUrl(data.url),
    imageUrl: safeExternalUrl(data.imageUrl),
    source: data.source && typeof data.source === 'object' ? {
      platform: String(data.source.platform || '').trim(),
      id: String(data.source.id || '').trim(),
      caption: String(data.source.caption || '').trim().slice(0, 1200),
    } : null,
    summary: String(data.summary || '').trim(),
    ingredients: normalizeRecipeIngredients(data.ingredients),
    steps: normalizeRecipeSteps(data.steps),
  };
}

function normalizeRecipeIngredients(value) {
  return Array.isArray(value)
    ? value.map((ing, index) => ({
      id: String(ing?.id || `ing_${index}`).trim(),
      name: String(ing?.name || '').trim(),
      quantity: String(ing?.quantity || '').trim(),
      decidedSourceId: String(ing?.decidedSourceId || '').trim(),
      sources: Array.isArray(ing?.sources) ? ing.sources : [],
    })).filter(ing => ing.name)
    : [];
}

function normalizeRecipeSteps(value) {
  return Array.isArray(value) ? value.map(step => String(step || '').trim()).filter(Boolean) : [];
}

function parseIngredientsText(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(row => row.trim())
    .filter(Boolean)
    .map(row => {
      const [name, ...rest] = row.split('|');
      return {
        id: makeId('ing'),
        name: String(name || '').trim(),
        quantity: rest.join('|').trim(),
        decidedSourceId: '',
        sources: [],
      };
    })
    .filter(row => row.name);
}

function parseStepsText(text, json) {
  const fromText = String(text || '')
    .split(/\r?\n/)
    .map(row => row.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
  if (fromText.length) return fromText;
  try {
    const parsed = JSON.parse(String(json || '[]'));
    return normalizeRecipeSteps(parsed);
  } catch {
    return [];
  }
}

function firstNonEmptyArray(primary, fallback) {
  return Array.isArray(primary) && primary.length ? primary : (Array.isArray(fallback) ? fallback : []);
}

function numberFromInput(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0));
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
