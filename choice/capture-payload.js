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
} from './share-preview.js?v=20260514-vercel-api';
import { directVisualFromUrl } from './video-preview.js?v=20260506-instagram-microlink';
import {
  recipeMemoFromParts,
  recipePresetPreviewFromText,
  shouldReplaceAutoRecipeMemo,
  shouldReplaceAutoRecipeTitle,
} from './recipe-autofill.js?v=20260514-recipe-heuristic';

export function capturePayloadFromFormData(fd) {
  const rawCapture = String(fd.get('url') || '').trim();
  const url = safeExternalUrl(rawCapture) || extractFirstUrl(rawCapture);
  const inferredType = fd.get('type') || inferCaptureType(rawCapture);
  const preview = recipePreviewFromFormData(fd);
  const fallbackPreview = inferredType === 'recipe' ? recipePresetPreviewFromText([
    rawCapture,
    fd.get('title'),
    preview.title,
    preview.summary,
    fd.get('note'),
  ].filter(Boolean).join('\n'), url, preview) : null;
  const title = String(fd.get('title') || '').trim() || preview.title || fallbackPreview?.title || cleanSharedTitle(rawCapture, url, 0) || domainFromUrl(url) || '선택 후보';
  const imageUrl = safeExternalUrl(fd.get('imageUrl')) || safeExternalUrl(preview.imageUrl) || safeExternalUrl(fallbackPreview?.imageUrl) || directVisualFromUrl(url)?.imageUrl || '';
  const recipeIngredients = inferredType === 'recipe' ? firstNonEmptyArray(parseIngredientsText(fd.get('ingredientsText')), preview.ingredients, fallbackPreview?.ingredients) : [];
  const recipeSteps = inferredType === 'recipe' ? firstNonEmptyArray(parseStepsText(fd.get('stepsText'), fd.get('recipeStepsJson')), preview.steps, fallbackPreview?.steps) : [];
  const recipeSummary = inferredType === 'recipe' ? String(fd.get('recipeSummary') || preview.summary || fallbackPreview?.summary || '').trim() : '';
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
      ? (preview.source || fallbackPreview?.source || {
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
  const preview = recipePreviewWithFallback(data);
  if (form.elements.title && preview.title && shouldReplaceAutoRecipeTitle(form.elements.title.value)) {
    form.elements.title.value = preview.title;
  } else {
    fillIfEmpty(form.elements.title, preview.title);
  }
  if (form.elements.imageUrl) form.elements.imageUrl.value = preview.imageUrl || '';
  if (form.elements.sourcePlatform) form.elements.sourcePlatform.value = preview.source?.platform || sourcePlatformFromUrl(preview.url).platform;
  if (form.elements.recipeSummary) form.elements.recipeSummary.value = preview.summary || '';
  if (form.elements.recipeStepsJson) form.elements.recipeStepsJson.value = JSON.stringify(Array.isArray(preview.steps) ? preview.steps : []);
  if (form.elements.recipePreviewJson) form.elements.recipePreviewJson.value = JSON.stringify(recipePreviewForForm(preview));
  if (form.elements.ingredientsText && Array.isArray(preview.ingredients) && preview.ingredients.length) {
    form.elements.ingredientsText.value = preview.ingredients
      .map(ing => `${ing.name || ''}${ing.quantity ? ` | ${ing.quantity}` : ''}`.trim())
      .join('\n');
  }
  if (form.elements.stepsText && Array.isArray(preview.steps) && preview.steps.length) {
    form.elements.stepsText.value = preview.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  }
  if (form.elements.note && shouldReplaceAutoRecipeMemo(form.elements.note.value)) {
    form.elements.note.value = recipeMemoFromParts({
      summary: preview.summary || '',
      ingredients: Array.isArray(preview.ingredients) ? preview.ingredients : [],
      steps: Array.isArray(preview.steps) ? preview.steps : [],
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
    return recipePreviewWithFallback(parsed);
  } catch {
    return {};
  }
}

function recipePreviewWithFallback(data = {}) {
  const preview = recipePreviewForForm(data);
  const fallback = recipePresetPreviewFromText([
    preview.title,
    preview.summary,
    data.note,
    data.source?.caption,
  ].filter(Boolean).join('\n'), preview.url, preview);
  if (!fallback) return preview;
  return recipePreviewForForm({
    ...preview,
    title: preview.title || fallback.title,
    url: preview.url || fallback.url,
    imageUrl: preview.imageUrl || fallback.imageUrl,
    source: preview.source || fallback.source,
    summary: preview.summary || fallback.summary,
    ingredients: preview.ingredients.length ? preview.ingredients : fallback.ingredients,
    steps: preview.steps.length ? preview.steps : fallback.steps,
  });
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
      acquired: !!ing?.acquired,
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
        acquired: false,
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

function firstNonEmptyArray(...groups) {
  return groups.find(group => Array.isArray(group) && group.length) || [];
}

function numberFromInput(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0));
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
