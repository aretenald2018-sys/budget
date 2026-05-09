import { getAdminDb, userScope, FieldValue } from './firebase-admin.js';
import { buildRecipePreview } from './recipe-preview.js';

const DEFAULT_MAX = 10;
const DEFAULT_LOOKBACK = 80;

export async function processPendingRecipeItems({ max = DEFAULT_MAX, lookback = DEFAULT_LOOKBACK } = {}) {
  const db = getAdminDb();
  const uid = userScope();
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.collection('cart_items')
    .orderBy('createdAt', 'desc')
    .limit(Math.max(max, lookback))
    .get();

  const candidates = snap.docs
    .map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter(shouldAnalyzeRecipe)
    .slice(0, max);

  const results = [];
  for (const item of candidates) {
    results.push(await analyzeRecipeItem(item));
  }

  return {
    scanned: snap.size,
    candidates: candidates.length,
    parsed: results.filter(row => row.status === 'parsed').length,
    skipped: results.filter(row => row.status === 'skipped').length,
    failed: results.filter(row => row.status === 'failed').length,
    results,
  };
}

function shouldAnalyzeRecipe(item) {
  if (item?.type !== 'recipe') return false;
  if (!isVideoRecipeUrl(item.url)) return false;
  const status = String(item.recipeAnalysisStatus || '').toLowerCase();
  if (status === 'parsed' || status === 'skipped') return false;
  if (status === 'failed') return Number(item.recipeAnalysisRetryCount || 0) < 2;
  return true;
}

async function analyzeRecipeItem(item) {
  const startedPatch = {
    recipeAnalysisStatus: 'processing',
    recipeAnalysisStartedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await item.ref.set(startedPatch, { merge: true });

  try {
    const preview = await buildRecipePreview(item.url);
    const patch = recipePatchFromPreview(item, preview);
    await item.ref.set(patch, { merge: true });
    return {
      id: item.id,
      status: patch.recipeAnalysisStatus,
      transcriptAvailable: patch.recipeTranscriptAvailable,
      provider: patch.recipeAnalysisProvider,
      ingredients: Array.isArray(patch.ingredients) ? patch.ingredients.length : existingIngredients(item).length,
      steps: Array.isArray(patch.steps) ? patch.steps.length : existingSteps(item).length,
      warning: patch.recipeAnalysisWarning || '',
    };
  } catch (err) {
    const patch = {
      recipeAnalysisStatus: 'failed',
      recipeAnalysisWarning: err.message || '레시피 AI 분석 실패',
      recipeAnalysisRetryCount: FieldValue.increment(1),
      recipeAnalyzedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await item.ref.set(patch, { merge: true });
    return { id: item.id, status: 'failed', error: err.message || String(err) };
  }
}

function recipePatchFromPreview(item, preview = {}) {
  const parsedIngredients = normalizeIngredients(preview.ingredients);
  const parsedSteps = normalizeSteps(preview.steps);
  const ingredients = parsedIngredients.length ? parsedIngredients : existingIngredients(item);
  const steps = parsedSteps.length ? parsedSteps : existingSteps(item);
  const summary = String(preview.summary || item.summary || '').trim();
  const status = parsedIngredients.length || parsedSteps.length ? 'parsed' : 'skipped';
  const patch = {
    recipeAnalysisStatus: status,
    recipeAnalysisProvider: String(preview.provider || '').trim(),
    recipeAnalysisWarning: String(preview.warning || '').trim(),
    recipeAnalysisConfidence: Math.max(0, Math.min(1, Number(preview.confidence) || 0)),
    recipeTranscriptAvailable: !!preview.transcriptAvailable,
    recipeAnalyzedAt: FieldValue.serverTimestamp(),
    recipeAnalysisRetryCount: 0,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (preview.title && shouldReplaceAutoTitle(item.title)) patch.title = String(preview.title).trim().slice(0, 90);
  if (preview.imageUrl && !item.imageUrl) {
    patch.imageUrl = String(preview.imageUrl).trim();
    patch.originalImageUrl = patch.imageUrl;
    patch.visualMode = 'original';
  }
  if (preview.source) patch.source = normalizeSource(preview.source, item.source);
  if (summary) patch.summary = summary;
  if (ingredients.length) patch.ingredients = ingredients;
  if (steps.length) patch.steps = steps;
  if ((ingredients.length || steps.length) && shouldReplaceAutoRecipeMemo(item.note || item.summary || '')) {
    patch.note = recipeMemoFromParts({ summary, ingredients, steps });
  }
  return patch;
}

function existingIngredients(item) {
  return normalizeIngredients(item.ingredients);
}

function existingSteps(item) {
  return normalizeSteps(item.steps);
}

function normalizeIngredients(value) {
  if (!Array.isArray(value)) return [];
  return value.map((ing, index) => {
    const name = String(ing?.name || '').trim();
    if (!name) return null;
    return {
      id: String(ing?.id || `ing_ai_${index}`).trim(),
      name: name.slice(0, 40),
      quantity: String(ing?.quantity || '').trim().slice(0, 40),
      decidedSourceId: String(ing?.decidedSourceId || '').trim(),
      sources: Array.isArray(ing?.sources) ? ing.sources : [],
    };
  }).filter(Boolean).slice(0, 20);
}

function normalizeSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.map(step => String(step || '').trim()).filter(Boolean).slice(0, 16);
}

function normalizeSource(source, fallback = null) {
  const base = source && typeof source === 'object' ? source : fallback;
  if (!base || typeof base !== 'object') return null;
  return {
    platform: String(base.platform || '').trim(),
    id: String(base.id || '').trim(),
    caption: String(base.caption || '').trim().slice(0, 1200),
  };
}

function recipeMemoFromParts({ summary = '', ingredients = [], steps = [] } = {}) {
  const blocks = [];
  const cleanSummary = String(summary || '').trim();
  if (cleanSummary) blocks.push(`요약\n${cleanSummary}`);
  const ingredientLines = ingredients
    .map(ing => ing.quantity ? `- ${ing.name}: ${ing.quantity}` : `- ${ing.name}`)
    .filter(Boolean);
  if (ingredientLines.length) blocks.push(`재료\n${ingredientLines.join('\n')}`);
  const stepLines = steps.map((step, index) => `${index + 1}. ${step}`);
  if (stepLines.length) blocks.push(`조리순서 요약\n${stepLines.join('\n')}`);
  return blocks.join('\n\n').trim();
}

function shouldReplaceAutoRecipeMemo(value) {
  const memo = String(value || '').trim();
  return !memo
    || /^(요약|재료|조리순서 요약)\n/.test(memo)
    || /^영상\s*제목에서.+기본\s*재료\s*후보를\s*채웠어요\.?$/i.test(memo);
}

function shouldReplaceAutoTitle(value) {
  const title = String(value || '').trim();
  return !title || /^(YouTube Shorts|YouTube 영상|Instagram 게시물|Instagram Reels|TikTok|영상 레시피|공유한 레시피)$/i.test(title);
}

function isVideoRecipeUrl(value) {
  return /(youtube\.com|youtu\.be|instagram\.com|tiktok\.com)/i.test(String(value || ''));
}
