// ================================================================
// render-cart.js — wish + recipe decision board
// ================================================================

import {
  listCartItems, saveCartItem, updateCartItem, deleteCartItem,
  listCartCategories,
  listPacts, savePact, updatePact, deletePact,
  listMindbankEntries, saveMindbankEntry, listUrges, saveTransaction,
} from './data.js';
import { fmtKRW, relTime } from './utils/format.js';
import { normalizeDate, summarizeMindbank, weekdayPattern } from './utils/mindbank.js?v=20260504-mockup-complete';
import { $, escHtml } from './utils/dom.js';
import { showToast } from './utils/toast.js';
import {
  apiUnavailableError,
  cartBookmarkletHint,
  cartBookmarkletHref,
  cleanSharedTitle,
  compactSharedNote,
  domainFromUrl,
  extractFirstUrl,
  extractPrice,
  fillIfEmpty,
  fetchRecipePreview,
  inferKind,
  inferTitleFromUrl,
  productPreviewEndpoint,
  readJsonResponse,
  recipePreviewEndpoint,
  safeExternalUrl,
} from './choice/share-preview.js?v=20260515-share-caption';
import {
  choiceConditionSummary,
  conditionProgress,
  conditionValueLabel,
  effectivePactStatus,
  hasPactTriggerConflict,
  isBinaryConditionType,
  normalizeChoiceConditionType,
  normalizeChoicePactCondition,
  pactCategoryLabel,
  pactCategoryToTxCategory,
  pactConditionStats,
  pactConditions,
  pactCooloffLabel,
  pactCostSourceLabel,
  statusLabel,
  statusMessage,
  timestampMs,
  triggerIcon,
  triggerLabel,
  withPactRuntime,
} from './choice/conditions.js?v=20260505-visual-modal';
import {
  bankPatternInsight,
  bankPatternPeakLabel,
  choiceBankCollections,
  filterBankRowsByRange,
  pactBreakWarning,
} from './choice/bank.js?v=20260505-visual-modal';
import { renderWineCellar } from './urge/render-wine-cellar.js?v=20260506-choice-wine-cellar';
import {
  FALLBACK_CART_CATEGORIES,
  LEGACY_CATEGORY_LABELS,
  STATE,
} from './choice/state.js?v=20260505-visual-modal';
import {
  formDataToPact,
  getSelectedPactTriggerTypes,
  numberFromInput,
  primaryPactTriggerType,
} from './choice/pact-form.js?v=20260505-visual-modal';
import {
  itemConditionsFromForm,
  pactConditionsFromForm,
} from './choice/form-conditions.js?v=20260505-visual-modal';
import { choiceConditionEditFields } from './choice/condition-edit-fields.js?v=20260507-condition-edit-minimal';
import {
  choiceAutoVisualCandidate,
  choiceCardTargetAttrs,
  choiceDisplayImageUrl,
  choiceGeneratedVisual,
  choiceImageSearchQuery,
  choiceOriginalImageUrl,
  choiceVisualMarkup,
} from './choice/visual-assets.js?v=20260514-choice-a11y';
import {
  PUBLIC_VISUAL_PROVIDER_LABEL,
  searchPublicVisualCandidates,
  searchSiteRepresentativeImages,
} from './choice/visual-search.js?v=20260506-google-visual-search';
import {
  choiceInlineCaptureForm,
  choiceVisualCandidateButtonHtml,
  fillSiteImagePreview,
  parseSiteImageCandidates,
  previewHtml,
  visualSearchEmptyHtml,
} from './choice/capture-ui.js?v=20260514-recipe-ui';
import {
  applyRecipePreviewToForm,
  capturePayloadFromFormData,
  inferCaptureType,
  sourcePlatformFromUrl,
} from './choice/capture-payload.js?v=20260514-recipe-heuristic';
import {
  hasUnresolvedIngredients,
  isIngredientDecided,
  isRecipeItem,
  itemDecisionTotal, mergeRecipeIngredients,
  normalizedIngredients,
  sourcePlatform,
} from './choice/recipe-runtime.js?v=20260514-recipe-registered';
import {
  resolveDirectVisualFromUrl,
} from './choice/video-preview.js?v=20260506-instagram-microlink';
import {
  buildStaticRecipePreview,
  recipeMemoFromParts,
  recipePartsFromManualText,
  recipePresetPreviewFromText,
  shouldReplaceAutoRecipeMemo,
} from './choice/recipe-autofill.js?v=20260514-recipe-heuristic';
import {
  advanceRecipeStep,
  choiceRecipeDetailPanelHtml,
  recipeIngredientChipPreview,
} from './choice/recipe-ui.js?v=20260514-recipe-ui';

export async function renderCart() {
  const root = $('#tab-cart');
  const sharedDraft = consumeSharedCartDraft();
  STATE.segment = sharedDraft?.type === 'recipe' ? 'recipe' : (localStorage.getItem('budget.planSegment') || STATE.segment || 'want');
  if (!['want', 'do', 'recipe', 'wine', 'bank'].includes(STATE.segment)) STATE.segment = 'want';
  STATE.categories = await listCartCategories().catch(() => STATE.categories.length ? STATE.categories : FALLBACK_CART_CATEGORIES);
  root.innerHTML = `
    <div class="cart-board-shell subplan-shell choice-os-shell">
      <div id="cart-board-body"><div class="empty-state"><div class="loading-spinner"></div></div></div>
      <div id="choice-overlay-root"></div>
    </div>
  `;
  await loadCartItems();
  if (sharedDraft) {
    try {
      await saveSharedCartDraft(sharedDraft);
    } catch (err) {
      showToast(err.message || '공유 항목 저장 실패', 2400, 'error');
    }
  }
}

function openCaptureSheet() {
  const input = $('#choice-feed-capture-form')?.elements?.url;
  if (input) {
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  $('#cart-capture-layer')?.classList.add('open');
  setTimeout(() => $('#cart-add-form')?.elements?.url?.focus(), 0);
}

function closeCaptureSheet() {
  $('#cart-capture-layer')?.classList.remove('open');
}

function bindChoiceSheetDismiss(layer, closeFn) {
  if (!layer || layer.dataset.swipeDismissBound) return;
  layer.dataset.swipeDismissBound = '1';
  let startY = 0;
  let currentY = 0;
  const sheet = () => layer.querySelector('.tds-modal-sheet, .choice-visual-picker-panel, .choice-capture-sheet');
  layer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFn();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = choiceFocusableElements(layer);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  layer.addEventListener('touchstart', (event) => {
    const handle = event.target.closest('.tds-modal-handle, .choice-sheet-handle');
    if (!handle) return;
    startY = event.touches[0]?.clientY || 0;
    currentY = startY;
  }, { passive: true });
  layer.addEventListener('touchmove', (event) => {
    if (!startY) return;
    currentY = event.touches[0]?.clientY || startY;
    const delta = Math.max(0, currentY - startY);
    const panel = sheet();
    if (panel) panel.style.transform = `translateY(${Math.min(delta, 110)}px)`;
  }, { passive: true });
  layer.addEventListener('touchend', () => {
    if (!startY) return;
    const delta = Math.max(0, currentY - startY);
    const panel = sheet();
    if (panel) panel.style.transform = '';
    startY = 0;
    currentY = 0;
    if (delta > 64) closeFn();
  });
}

function choiceFocusableElements(root) {
  return Array.from(root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null);
}

async function loadCartItems() {
  const [items, categories, pacts, mindbankEntries, urges] = await Promise.all([
    listCartItems({ max: 140 }),
    listCartCategories(),
    listPacts({ max: 120 }).catch(() => []),
    listMindbankEntries({ max: 120 }).catch(() => []),
    listUrges({ max: 120 }).catch(() => []),
  ]);
  STATE.items = items.map(withRecipeFallbackDisplay);
  STATE.pacts = pacts;
  STATE.mindbankEntries = mindbankEntries;
  STATE.urges = urges;
  STATE.categories = mergeCategoriesWithItems(categories, items);
  const body = $('#cart-board-body');
  body.innerHTML = cartBoard(items, STATE.categories);
  if (STATE.segment === 'wine') await renderWineCellar($('#choice-wine-cellar-root', body)).catch(err => showWineCellarError(err, body));
  bindCartBoardEvents(body);
  bindCartForm();
  refreshChoiceOverlays();
}

function cartBoard(items, categories) {
  const active = items.filter(item => (item.status || 'active') === 'active');
  const bought = items.filter(item => item.status === 'bought');
  const recipes = active.filter(isRecipeItem);
  const simple = active.filter(item => !isRecipeItem(item));
  const pactStats = pactSummary(STATE.pacts);
  const mindbank = summarizeMindbank(STATE.mindbankEntries);
  const pacts = (STATE.pacts || []).map(withPactRuntime).filter(p => p.status !== 'archived');
  const featured = choiceFeaturedSlides({ simple, recipes, pacts });
  const rail = choicePromoRows({ simple, recipes, pacts });
  return `
    <div class="choice-feed-shell segment-${escAttr(STATE.segment)}">
      <div class="choice-feed-sticky">
        ${['bank', 'wine'].includes(STATE.segment) ? '' : `
          ${choiceInlineCaptureForm()}
        `}
        <div class="choice-feed-tabs">
          ${segmentButton('want', '보류함', { activeSegments: ['want', 'simple', 'recipe', 'wine'] })}${segmentButton('do', '약속')}${segmentButton('bank', '감각뱅크')}
        </div>
        ${['want', 'simple', 'recipe', 'wine'].includes(STATE.segment) ? choiceLibraryFilters() : ''}
      </div>
      ${STATE.segment === 'want' ? choiceVisualCarousel(featured) : ''}
      ${STATE.segment === 'want' ? choicePromoRail(rail) : ''}
      ${STATE.segment === 'wine' ? '<div id="choice-wine-cellar-root"></div>' : STATE.segment === 'bank'
        ? choiceBankFeed({ mindbank, entries: STATE.mindbankEntries, urges: STATE.urges, pacts: STATE.pacts })
        : STATE.segment === 'do'
          ? choiceHoldFeed({ simple, pacts, pactStats })
          : STATE.segment === 'recipe'
            ? choiceTodayFeed({ simple: recipes, title: '레시피함', emptyTitle: '아직 담은 레시피가 없습니다', emptyBody: '유튜브 Shorts 링크를 붙이면 제목·썸네일이 채워지고, 자주 만드는 요리는 재료까지 자동으로 정리돼요. 안 맞으면 자막을 붙여넣거나 직접 입력할 수 있어요.' })
            : STATE.segment === 'simple'
              ? choiceTodayFeed({ simple, pacts, mindbank, bought, title: '구매 보류함', emptyTitle: '아직 담은 선택이 없습니다', emptyBody: '이미지나 링크를 담으면 비교할 후보가 이곳에 쌓입니다.' })
              : choiceTodayFeed({ simple: active, pacts, mindbank, bought, title: '전체 보류함' })}
    </div>
  `;
}

function segmentButton(id, label, options = {}) {
  const activeSegments = options.activeSegments || [id];
  const readyCount = options.readyCount || 0;
  return `
    <button type="button" class="${activeSegments.includes(STATE.segment) ? 'active' : ''}" data-subplan-segment="${id}">
      ${escHtml(label)}${readyCount ? '<span class="ready-dot"></span>' : ''}
    </button>
  `;
}

function choiceLibraryFilters() {
  const filters = [
    ['want', '전체'],
    ['simple', '구매'],
    ['recipe', '레시피'],
    ['wine', '와인'],
  ];
  return `
    <div class="choice-feed-filters" aria-label="보류함 필터">
      ${filters.map(([id, label]) => `
        <button type="button" class="${STATE.segment === id ? 'active' : ''}" data-subplan-segment="${id}">
          ${escHtml(label)}
        </button>
      `).join('')}
    </div>
  `;
}

function choiceFeaturedSlides({ simple = [], recipes = [], pacts = [] }) {
  const rows = [
    ...simple.slice(0, 3).map(item => choiceCardModelFromItem(item)),
    ...recipes.slice(0, 2).map(item => choiceCardModelFromItem(item)),
    ...pacts.slice(0, 2).map(item => choiceCardModelFromPact(item)),
  ].filter(Boolean);
  return rows.slice(0, 3);
}

function choiceVisualCarousel(rows) {
  const safeRows = Array.isArray(rows) ? rows.slice(0, 3) : [];
  if (safeRows.length < 3) return '';
  const index = Math.max(0, Math.min(safeRows.length - 1, Number(STATE.heroIndex) || 0));
  return `
    <section class="choice-visual-carousel" data-choice-carousel style="--choice-slide-index:${index}">
      <div class="choice-visual-track">
        ${safeRows.map(row => `
          <article class="choice-visual-slide">
            ${choiceVisualMarkup(row, 'hero')}
            <div class="choice-visual-copy">
              <span>${escHtml(row.badge || '보류 중')}</span>
              <h2>${escHtml(row.title || '선택 후보')}</h2>
              <p>${escHtml(row.meta || '좋은 타이밍까지 보관합니다.')}</p>
            </div>
          </article>
        `).join('')}
      </div>
      <div class="choice-visual-dots">
        ${safeRows.map((_, dotIndex) => `<button type="button" class="${dotIndex === index ? 'active' : ''}" data-choice-slide-dot="${dotIndex}" aria-label="${dotIndex + 1}번째 이미지"></button>`).join('')}
      </div>
    </section>
  `;
}

function choicePromoRows({ simple = [], recipes = [], pacts = [] }) {
  return [
    ...simple.slice(0, 5).map(item => choiceCardModelFromItem(item)),
    ...recipes.slice(0, 3).map(item => choiceCardModelFromItem(item)),
    ...pacts.slice(0, 2).map(item => choiceCardModelFromPact(item)),
  ].filter(Boolean).slice(0, 8);
}

function choicePromoRail(rows) {
  if (!rows.length) return '';
  return `
    <div class="choice-promo-rail">
      ${rows.map(row => `
        <button type="button" class="choice-promo-chip" data-cart-action="open-detail" ${choiceCardTargetAttrs(row)}>
          ${choiceVisualMarkup(row, 'thumb')}
          <span>${escHtml(row.title || '선택 후보')}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function choiceTodayFeed({ simple = [], pacts = [], mindbank, bought = [], title = '오늘 열린 선택', emptyTitle, emptyBody }) {
  const readyPacts = pacts.filter(p => effectivePactStatus(p) === 'ready');
  const priorityProducts = [
    ...readyPacts.map(choiceCardModelFromPact),
    ...simple.map(choiceCardModelFromItem),
  ].filter(Boolean);
  const fallbackProducts = [
    ...simple.map(choiceCardModelFromItem),
    ...pacts.map(choiceCardModelFromPact),
  ].filter(Boolean);
  const products = priorityProducts.length ? priorityProducts : fallbackProducts;
  const visibleProducts = products.slice(0, 6);
  const countLabel = products.length > visibleProducts.length
    ? `${products.length}개 중 ${visibleProducts.length}개 표시`
    : `${visibleProducts.length || 0}개`;
  return `
    <section class="choice-feed-section">
      <div class="choice-section-head"><h2>${escHtml(title)}</h2><span>${escHtml(countLabel)}</span></div>
      ${visibleProducts.length ? `<div class="choice-product-grid">${visibleProducts.map(choiceProductCard).join('')}</div>` : choiceEmptyVisual(emptyTitle, emptyBody)}
    </section>
  `;
}

function choiceHoldFeed({ simple = [], pacts = [], pactStats }) {
  const conditionedItems = simple.filter(item => itemConditionStats(item, { includeSuggestions: false }).total > 0);
  const rows = [
    ...conditionedItems.map(choiceCardModelFromItem),
    ...pacts.map(choiceCardModelFromPact),
  ].filter(Boolean);
  return `
    ${choiceDoProgressCard({ rows, boughtCount: pactStats.fulfilled || 0 })}
    <section class="choice-feed-section">
      <div class="choice-section-head"><h2>조건 진행 중</h2><span>${rows.length}개</span></div>
      ${rows.length ? `<div class="choice-product-grid">${rows.map(choiceProductCard).join('')}</div>` : choiceEmptyVisual('진행 중인 조건이 없습니다', '보류한 선택에 조건을 붙이면 이곳에 쌓입니다.')}
    </section>
    <section class="choice-feed-section">
      <div class="choice-section-head"><h2>퀘스트</h2><span>준비 ${pactStats.ready}개</span></div>
      ${pactComposer()}
    </section>
  `;
}

function choiceDoProgressCard({ rows = [], boughtCount = 0 }) {
  return `
    <article class="choice-do-progress-card">
      <div class="h">
        <b>이번 2주 진행 요약</b>
      </div>
      <div class="stats">
        <div><b>${rows.length}</b><span>보류 중</span></div>
        <div><b>${boughtCount}</b><span>이번 주 실행</span></div>
      </div>
    </article>
  `;
}

function choiceBankFeed({ mindbank, entries, urges, pacts }) {
  const range = ['biweek', '30d', 'all'].includes(STATE.bankRange) ? STATE.bankRange : 'biweek';
  const rangeEntries = filterBankRowsByRange(entries, range);
  const rangeUrges = filterBankRowsByRange(urges, range);
  const rangeMindbank = summarizeMindbank(rangeEntries);
  const pattern = weekdayPattern(rangeUrges.length ? rangeUrges : rangeEntries);
  const visibleEntries = rangeEntries.length ? rangeEntries.slice(0, 5) : [];
  const bankTotal = Number(rangeMindbank.total) || 0;
  const kcal = Number(rangeMindbank.totalKcalSaved) || 0;
  const successRate = rangeMindbank.urges ? rangeMindbank.bypassRate : 0;
  const milestone = 500000;
  const milestonePct = Math.max(4, Math.min(100, Math.round((bankTotal / milestone) * 100)));
  const successCopy = rangeMindbank.urges
    ? `${rangeMindbank.urges}건의 선택 · ${successRate || 0}% 성공률`
    : '첫 좋은 선택을 기다리는 중';
  return `
    <section class="choice-bank-dashboard">
      <div class="choice-bank-hero">
        <span class="choice-bank-kicker">올해 참은 가치</span>
        <h2>감각뱅크</h2>
        <div class="choice-bank-hero-total"><strong>${bankTotal.toLocaleString('ko-KR')}</strong><small>원</small></div>
        <div class="choice-bank-hero-meta">
          <span>좋은 선택 ${rangeMindbank.goodChoices || 0}건</span>
          <span>덜 먹은 열량 ${kcal ? `-${Math.abs(kcal).toLocaleString('ko-KR')}kcal` : '0kcal'}</span>
          <span>${successRate || 0}% 성공률</span>
        </div>
        <div class="choice-bank-range">
          <button type="button" class="${range === 'biweek' ? 'active' : ''}" data-bank-range="biweek">격주</button>
          <button type="button" class="${range === '30d' ? 'active' : ''}" data-bank-range="30d">30일</button>
          <button type="button" class="${range === 'all' ? 'active' : ''}" data-bank-range="all">전체</button>
        </div>
        <div class="choice-bank-milestone">
          <div><span>다음 마일스톤</span><b>${bankTotal.toLocaleString('ko-KR')} / ${milestone.toLocaleString('ko-KR')}</b></div>
          <i><b style="width:${milestonePct}%"></b></i>
        </div>
        <div class="choice-bank-success-line"><i></i>${successCopy}</div>
      </div>
      <div class="choice-bank-pattern-card">
        <div class="choice-section-head"><h2>주간 충동 패턴</h2><span>${bankPatternPeakLabel(pattern)}</span></div>
        <div class="bars selection-flow-bars choice-bank-bars">
          ${pattern.map(row => `<div class="bar ${row.pct >= 100 ? 'peak' : ''}"><div class="v" style="height:${Math.max(6, row.pct)}%"></div><span class="lbl">${escHtml(row.label)}</span></div>`).join('')}
        </div>
        ${bankPatternInsight(pattern)}
      </div>
      <div class="choice-bank-recent">
        <div class="choice-section-head">
          <h2>최근 좋은 선택</h2>
          <span class="choice-section-note">감각뱅크에 쌓인 결과</span>
        </div>
        ${visibleEntries.length ? visibleEntries.map(bankChoiceCard).join('') : choiceEmptyVisual('아직 적립된 선택이 없습니다', '넘김, 실행함, 보류 연장이 감각뱅크 기록으로 쌓입니다.')}
      </div>
    </section>
  `;
}

function choiceCardModelFromItem(item) {
  if (!item) return null;
  const recipe = isRecipeItem(item);
  const conditionStats = itemConditionStats(item, { includeSuggestions: false });
  const hasConditions = conditionStats.total > 0;
  const conditionSummary = hasConditions ? choiceConditionSummary(conditionStats) : null;
  const progress = hasConditions
    ? {
      label: conditionSummary.label,
      value: conditionSummary.value,
      progressPct: conditionStats.progressPct,
    }
    : recipe
      ? recipeProgressModel(item)
      : waitProgressModel(item);
  const price = itemDecisionTotal(item);
  const originalImageUrl = choiceOriginalImageUrl(item);
  const visualMode = item.visualMode || 'auto';
  const autoCandidate = choiceAutoVisualCandidate(item);
  return {
    source: 'item',
    id: item.id,
    item,
    title: item.title || (recipe ? '레시피 선택' : '구매 보류'),
    meta: hasConditions
      ? `${conditionSummary.meta} · ${categoryName(item.kind)}`
      : recipe
      ? `${sourcePlatform(item).label} · ${normalizedIngredients(item).length || '재료'}개 재료`
      : `${categoryName(item.kind)} · ${item.domain || domainFromUrl(item.url) || '이미지 후보'}`,
    badge: hasConditions ? (conditionStats.ready ? '달성' : conditionSummary.badge) : recipe ? '루틴' : (progress.progressPct >= 100 ? '판단' : '보류'),
    price: price ? fmtKRW(price) : recipe ? '+25 XP' : '가격 미정',
    kind: recipe ? 'food' : normalizedKind(item.kind),
    imageUrl: choiceDisplayImageUrl(item, originalImageUrl, autoCandidate),
    originalImageUrl,
    visualMode,
    visualCredit: item.visualCredit || '',
    hasConditions,
    progressLabel: progress.label,
    progressValue: progress.value,
    progressPct: progress.progressPct,
  };
}

function choiceCardModelFromPact(pact) {
  if (!pact) return null;
  const conditionStats = pactConditionStats(pact);
  const conditionSummary = conditionStats.total ? choiceConditionSummary(conditionStats) : null;
  const progress = conditionStats.progressPct;
  const status = effectivePactStatus(pact);
  const linkedItem = STATE.items.find(item => item.id === pact.linkedCartItemId);
  const originalImageUrl = safeExternalUrl(pact.what?.originalImageUrl || pact.originalImageUrl)
    || choiceOriginalImageUrl(linkedItem);
  const visualSeed = {
    title: pact.what?.title || pact.title || linkedItem?.title || '조건부 퀘스트',
    kind: pact.what?.category || linkedItem?.kind || 'experience',
    note: pact.what?.note || linkedItem?.note || '',
    url: pact.what?.sourceUrl || pact.sourceUrl || linkedItem?.url || '',
  };
  const autoCandidate = choiceAutoVisualCandidate(visualSeed);
  const visualMode = pact.what?.visualMode || pact.visualMode || linkedItem?.visualMode || 'auto';
  const pactImageUrl = safeExternalUrl(pact.what?.imageUrl || pact.imageUrl || linkedItem?.imageUrl || originalImageUrl);
  return {
    source: 'pact',
    id: pact.id,
    pact,
    title: pact.what?.title || '조건부 퀘스트',
    meta: `${conditionSummary ? conditionSummary.meta : triggerLabel(pact)} · ${pactCostSourceLabel(pact.cost?.source)}`,
    badge: status === 'ready' ? '달성' : (conditionSummary?.badge || (conditionStats.total > 1 ? '퀘스트' : triggerLabelShort(pact.trigger?.type))),
    price: pact.what?.cost ? fmtKRW(pact.what.cost) : '+25 XP',
    kind: pact.what?.category || 'experience',
    imageUrl: visualMode === 'custom' || visualMode === 'stock' || visualMode === 'original'
      ? safeExternalUrl(pactImageUrl || autoCandidate?.url)
      : safeExternalUrl(pactImageUrl || autoCandidate?.url),
    originalImageUrl,
    visualMode,
    visualCredit: pact.what?.visualCredit || pact.visualCredit || linkedItem?.visualCredit || '',
    hasConditions: conditionStats.total > 0,
    progressLabel: conditionSummary?.label || triggerLabelShort(pact.trigger?.type),
    progressValue: conditionSummary?.value || `${progress}%`,
    progressPct: progress,
  };
}

function choiceProductCard(row) {
  if (!row) return '';
  const item = row.item;
  const pact = row.pact;
  const targetAttrs = choiceCardTargetAttrs(row);
  const progressPct = Math.max(0, Math.min(100, Number(row.progressPct) || 0));
  const ready = progressPct >= 100;
  const showProgress = !ready && (row.hasConditions || row.progressPct > 0);
  const progressNote = ready
    ? `${row.progressLabel || '조건'} 완료`
    : (row.progressValue || row.progressLabel || '');
  const showConditionMeter = row.hasConditions && progressNote;
  const recipeChips = item && isRecipeItem(item) ? recipeIngredientChipPreview(item) : '';
  return `
    <article class="choice-product-card choice-musinsa-card ${ready ? 'ready' : ''} ${recipeChips ? 'is-recipe' : ''}">
      <div class="choice-product-image" data-cart-action="open-detail" ${targetAttrs}>
        ${choiceVisualMarkup(row, 'card')}
        <span class="choice-product-badge">${escHtml(ready ? '달성' : row.badge)}</span>
        <button type="button" class="choice-musinsa-more" data-cart-action="open-action-sheet" ${targetAttrs} aria-label="선택 액션">⋯</button>
        ${showProgress ? `<div class="choice-progress-line"><i style="width:${progressPct}%"></i></div>` : ''}
      </div>
      <div class="choice-product-body">
        <button type="button" class="choice-product-title" data-cart-action="open-detail" ${targetAttrs}>
          <span>${escHtml(row.meta)}</span>
          <strong>${escHtml(row.title)}</strong>
        </button>
        <span class="choice-musinsa-price">${escHtml(row.price)}${progressNote ? `<small>${escHtml(progressNote)}</small>` : ''}</span>
        ${showConditionMeter ? `
          <div class="choice-condition-card-meter" aria-label="${escAttr(`${row.progressLabel || '조건'} ${progressNote}`)}">
            <div><span>${escHtml(row.progressLabel || '조건')}</span><strong>${escHtml(progressNote)}</strong></div>
            <i><b style="width:${progressPct}%"></b></i>
          </div>
        ` : ''}
        ${recipeChips}
      </div>
    </article>
  `;
}
function waitProgressModel(item) {
  const created = timestampMs(item?.createdAt) || Date.now();
  const hours = Math.max(0, (Date.now() - created) / 3600000);
  const pct = Math.min(100, Math.round((hours / 24) * 100));
  return {
    label: '기다림',
    value: pct >= 100 ? '24/24h' : `${Math.max(1, Math.round(hours))}/24h`,
    progressPct: pct,
  };
}

function recipeProgressModel(item) {
  const ingredients = normalizedIngredients(item);
  const decided = ingredients.filter(isIngredientDecided);
  const pct = ingredients.length ? Math.round((decided.length / ingredients.length) * 100) : 35;
  return {
    label: '재료 결정',
    value: ingredients.length ? `${decided.length}/${ingredients.length}` : '시작 전',
    progressPct: pct,
  };
}

function triggerLabelShort(type) {
  if (type === 'time') return '날짜';
  if (type === 'savings') return '예산';
  if (type === 'streak') return '루틴';
  if (type === 'measure') return '수치';
  if (type === 'event') return '이벤트';
  return '수동';
}

function choiceEmptyVisual(title = '아직 열린 선택이 없습니다', body = '이미지나 링크를 담으면 이곳이 보류함처럼 채워집니다.') {
  return `
    <article class="choice-empty-visual">
      ${choiceGeneratedVisual(title, 'calm', 'wide')}
      <div>
        <strong>${escHtml(title)}</strong>
        <span>${escHtml(body)}</span>
        <button type="button" data-cart-action="open-capture">이미지로 담기</button>
      </div>
    </article>
  `;
}

function choiceActionSheet() {
  const target = choiceActionTarget();
  if (!target) return '';
  const { entity, row, kind } = target;
  const confirmingDelete = !!STATE.actionSheetTarget?.confirmDelete;
  const isItem = kind === 'item';
  const ownerAttrs = choiceCardTargetAttrs(row);
  const externalUrl = isItem
    ? safeExternalUrl(entity.url)
    : safeExternalUrl(entity.what?.sourceUrl || entity.sourceUrl);
  const done = isItem ? entity.status === 'bought' : entity.status === 'fulfilled';
  return `
    <section class="tds-modal-overlay choice-action-layer open" aria-modal="true" role="dialog" aria-labelledby="choice-action-title">
      <div class="choice-capture-backdrop" data-cart-action="close-action-sheet"></div>
      <div class="choice-action-stack">
        <div class="choice-action-title" id="choice-action-title">${escHtml(row.title || '선택 후보')}</div>
        <div class="choice-action-sheet">
          ${confirmingDelete ? `
            <div class="choice-action-delete-confirm">
              <strong>정말 삭제할까요?</strong>
              <span>삭제하면 이 선택은 목록에서 사라집니다.</span>
            </div>
            <button type="button" class="danger confirm-delete" data-cart-action="action-sheet-delete" data-confirm-delete="1" ${ownerAttrs}><span class="em">×</span><span>정말 삭제</span></button>
            <button type="button" data-cart-action="action-sheet-delete-cancel" ${ownerAttrs}><span class="em">↩</span><span>삭제하지 않기</span></button>
          ` : `
            <button type="button" class="primary" data-cart-action="action-sheet-status" ${ownerAttrs} data-status="${done ? 'active' : 'bought'}"><span class="em">→</span><span>${done ? '되돌림' : '실행함'}</span></button>
            <button type="button" data-cart-action="action-sheet-reflect" ${ownerAttrs}><span class="em">◇</span><span>참았음 / 미뤘음</span></button>
            ${isItem && !isRecipeItem(entity) ? `<button type="button" data-cart-action="action-sheet-condition" ${ownerAttrs}><span class="em">⊕</span><span>조건 추가</span></button>` : ''}
            <button type="button" data-cart-action="open-visual-picker" ${ownerAttrs}><span class="em">□</span><span>이미지 바꾸기</span></button>
            ${externalUrl ? `<a href="${escHtml(externalUrl)}" target="_blank" rel="noreferrer"><span class="em">↗</span><span>원문 페이지</span></a>` : ''}
            <button type="button" data-cart-action="open-detail" ${ownerAttrs}><span class="em">✎</span><span>상세 보기 / 수정</span></button>
            <button type="button" class="danger" data-cart-action="action-sheet-delete" ${ownerAttrs}><span class="em">×</span><span>삭제</span></button>
          `}
        </div>
        <button type="button" class="tds-btn secondary full choice-action-cancel" data-cart-action="close-action-sheet">취소</button>
      </div>
    </section>
  `;
}

function choiceReflectionSheet() {
  const target = choiceReflectionTarget();
  if (!target) return '';
  const { entity, row, kind } = target;
  const isPact = kind === 'pact';
  const amount = isPact ? Number(entity.what?.cost) || 0 : itemDecisionTotal(entity);
  const subtitle = isPact
    ? `${row.title || '약속'} · 다음 조건 조정 단서`
    : `${row.title || '선택'} · 지금 미루기로 결정한 이유`;
  return `
    <section class="tds-modal-overlay choice-reflection-layer open" aria-modal="true" role="dialog">
      <div class="choice-capture-backdrop" data-cart-action="close-reflection"></div>
      <form id="choice-reflection-form" class="tds-modal-sheet choice-reflection-sheet" data-visual-kind="${escAttr(kind)}" ${isPact ? `data-pact-id="${escAttr(entity.id)}"` : `data-item-id="${escAttr(entity.id)}"`}>
        <div class="tds-modal-handle choice-sheet-handle"></div>
        <div class="choice-modal-head">
          <div class="choice-modal-ico">◇</div>
          <div>
            <h2>충동 기록</h2>
            <p>${escHtml(subtitle)}</p>
          </div>
          <button type="button" class="tds-modal-close choice-sheet-close" data-cart-action="close-reflection">×</button>
        </div>
        <div class="choice-reflection-body">
          <input type="hidden" name="choiceType" value="${isPact ? 'pact_broken' : 'resisted'}">
          <div class="choice-reflection-segments">
            <button type="button" class="active" data-reflection-intent="resisted">참았음</button>
            <button type="button" data-reflection-intent="postponed">미뤘음</button>
            <button type="button" data-reflection-intent="substituted">대체</button>
          </div>
          <label class="choice-reflection-row"><span>무엇을</span><input name="title" value="${escAttr(row.title || '')}"></label>
          <label class="choice-reflection-row"><span>절약 금액</span><input name="savedAmount" inputmode="numeric" value="${amount ? amount.toLocaleString('ko-KR') : ''}"></label>
          <label class="choice-reflection-row"><span>절약 kcal</span><input name="savedKcal" inputmode="numeric" placeholder="(선택)"></label>
          <label class="choice-reflection-row memo"><span>한 줄 메모</span><textarea name="note" placeholder="다음 약속에 조정 단서로만 남깁니다 (선택)"></textarea></label>
        </div>
        <div class="choice-reflection-foot">
          <button type="button" class="tds-btn secondary" data-cart-action="close-reflection">취소</button>
          <button type="submit" class="tds-btn full">감각뱅크에 적립</button>
        </div>
      </form>
    </section>
  `;
}

function choiceActionTarget() {
  const target = STATE.actionSheetTarget;
  if (!target) return null;
  const kind = target.kind === 'pact' || target.pactId ? 'pact' : 'item';
  const entity = kind === 'pact'
    ? STATE.pacts.find(row => row.id === target.pactId)
    : STATE.items.find(row => row.id === target.itemId);
  if (!entity) return null;
  const row = kind === 'pact' ? choiceCardModelFromPact(withPactRuntime(entity)) : choiceCardModelFromItem(entity);
  return { kind, entity, row };
}

function choiceReflectionTarget() {
  const target = STATE.reflectionTarget;
  if (!target) return null;
  const kind = target.kind === 'pact' || target.pactId ? 'pact' : 'item';
  const entity = kind === 'pact'
    ? STATE.pacts.find(row => row.id === target.pactId)
    : STATE.items.find(row => row.id === target.itemId);
  if (!entity) return null;
  const row = kind === 'pact' ? choiceCardModelFromPact(withPactRuntime(entity)) : choiceCardModelFromItem(entity);
  return { kind, entity, row };
}

function choiceVisualPickerSheet() {
  const target = choiceVisualTarget();
  if (!target) return '';
  const { entity, row, key, kind } = target;
  const originalImageUrl = kind === 'item'
    ? choiceOriginalImageUrl(entity)
    : safeExternalUrl(entity.what?.originalImageUrl || entity.originalImageUrl || entity.what?.imageUrl || entity.imageUrl);
  const querySource = kind === 'item' ? entity : choicePactVisualSeed(entity);
  const query = choiceVisualQueryForKey(key, querySource);
  const searched = Array.isArray(STATE.visualCandidates[key]);
  const stockCandidates = searched ? STATE.visualCandidates[key] : [];
  const candidateSourceLabel = STATE.visualCandidateSources[key] || '공개 이미지 검색 결과';
  const currentLabel = choiceVisualSourceLabel(entity, kind);
  const siteUrl = choiceVisualSourceUrl(entity, kind);
  const ownerAttrs = kind === 'item'
    ? `data-visual-kind="item" data-item-id="${escAttr(entity.id)}"`
    : `data-visual-kind="pact" data-pact-id="${escAttr(entity.id)}"`;
  return `
    <section class="tds-modal-overlay nested choice-visual-picker-layer open" aria-modal="true" role="dialog">
      <div class="choice-capture-backdrop" data-cart-action="close-visual-picker"></div>
      <div class="tds-modal-sheet choice-visual-picker-panel">
        <div class="tds-modal-handle choice-sheet-handle"></div>
        <div class="choice-modal-head choice-sheet-head">
          <div class="choice-modal-ico">□</div>
          <div>
            <h2>이미지 바꾸기</h2>
            <p>${escHtml(row.title || '선택 후보')} · 현재 ${escHtml(currentLabel)}</p>
          </div>
          <div class="choice-sheet-head-actions">
            <button type="button" data-cart-action="open-detail" data-visual-kind="${escAttr(kind)}" ${kind === 'item' ? `data-item-id="${escAttr(entity.id)}"` : `data-pact-id="${escAttr(entity.id)}"`}>상세 수정</button>
            <button type="button" class="tds-modal-close choice-sheet-close" data-cart-action="close-visual-picker">×</button>
          </div>
        </div>
        <div class="choice-visual-picker-preview">
          ${choiceVisualMarkup(row, 'hero')}
        </div>
        <form id="choice-visual-search-form" class="choice-visual-search-form" data-visual-kind="${escAttr(kind)}" ${kind === 'item' ? `data-item-id="${escAttr(entity.id)}"` : `data-pact-id="${escAttr(entity.id)}"`}>
          <label>${PUBLIC_VISUAL_PROVIDER_LABEL}</label>
          <div>
            <input class="tds-input" name="query" value="${escAttr(query)}" placeholder="예: 파크로쉬 정선, 광어 카르파초">
            <button type="submit">검색</button>
          </div>
          ${googleImageSearchLink(query)}
        </form>
        ${siteUrl ? `
          <form class="choice-visual-search-form choice-site-image-form" ${ownerAttrs} data-source-url="${escAttr(siteUrl)}">
            <label>붙여넣은 사이트 대표 이미지</label>
            <div>
              <input class="tds-input" value="${escAttr(domainFromUrl(siteUrl) || siteUrl)}" readonly>
              <button type="submit">사이트 이미지 가져오기</button>
            </div>
          </form>
        ` : ''}
        <div class="choice-visual-option-grid">
          ${originalImageUrl ? `
            <button type="button" data-cart-action="visual-original" data-visual-kind="${escAttr(kind)}" ${kind === 'item' ? `data-item-id="${escAttr(entity.id)}"` : `data-pact-id="${escAttr(entity.id)}"`}>
              <span>원본</span><b>파싱 썸네일</b>
            </button>
          ` : ''}
          <button type="button" data-cart-action="visual-generated" data-visual-kind="${escAttr(kind)}" ${kind === 'item' ? `data-item-id="${escAttr(entity.id)}"` : `data-pact-id="${escAttr(entity.id)}"`}>
            <span>생성형</span><b>앱 비주얼</b>
          </button>
        </div>
        <form id="choice-visual-url-form" class="choice-visual-url-form" data-visual-kind="${escAttr(kind)}" ${kind === 'item' ? `data-item-id="${escAttr(entity.id)}"` : `data-pact-id="${escAttr(entity.id)}"`}>
          <label>이미지 주소 붙여넣기</label>
          <div>
            <input class="tds-input" name="imageUrl" placeholder="검색 결과에서 이미지 주소 복사 후 붙여넣기" autocomplete="off">
            <button type="submit">적용</button>
          </div>
        </form>
        <div class="choice-visual-subhead">${escHtml(candidateSourceLabel)} ${stockCandidates.length}개</div>
        <div class="choice-stock-grid">
          ${stockCandidates.length ? stockCandidates.map(candidate => `
            ${choiceVisualCandidateButtonHtml(candidate, 'data-cart-action="visual-stock"', `data-visual-kind="${escAttr(kind)}" ${kind === 'item' ? `data-item-id="${escAttr(entity.id)}"` : `data-pact-id="${escAttr(entity.id)}"`}`)}
          `).join('') : visualSearchEmptyHtml(searched)}
        </div>
      </div>
    </section>
  `;
}

function choiceDetailVisualEditorHtml(entity, row, kind, opts = {}) {
  const key = `${kind}:${entity.id}`;
  const originalImageUrl = kind === 'item'
    ? choiceOriginalImageUrl(entity)
    : safeExternalUrl(entity.what?.originalImageUrl || entity.originalImageUrl || entity.what?.imageUrl || entity.imageUrl);
  const querySource = kind === 'item' ? entity : choicePactVisualSeed(entity);
  const query = choiceVisualQueryForKey(key, querySource);
  const searched = Array.isArray(STATE.visualCandidates[key]);
  const stockCandidates = searched ? STATE.visualCandidates[key] : [];
  const candidateSourceLabel = STATE.visualCandidateSources[key] || '공개 이미지 검색 결과';
  const currentLabel = choiceVisualSourceLabel(entity, kind);
  const ownerAttrs = kind === 'item'
    ? `data-visual-kind="item" data-item-id="${escAttr(entity.id)}"`
    : `data-visual-kind="pact" data-pact-id="${escAttr(entity.id)}"`;
  const siteUrl = choiceVisualSourceUrl(entity, kind);
  return `
    <div class="choice-detail-visual-editor" style="${opts.open ? '' : 'display:none'}">
      <div class="choice-detail-visual-head">
        <span>이미지 선택</span>
        <em>현재: ${escHtml(currentLabel)}</em>
      </div>
      <form class="choice-visual-search-form choice-detail-visual-search-form" ${ownerAttrs}>
        <label>${PUBLIC_VISUAL_PROVIDER_LABEL}</label>
        <div>
          <input class="tds-input" name="query" value="${escAttr(query)}" placeholder="예: 파크로쉬 정선, 광어 카르파초">
          <button type="submit">검색</button>
        </div>
        ${googleImageSearchLink(query)}
      </form>
      ${siteUrl ? `
        <form class="choice-visual-search-form choice-site-image-form choice-detail-site-image-form" ${ownerAttrs} data-source-url="${escAttr(siteUrl)}">
          <label>붙여넣은 사이트 대표 이미지</label>
          <div>
            <input class="tds-input" value="${escAttr(domainFromUrl(siteUrl) || siteUrl)}" readonly>
            <button type="submit">사이트 이미지 가져오기</button>
          </div>
        </form>
      ` : ''}
      <div class="choice-visual-option-grid">
        ${originalImageUrl ? `
          <button type="button" data-choice-detail-action="visual-original" ${ownerAttrs}>
            <span>원본</span><b>파싱 썸네일</b>
          </button>
        ` : ''}
        <button type="button" data-choice-detail-action="visual-generated" ${ownerAttrs}>
          <span>생성형</span><b>앱 비주얼</b>
        </button>
      </div>
      <form class="choice-visual-url-form choice-detail-visual-url-form" ${ownerAttrs}>
        <label>이미지 주소 붙여넣기</label>
        <div>
          <input class="tds-input" name="imageUrl" placeholder="검색 결과에서 이미지 주소 복사 후 붙여넣기" autocomplete="off">
          <button type="submit">적용</button>
        </div>
      </form>
      <div class="choice-visual-subhead">${escHtml(candidateSourceLabel)} ${stockCandidates.length}개</div>
      <div class="choice-stock-grid">
        ${stockCandidates.length ? stockCandidates.map(candidate => `
          ${choiceVisualCandidateButtonHtml(candidate, 'data-choice-detail-action="visual-stock"', ownerAttrs)}
        `).join('') : visualSearchEmptyHtml(searched)}
      </div>
    </div>
  `;
}

function choiceVisualTarget() {
  if (STATE.visualPickerItemId) {
    const item = STATE.items.find(row => row.id === STATE.visualPickerItemId);
    if (!item) return null;
    return {
      kind: 'item',
      key: `item:${item.id}`,
      entity: item,
      row: choiceCardModelFromItem(item),
    };
  }
  if (STATE.visualPickerPactId) {
    const pact = STATE.pacts.find(row => row.id === STATE.visualPickerPactId);
    if (!pact) return null;
    return {
      kind: 'pact',
      key: `pact:${pact.id}`,
      entity: pact,
      row: choiceCardModelFromPact(withPactRuntime(pact)),
    };
  }
  return null;
}

function choiceVisualQueryForKey(key, source) {
  return STATE.visualSearchQueries[key] || choiceImageSearchQuery(source);
}

function googleImageSearchLink(query) {
  return `<a class="choice-google-image-link" href="${escAttr(googleImageSearchUrl(query))}" target="_blank" rel="noreferrer" data-google-image-link>검색 결과에서 직접 고르기</a>`;
}
function googleImageSearchUrl(query) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(String(query || '').trim() || '이미지')}`;
}

function choicePactVisualSeed(pact) {
  const linkedItem = STATE.items.find(item => item.id === pact?.linkedCartItemId);
  return {
    title: pact?.what?.title || pact?.title || linkedItem?.title || '조건부 퀘스트',
    kind: pact?.what?.category || linkedItem?.kind || 'experience',
    note: pact?.what?.note || linkedItem?.note || '',
    url: pact?.what?.sourceUrl || pact?.sourceUrl || linkedItem?.url || '',
  };
}

function choiceVisualSourceLabel(entity, kind = 'item') {
  const mode = kind === 'pact'
    ? (entity?.what?.visualMode || entity?.visualMode)
    : entity?.visualMode;
  if (mode === 'generated') return '앱 생성 비주얼';
  if (mode === 'stock') return '검색 이미지';
  if (mode === 'custom') return '직접 URL';
  if (kind === 'pact') {
    if (safeExternalUrl(entity?.what?.originalImageUrl || entity?.originalImageUrl || entity?.what?.imageUrl || entity?.imageUrl)) return '원본 썸네일';
    if (choiceAutoVisualCandidate(choicePactVisualSeed(entity))) return '추천 이미지';
    return '앱 생성 비주얼';
  }
  const item = entity;
  if (choiceOriginalImageUrl(item)) return '원본 썸네일';
  if (choiceAutoVisualCandidate(item)) return '추천 이미지';
  return '앱 생성 비주얼';
}

function choiceVisualSourceUrl(entity, kind = 'item') {
  if (kind === 'pact') {
    const seed = choicePactVisualSeed(entity);
    return safeExternalUrl(seed.url || entity?.what?.sourceUrl || entity?.sourceUrl || entity?.url);
  }
  return safeExternalUrl(entity?.url || entity?.sourceUrl);
}

function rerenderCartBoard() {
  const body = $('#cart-board-body');
  if (!body) return;
  body.innerHTML = cartBoard(STATE.items, STATE.categories);
  if (STATE.segment === 'wine') renderWineCellar($('#choice-wine-cellar-root', body)).catch(err => showWineCellarError(err, body));
  bindCartBoardEvents(body);
  refreshChoiceOverlays();
}

function showWineCellarError(err, body) {
  console.error('[wine-cellar]', err);
  const root = $('#choice-wine-cellar-root', body || document);
  if (root) root.innerHTML = '<div class="empty-state"><div>와인셀러를 불러오지 못했어요</div><div class="st4">잠시 후 다시 열어주세요.</div></div>';
}

function refreshChoiceOverlays() {
  const overlayRoot = $('#choice-overlay-root');
  if (!overlayRoot) return;
  overlayRoot.innerHTML = `
    ${choiceActionSheet()}
    ${choiceReflectionSheet()}
    ${choiceVisualPickerSheet()}
  `;
  bindChoiceOverlayEvents(overlayRoot);
  focusChoiceOverlay(overlayRoot);
}

function focusChoiceOverlay(overlayRoot) {
  const layer = overlayRoot.querySelector('.choice-action-layer.open, .choice-reflection-layer.open, .choice-visual-picker-layer.open');
  if (!layer) return;
  const target = layer.querySelector('[data-confirm-delete="1"], .primary, input, textarea, button, a');
  if (target) setTimeout(() => target.focus(), 0);
}

function closeChoiceActionSheet({ restoreFocus = true } = {}) {
  STATE.actionSheetTarget = null;
  refreshChoiceOverlays();
  if (restoreFocus) restoreChoiceActionFocus();
}

function restoreChoiceActionFocus() {
  const returnEl = STATE.actionSheetReturnEl;
  STATE.actionSheetReturnEl = null;
  if (returnEl?.isConnected && typeof returnEl.focus === 'function') {
    setTimeout(() => returnEl.focus(), 0);
  }
}

function bindChoiceOverlayEvents(overlayRoot) {
  overlayRoot.onclick = async (event) => {
    const target = event.target.closest('[data-cart-action], [data-visual-kind]');
    if (!target) return;
    const action = target.dataset.cartAction;
    const itemId = target.dataset.itemId;
    const pactId = target.dataset.pactId;
    try {
      if (target.tagName === 'BUTTON') target.disabled = true;
      if (action === 'close-action-sheet') {
        closeChoiceActionSheet();
        return;
      }
      if (action === 'action-sheet-reflect') {
        STATE.reflectionTarget = { kind: target.dataset.visualKind, itemId, pactId };
        STATE.actionSheetTarget = null;
        refreshChoiceOverlays();
        return;
      }
      if (action === 'close-reflection') {
        STATE.reflectionTarget = null;
        refreshChoiceOverlays();
        return;
      }
      if (action === 'open-detail') {
        STATE.actionSheetTarget = null;
        STATE.reflectionTarget = null;
        openChoiceDetail({ itemId, pactId, kind: target.dataset.visualKind, detailPanel: target.dataset.detailPanel });
        refreshChoiceOverlays();
        return;
      }
      if (action === 'open-visual-picker') {
        openChoiceVisualPicker({ itemId, pactId, kind: target.dataset.visualKind });
        return;
      }
      if (action === 'close-visual-picker') {
        closeChoiceVisualPicker();
        return;
      }
      if (action === 'visual-original') {
        await applyChoiceVisual({ itemId, pactId, kind: target.dataset.visualKind }, 'original');
        return;
      }
      if (action === 'visual-generated') {
        await applyChoiceVisual({ itemId, pactId, kind: target.dataset.visualKind }, 'generated');
        return;
      }
      if (action === 'visual-stock') {
        await applyChoiceVisual({ itemId, pactId, kind: target.dataset.visualKind }, 'stock', {
          imageUrl: target.dataset.imageUrl,
          visualCredit: target.dataset.credit,
          visualQuery: target.dataset.query,
        });
        return;
      }
      if (action === 'action-sheet-status') {
        STATE.actionSheetTarget = null;
        if (pactId) await handlePactAction('status', { dataset: { pactId, status: target.dataset.status === 'bought' ? 'fulfilled' : target.dataset.status } });
        else await updateItemStatus(itemId, target.dataset.status);
        return;
      }
      if (action === 'open-condition-sheet' || action === 'action-sheet-condition') {
        STATE.actionSheetTarget = null;
        openChoiceDetail({ itemId, kind: target.dataset.visualKind, detailPanel: 'condition' });
        refreshChoiceOverlays();
        return;
      }
      if (action === 'action-sheet-delete') {
        if (target.dataset.confirmDelete !== '1') {
          STATE.actionSheetTarget = { kind: target.dataset.visualKind, itemId, pactId, confirmDelete: true };
          refreshChoiceOverlays();
          return;
        }
        STATE.actionSheetTarget = null;
        if (pactId) await removePact(pactId);
        else await removeCartItem(itemId);
        return;
      }
      if (action === 'action-sheet-delete-cancel') {
        STATE.actionSheetTarget = { kind: target.dataset.visualKind, itemId, pactId };
        refreshChoiceOverlays();
        return;
      }
    } catch (err) {
      showToast(err.message || '처리 실패', 2400, 'error');
    } finally {
      if (target.tagName === 'BUTTON') target.disabled = false;
    }
  };
  bindChoiceVisualForm(overlayRoot);
  bindChoiceReflectionForm(overlayRoot);
  overlayRoot.querySelectorAll('.choice-visual-picker-layer, .choice-action-layer, .choice-reflection-layer')
    .forEach(layer => bindChoiceSheetDismiss(layer, () => {
      if (layer.classList.contains('choice-visual-picker-layer')) closeChoiceVisualPicker();
      else if (layer.classList.contains('choice-action-layer')) {
        closeChoiceActionSheet();
      } else {
        STATE.reflectionTarget = null;
        refreshChoiceOverlays();
      }
    }));
}

function openChoiceVisualPicker(target = {}) {
  const kind = target.kind === 'pact' || target.pactId ? 'pact' : 'item';
  STATE.actionSheetTarget = null;
  STATE.reflectionTarget = null;
  if (kind === 'pact') {
    const pact = STATE.pacts.find(row => row.id === target.pactId);
    if (!pact) return;
    STATE.visualPickerItemId = null;
    STATE.visualPickerPactId = pact.id;
    STATE.visualSearchQueries[`pact:${pact.id}`] = choiceImageSearchQuery(choicePactVisualSeed(pact));
    refreshChoiceOverlays();
    return;
  }
  const item = STATE.items.find(row => row.id === target.itemId);
  if (!item) return;
  STATE.visualPickerItemId = item.id;
  STATE.visualPickerPactId = null;
  STATE.visualSearchQueries[`item:${item.id}`] = choiceImageSearchQuery(item);
  refreshChoiceOverlays();
}

function closeChoiceVisualPicker() {
  STATE.visualPickerItemId = null;
  STATE.visualPickerPactId = null;
  refreshChoiceOverlays();
}

function rerenderChoiceVisualPickerOnly() {
  const layer = document.querySelector('#choice-overlay-root .choice-visual-picker-layer');
  if (!layer) {
    refreshChoiceOverlays();
    return;
  }
  const html = choiceVisualPickerSheet();
  if (!html) {
    layer.remove();
    return;
  }
  const overlayRoot = $('#choice-overlay-root');
  layer.outerHTML = html;
  if (overlayRoot) {
    bindChoiceVisualForm(overlayRoot);
    const nextLayer = overlayRoot.querySelector('.choice-visual-picker-layer');
    if (nextLayer) bindChoiceSheetDismiss(nextLayer, closeChoiceVisualPicker);
  }
}

async function applyChoiceVisual(target = {}, mode, patch = {}, opts = {}) {
  const kind = target.kind === 'pact' || target.pactId ? 'pact' : 'item';
  const entity = kind === 'pact'
    ? STATE.pacts.find(row => row.id === target.pactId)
    : STATE.items.find(row => row.id === target.itemId);
  if (!entity) return;
  const originalImageUrl = kind === 'pact'
    ? safeExternalUrl(entity.what?.originalImageUrl || entity.originalImageUrl || entity.what?.imageUrl || entity.imageUrl)
    : choiceOriginalImageUrl(entity);
  const next = {
    originalImageUrl,
    visualMode: mode,
    visualQuery: patch.visualQuery || (kind === 'pact' ? entity.what?.visualQuery || entity.what?.title : entity.visualQuery || entity.title) || '',
    visualCredit: patch.visualCredit || '',
  };
  if (mode === 'original') {
    next.imageUrl = originalImageUrl;
    next.visualCredit = '';
  } else if (mode === 'generated') {
    next.imageUrl = '';
  } else {
    next.imageUrl = safeExternalUrl(patch.imageUrl);
  }
  if (mode !== 'generated' && !next.imageUrl) {
    showToast('사용할 수 있는 이미지 URL이 없어요.', 1800, 'warning');
    return;
  }
  if (kind === 'pact') {
    const nextWhat = {
      ...(entity.what || {}),
      imageUrl: next.imageUrl,
      originalImageUrl: next.originalImageUrl,
      visualMode: next.visualMode,
      visualCredit: next.visualCredit,
      visualQuery: next.visualQuery,
    };
    await updatePact(entity.id, {
      what: nextWhat,
    });
    entity.what = nextWhat;
  } else {
    await updateCartItem(entity.id, next);
    Object.assign(entity, next);
  }
  STATE.visualPickerItemId = null;
  STATE.visualPickerPactId = null;
  showToast(mode === 'generated' ? '앱 비주얼로 바꿨어요.' : '이미지를 바꿨어요.', 1200, 'success');
  if (opts.reload === false) {
    rerenderCartBoard();
    return;
  }
  await loadCartItems();
}

function bindChoiceVisualForm(root) {
  const form = $('#choice-visual-url-form', root);
  const searchForm = $('#choice-visual-search-form', root);
  const siteForm = root.querySelector('.choice-site-image-form');
  if (searchForm) {
    bindGoogleImageLink(searchForm);
    searchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const target = {
        kind: searchForm.dataset.visualKind,
        itemId: searchForm.dataset.itemId,
        pactId: searchForm.dataset.pactId,
      };
      const query = String(new FormData(searchForm).get('query') || '').trim();
      if (!query) return;
      const button = searchForm.querySelector('button');
      try {
        if (button) {
          button.disabled = true;
          button.textContent = '검색 중';
        }
        await refreshChoiceVisualCandidates(target, query);
      } catch (err) {
        showToast(err.message || '이미지 후보를 찾지 못했어요.', 2200, 'warning');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = '검색';
        }
      }
    });
  }
  if (siteForm) {
    siteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const target = {
        kind: siteForm.dataset.visualKind,
        itemId: siteForm.dataset.itemId,
        pactId: siteForm.dataset.pactId,
      };
      const sourceUrl = siteForm.dataset.sourceUrl;
      const button = siteForm.querySelector('button');
      try {
        if (button) {
          button.disabled = true;
          button.textContent = '가져오는 중';
        }
        await refreshChoiceSiteImageCandidates(target, sourceUrl);
      } catch (err) {
        showToast(err.message || '사이트 이미지 후보를 가져오지 못했어요.', 2200, 'warning');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = '사이트 이미지 가져오기';
        }
      }
    });
  }
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const imageUrl = safeExternalUrl(new FormData(form).get('imageUrl'));
    if (!imageUrl) {
      showToast('https:// 로 시작하는 이미지 주소를 넣어주세요.', 1800, 'warning');
      return;
    }
    const button = form.querySelector('button');
    try {
      if (button) button.disabled = true;
      await applyChoiceVisual({
        kind: form.dataset.visualKind,
        itemId: form.dataset.itemId,
        pactId: form.dataset.pactId,
      }, 'custom', {
        imageUrl,
        visualCredit: '직접 입력',
      });
    } catch (err) {
      showToast(err.message || '이미지 적용 실패', 2200, 'error');
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function openChoiceDetail(target = {}) {
  const kind = target.kind === 'pact' || target.pactId ? 'pact' : 'item';
  const ok = renderChoiceDetailBody(kind, kind === 'pact' ? target.pactId : target.itemId, {
    visualOpen: target.detailPanel === 'visual', conditionOpen: target.detailPanel === 'condition',
  });
  if (!ok) return;
  window.openModal('choice-detail-modal');
}

function renderChoiceDetailBody(kind, id, opts = {}) {
  const entity = kind === 'pact'
    ? STATE.pacts.find(row => row.id === id)
    : STATE.items.find(row => row.id === id);
  if (!entity) {
    showToast('항목을 다시 불러와주세요.', 1600, 'warning');
    return false;
  }
  const row = kind === 'pact'
    ? choiceCardModelFromPact(withPactRuntime(entity))
    : choiceCardModelFromItem(entity);
  ensureChoiceDetailModal();
  const body = $('#choice-detail-body');
  body.innerHTML = kind === 'pact'
    ? choicePactDetailHtml(entity, row, opts)
    : choiceItemDetailHtml(entity, row, opts);
  bindChoiceDetail(body);
  return true;
}

function choiceItemDetailHtml(item, row, opts = {}) {
  const stats = itemConditionStats(item);
  const titleLabel = choiceItemTitleLabel(item);
  return `
    <form id="choice-detail-form" class="choice-detail-form" data-kind="item" data-item-id="${escAttr(item.id)}">
      <div class="tx-receipt-head choice-detail-receipt-head">
        <div>
          <span>보류함 상세</span>
          <strong>${escHtml(titleLabel)} 수정</strong>
        </div>
        <em>${item.price ? fmtKRW(item.price) : '가격 미정'}</em>
      </div>
      <div class="tx-receipt-form choice-detail-receipt-form">
        ${choiceReceiptImageRow(row, `data-choice-detail-action="focus-visual-editor"`)}
        <div class="tx-receipt-row">
          <span>${escHtml(titleLabel)}</span>
          <input class="tds-input" name="title" value="${escAttr(item.title || '')}">
        </div>
        <div class="tx-receipt-row">
          <span>가격</span>
          <input class="tds-input" name="price" inputmode="numeric" value="${item.price ? String(item.price) : ''}">
        </div>
        <div class="tx-receipt-row">
          <span>타입</span>
          <select class="tds-select" name="kind">${cartCategoryOptions(item.kind)}</select>
        </div>
        <div class="tx-receipt-row">
          <span>링크</span>
          <input class="tds-input" name="url" value="${escAttr(item.url || '')}">
        </div>
        <div class="tx-receipt-block">
          <span>메모</span>
          <textarea class="tds-input" name="note" rows="${isRecipeItem(item) ? 7 : 3}">${escHtml(item.note || '')}</textarea>
        </div>
      </div>
      ${isRecipeItem(item) ? choiceRecipeDetailPanelHtml(item) : ''}
      ${choiceItemConditionsEditorHtml(item, stats, opts)}
      <div class="choice-detail-actions">
        <button class="tds-btn" type="submit">저장</button>
        ${item.status === 'bought'
          ? `<button class="tds-btn secondary" type="button" data-choice-detail-action="status" data-item-id="${escAttr(item.id)}" data-status="active">되돌림</button>`
          : `<button class="tds-btn secondary" type="button" data-choice-detail-action="status" data-item-id="${escAttr(item.id)}" data-status="bought">실행함</button>`}
        <button class="tds-btn ghost danger-text" type="button" data-choice-detail-action="delete-item" data-item-id="${escAttr(item.id)}">삭제</button>
      </div>
    </form>
    ${choiceDetailVisualEditorHtml(item, row, 'item', { open: opts.visualOpen })}
  `;
}

function choicePactDetailHtml(pact, row, opts = {}) {
  const p = withPactRuntime(pact);
  const stats = pactConditionStats(p);
  return `
    <form id="choice-detail-form" class="choice-detail-form" data-kind="pact" data-pact-id="${escAttr(p.id)}">
      <div class="tx-receipt-head choice-detail-receipt-head">
        <div>
          <span>조건부 선택 상세</span>
          <strong>퀘스트 수정</strong>
        </div>
        <em>${p.what?.cost ? fmtKRW(p.what.cost) : '+25 XP'}</em>
      </div>
      <div class="tx-receipt-form choice-detail-receipt-form">
        ${choiceReceiptImageRow(row, `data-choice-detail-action="focus-visual-editor"`)}
        <div class="tx-receipt-row">
          <span>퀘스트명</span>
          <input class="tds-input" name="title" value="${escAttr(p.what?.title || '')}">
        </div>
        <div class="tx-receipt-row">
          <span>예상 비용</span>
          <input class="tds-input" name="cost" inputmode="numeric" value="${p.what?.cost ? String(p.what.cost) : ''}">
        </div>
        <div class="tx-receipt-row">
          <span>상태</span>
          <input class="tds-input" value="${escAttr(statusLabel(effectivePactStatus(p)))}" disabled>
        </div>
        <div class="tx-receipt-block">
          <span>메시지</span>
          <textarea class="tds-input" name="message" rows="3">${escHtml(p.signature?.message || '')}</textarea>
        </div>
        <div class="tx-receipt-block">
          <span>메모</span>
          <textarea class="tds-input" name="note" rows="2">${escHtml(p.what?.note || '')}</textarea>
        </div>
      </div>
      ${choicePactConditionsEditorHtml(p, stats)}
      <div class="choice-detail-actions">
        <button class="tds-btn" type="submit">저장</button>
        <button class="tds-btn secondary" type="button" data-choice-detail-action="pact-status" data-pact-id="${escAttr(p.id)}" data-status="${p.status === 'fulfilled' ? 'active' : 'fulfilled'}">${p.status === 'fulfilled' ? '되돌림' : '실행함'}</button>
        <button class="tds-btn ghost danger-text" type="button" data-choice-detail-action="delete-pact" data-pact-id="${escAttr(p.id)}">삭제</button>
      </div>
    </form>
    ${choiceDetailVisualEditorHtml(p, row, 'pact', { open: opts.visualOpen })}
  `;
}

function choiceItemTitleLabel(item) {
  if (isRecipeItem(item)) return '레시피명';
  const kind = String(item?.kind || '').toLowerCase();
  const type = String(item?.type || '').toLowerCase();
  if (type === 'simple' || item?.url || item?.domain) return '상품명';
  if (['buy', 'wine', 'fashion'].includes(kind)) return '상품명';
  if (['place', 'travel', 'experience'].includes(kind)) return '경험명';
  return '선택명';
}

function choiceReceiptImageRow(row, actionAttrs = '') {
  const imageUrl = safeExternalUrl(row?.imageUrl || row?.originalImageUrl);
  const title = row?.title || '선택 후보';
  return `
    <div class="tx-receipt-row choice-detail-image-row">
      <span>이미지</span>
      <div class="choice-detail-thumb">
        <div class="choice-detail-thumb-frame">
          ${imageUrl
            ? `<img src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()">`
            : choiceGeneratedVisual(title, row?.kind || 'calm', 'thumb')}
        </div>
        <div>
          <strong>${escHtml(title)}</strong>
          <small>상세 모달 안에서는 이미지가 이 영역 안에 맞춰집니다.</small>
          <button type="button" class="choice-detail-thumb-action" ${actionAttrs}>이미지 바꾸기</button>
        </div>
      </div>
    </div>
  `;
}

function choicePactConditionsEditorHtml(pact, stats = pactConditionStats(pact)) {
  const conditions = stats.conditions.length ? stats.conditions : pactConditions(pact);
  const ids = conditions.map(condition => condition.id).join(',');
  const progressPct = conditions.length ? Math.round((stats.done / conditions.length) * 100) : 0;
  return `
    <section class="choice-condition-receipt tx-receipt-form">
      <div class="choice-condition-head">
        <span>실현 조건</span>
        <div class="choice-condition-head-meta">
          ${progressPct > 0 ? `<b class="choice-condition-pct">${progressPct}%</b>` : ''}
          <button type="button" class="choice-condition-add-icon" data-condition-add-toggle title="조건 추가">+</button>
        </div>
      </div>
      ${conditions.length > 0 ? `<div class="choice-condition-agg-gauge"><i style="width:${progressPct}%"></i></div>` : ''}
      <input type="hidden" name="conditionIds" value="${escAttr(ids)}">
      <div class="choice-pact-condition-list">
        ${conditions.length > 0
          ? conditions.map(condition => choiceConditionRowHtml(condition, { kind: 'pact', id: pact.id })).join('')
          : '<div class="choice-condition-empty">+ 버튼으로 첫 조건을 추가하세요</div>'}
      </div>
      <div class="choice-condition-add-form" data-condition-add-form style="display:none;">
        ${choiceNewConditionHtml('amount', '예: 항공권 예약, 여행 예산, 휴가 확정')}
      </div>
    </section>
  `;
}

function choiceItemConditionsEditorHtml(item, stats = itemConditionStats(item), opts = {}) {
  const conditions = stats.conditions.length ? stats.conditions : itemConditions(item);
  const ids = conditions.map(condition => condition.id).join(',');
  const progressPct = conditions.length ? Math.round((stats.done / conditions.length) * 100) : 0;
  return `
    <section class="choice-condition-receipt tx-receipt-form">
      <div class="choice-condition-head">
        <span>구매 조건</span>
        <div class="choice-condition-head-meta">
          ${progressPct > 0 ? `<b class="choice-condition-pct">${progressPct}%</b>` : ''}
          <button type="button" class="choice-condition-add-icon" data-condition-add-toggle title="조건 추가">${opts.conditionOpen ? '×' : '+'}</button>
        </div>
      </div>
      ${conditions.length > 0 ? `<div class="choice-condition-agg-gauge"><i style="width:${progressPct}%"></i></div>` : ''}
      <input type="hidden" name="conditionIds" value="${escAttr(ids)}">
      <div class="choice-pact-condition-list">
        ${conditions.length > 0
          ? conditions.map(condition => choiceConditionRowHtml(condition, { kind: 'item', id: item.id })).join('')
          : '<div class="choice-condition-empty">+ 버튼으로 첫 조건을 추가하세요</div>'}
      </div>
      <div class="choice-condition-add-form" data-condition-add-form style="${opts.conditionOpen ? '' : 'display:none;'}">
        ${choiceNewConditionHtml('date', '예: 예산 여유 확보, 다음 목요일, 목표 체중 도달')}
      </div>
    </section>
  `;
}

function choiceNewConditionHtml(defaultType = 'amount', placeholder = '예: 조건명') {
  return `
    <div class="choice-condition-detail choice-pact-condition-new" data-condition-fieldset data-condition-type="${escAttr(defaultType)}">
      <div class="tx-receipt-block choice-condition-edit-fields">
        <div class="tx-receipt-row">
          <span>종류</span>
          <select class="tds-select" name="newConditionType" data-condition-type-select>${conditionTypeOptions(defaultType)}</select>
        </div>
        <div class="tx-receipt-row condition-date-field">
          <span>도래일</span>
          <input class="tds-input" name="newConditionDueDate" type="date">
        </div>
        <div class="tx-receipt-row">
          <span>조건명</span>
          <input class="tds-input" name="newConditionLabel" placeholder="${escAttr(placeholder)}">
        </div>
        <div class="tx-receipt-row condition-number-fields">
          <span>현재</span>
          <input class="tds-input" name="newConditionCurrent" inputmode="numeric" placeholder="0">
        </div>
        <div class="tx-receipt-row condition-number-fields">
          <span>목표</span>
          <input class="tds-input" name="newConditionTarget" inputmode="numeric" placeholder="1">
        </div>
        <div class="tx-receipt-row condition-unit-field">
          <span>단위</span>
          <input class="tds-input" name="newConditionUnit" placeholder="원, 회, kg">
        </div>
        <label class="tx-shared-remember choice-pact-condition-check"><input type="checkbox" name="newConditionDone"> 이미 완료한 조건</label>
      </div>
    </div>
  `;
}

function choiceConditionRowHtml(condition, owner = {}) {
  const pct = Math.round(conditionProgress(condition) * 100);
  const id = condition.id;
  const ownerAttrs = owner.kind === 'item'
    ? `data-item-id="${escAttr(owner.id || '')}"`
    : `data-pact-id="${escAttr(owner.id || '')}"`;
  const deleteAction = owner.kind === 'item' ? 'delete-item-condition' : 'delete-condition';
  const valueLabel = conditionValueLabel(condition);
  const editFields = choiceConditionEditFields(condition, id, { deleteAction, ownerAttrs });
  return `
    <details class="choice-condition-detail" data-condition-fieldset data-condition-type="${escAttr(condition.type)}" data-condition-id="${escAttr(id)}">
      <summary>
        <span>${escHtml(conditionTypeLabel(condition.type))}</span>
        <strong>
          <em>${escHtml(condition.label)}<span class="cond-val-badge">${escHtml(valueLabel)}</span></em>
          <i><b style="width:${pct}%"></b></i>
        </strong>
      </summary>
      <div class="tx-receipt-block choice-condition-edit-fields">
        ${editFields}
      </div>
    </details>
  `;
}

function conditionTypeOptions(value) {
  const rows = [
    ['date', '날짜 도래'],
    ['amount', '금액 모금'],
    ['diet', '다이어트 성공'],
    ['check', '수동 체크'],
    ['number', '수치 달성'],
  ];
  return rows.map(([id, label]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${label}</option>`).join('');
}

function conditionTypeLabel(value) {
  return {
    date: '날짜 도래',
    amount: '금액 모금',
    diet: '다이어트 성공',
    check: '수동 체크',
    number: '수치 달성',
  }[value] || '실현 조건';
}

function ensureChoiceDetailModal() {
  if (document.getElementById('choice-detail-modal')) return;
  const container = document.getElementById('modals-container') || document.body;
  container.insertAdjacentHTML('beforeend', `
    <div class="tds-modal-overlay" id="choice-detail-modal">
      <div class="tds-modal-sheet choice-detail-sheet">
        <div class="tds-modal-handle"></div>
        <div class="tds-modal-content" style="text-align:left">
          <div class="choice-modal-head choice-detail-modal-head">
            <div class="choice-modal-ico">✎</div>
            <div>
              <h2>선택 상세</h2>
              <p>이미지, 조건, 실행 상태를 한 곳에서 수정합니다.</p>
            </div>
            <button type="button" class="tds-modal-close choice-sheet-close" data-close-modal="choice-detail-modal">×</button>
          </div>
          <div id="choice-detail-body"></div>
        </div>
      </div>
    </div>
  `);
  const modal = document.getElementById('choice-detail-modal');
  bindChoiceSheetDismiss(modal, () => window.closeModal('choice-detail-modal'));
  bindModalCloseButtons(modal);
}

function bindChoiceDetail(root) {
  const form = $('#choice-detail-form', root);
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      try {
        const submit = form.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        if (form.dataset.kind === 'pact') await saveChoicePactDetail(form.dataset.pactId, fd);
        else await saveChoiceItemDetail(form.dataset.itemId, fd);
        window.closeModal('choice-detail-modal');
        showToast('상세를 저장했어요.', 1200, 'success');
        await loadCartItems();
      } catch (err) {
        showToast(err.message || '저장 실패', 2200, 'error');
      } finally {
        const submit = form.querySelector('button[type="submit"]');
        if (submit) submit.disabled = false;
      }
    });
  }
  bindChoiceDetailVisualForms(root);
  bindChoiceConditionTypeFields(root);
  root.onchange = async (event) => {
    const target = event.target.closest('[data-recipe-ing-toggle]');
    if (!target) return;
    try {
      target.disabled = true;
      await toggleRecipeIngredientAcquired(target.dataset.itemId, target.dataset.ingId, target.checked);
    } catch (err) {
      showToast(err.message || '재료 체크 저장 실패', 2200, 'error');
    } finally {
      target.disabled = false;
    }
  };
  // 조건 추가 버튼 토글
  const addConditionBtn = root.querySelector('[data-condition-add-toggle]');
  const addConditionForm = root.querySelector('[data-condition-add-form]');
  if (addConditionBtn && addConditionForm) {
    addConditionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isHidden = addConditionForm.style.display === 'none';
      addConditionForm.style.display = isHidden ? 'block' : 'none';
      addConditionBtn.textContent = isHidden ? '×' : '+';
    });
  }
  root.onclick = async (event) => {
    const target = event.target.closest('[data-choice-detail-action]');
    if (!target) return;
    event.preventDefault();
    const action = target.dataset.choiceDetailAction;
    try {
      target.disabled = true;
      if (action === 'focus-visual-editor' || action === 'image') {
        const panel = root.querySelector('.choice-detail-visual-editor');
        if (panel) {
          panel.style.display = '';
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }
      if (action === 'visual-original') {
        await applyChoiceVisualFromDetail(detailVisualTargetFromDataset(target), 'original');
        return;
      }
      if (action === 'visual-generated') {
        await applyChoiceVisualFromDetail(detailVisualTargetFromDataset(target), 'generated');
        return;
      }
      if (action === 'visual-stock') {
        await applyChoiceVisualFromDetail(detailVisualTargetFromDataset(target), 'stock', {
          imageUrl: target.dataset.imageUrl,
          visualCredit: target.dataset.credit || '무료 사진 후보',
          visualQuery: target.dataset.query || '',
        });
        return;
      }
      if (action === 'apply-recipe-manual') {
        const form = $('#choice-detail-form', root);
        const box = target.closest('[data-recipe-manual-box]');
        await applyRecipeManualText(target.dataset.itemId || form?.dataset.itemId, box?.querySelector('[name="recipeManualText"]')?.value || '');
        return;
      }
      if (action === 'recipe-next-step') {
        advanceRecipeStep(target.dataset.itemId, Number(target.dataset.stepCount) || 0);
        renderChoiceDetailBody('item', target.dataset.itemId);
        return;
      }
      if (action === 'status') await updateItemStatus(target.dataset.itemId, target.dataset.status);
      if (action === 'delete-item') await removeCartItem(target.dataset.itemId);
      if (action === 'condition-item') {
        const form = $('#choice-detail-form', root);
        const fd = new FormData(form);
        await saveChoiceItemDetail(target.dataset.itemId, fd);
        await createPactFromItem(target.dataset.itemId, {
          currentAmount: numberFromInput(fd.get('conditionCurrentAmount')),
          targetAmount: numberFromInput(fd.get('conditionTargetAmount')),
          message: fd.get('conditionMessage'),
          itemPatch: {
            title: fd.get('title'),
            price: fd.get('price'),
            kind: fd.get('kind'),
            url: fd.get('url'),
            domain: domainFromUrl(fd.get('url')),
            note: fd.get('note'),
          },
        });
      }
      if (action === 'pact-status') await handlePactAction('status', target);
      if (action === 'delete-pact') await removePact(target.dataset.pactId);
      if (action === 'delete-condition') {
        const form = $('#choice-detail-form', root);
        const pactId = target.dataset.pactId || form?.dataset.pactId;
        await deletePactCondition(pactId, target.dataset.conditionId);
        await loadCartItems();
        renderChoiceDetailBody('pact', pactId);
        return;
      }
      if (action === 'delete-item-condition') {
        const form = $('#choice-detail-form', root);
        const itemId = target.dataset.itemId || form?.dataset.itemId;
        await deleteItemCondition(itemId, target.dataset.conditionId);
        await loadCartItems();
        renderChoiceDetailBody('item', itemId);
        return;
      }
      window.closeModal('choice-detail-modal');
      await loadCartItems();
    } catch (err) {
      showToast(err.message || '처리 실패', 2200, 'error');
    } finally {
      target.disabled = false;
    }
  };
}

function bindChoiceConditionTypeFields(root) {
  const sync = (fieldset) => {
    if (!fieldset) return;
    const select = fieldset.querySelector('[data-condition-type-select]');
    const type = normalizeChoiceConditionType(select?.value || fieldset.dataset.conditionType);
    fieldset.dataset.conditionType = type;
    fieldset.classList.toggle('condition-is-date', type === 'date');
    fieldset.classList.toggle('condition-is-binary', isBinaryConditionType(type));
    fieldset.classList.toggle('condition-is-numbered', !isBinaryConditionType(type));
  };
  root.querySelectorAll('[data-condition-fieldset]').forEach(sync);
  root.querySelectorAll('[data-condition-type-select]').forEach(select => {
    select.addEventListener('change', () => sync(select.closest('[data-condition-fieldset]')));
  });
}

function bindChoiceDetailVisualForms(root) {
  const searchForm = root.querySelector('.choice-detail-visual-search-form');
  if (searchForm) {
    bindGoogleImageLink(searchForm);
    searchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const query = String(new FormData(searchForm).get('query') || '').trim();
      if (!query) return;
      const button = searchForm.querySelector('button');
      const target = detailVisualTargetFromDataset(searchForm);
      try {
        if (button) {
          button.disabled = true;
          button.textContent = '찾는 중';
        }
        await refreshChoiceVisualCandidates(target, query, { rerender: false });
        renderChoiceDetailBody(target.kind, target.kind === 'pact' ? target.pactId : target.itemId, { visualOpen: true });
      } catch (err) {
        showToast(err.message || '이미지 후보를 찾지 못했어요.', 2200, 'warning');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = '검색';
        }
      }
    });
  }
  const siteForm = root.querySelector('.choice-detail-site-image-form');
  if (siteForm) {
    siteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const button = siteForm.querySelector('button');
      const target = detailVisualTargetFromDataset(siteForm);
      try {
        if (button) {
          button.disabled = true;
          button.textContent = '가져오는 중';
        }
        await refreshChoiceSiteImageCandidates(target, siteForm.dataset.sourceUrl, { rerender: false });
        renderChoiceDetailBody(target.kind, target.kind === 'pact' ? target.pactId : target.itemId, { visualOpen: true });
      } catch (err) {
        showToast(err.message || '사이트 이미지 후보를 가져오지 못했어요.', 2200, 'warning');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = '사이트 이미지 가져오기';
        }
      }
    });
  }
  const urlForm = root.querySelector('.choice-detail-visual-url-form');
  if (urlForm) {
    urlForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const imageUrl = safeExternalUrl(new FormData(urlForm).get('imageUrl'));
      if (!imageUrl) {
        showToast('https:// 로 시작하는 이미지 주소를 넣어주세요.', 1800, 'warning');
        return;
      }
      const button = urlForm.querySelector('button');
      try {
        if (button) button.disabled = true;
        await applyChoiceVisualFromDetail(detailVisualTargetFromDataset(urlForm), 'custom', {
          imageUrl,
          visualCredit: '직접 입력',
        });
      } catch (err) {
        showToast(err.message || '이미지 적용 실패', 2200, 'error');
      } finally {
        if (button) button.disabled = false;
      }
    });
  }
}

function bindGoogleImageLink(searchForm) {
  const input = searchForm?.querySelector('input[name="query"]');
  const link = searchForm?.querySelector('[data-google-image-link]');
  if (!input || !link) return;
  const sync = () => {
    link.href = googleImageSearchUrl(input.value);
  };
  input.addEventListener('input', sync);
  sync();
}

function detailVisualTargetFromDataset(node) {
  const kind = node.dataset.visualKind === 'pact' || node.dataset.pactId ? 'pact' : 'item';
  return {
    kind,
    itemId: node.dataset.itemId,
    pactId: node.dataset.pactId,
  };
}

async function applyChoiceVisualFromDetail(target, mode, patch = {}) {
  await applyChoiceVisual(target, mode, patch, { reload: false });
  rerenderCartBoard();
  const kind = target.kind === 'pact' || target.pactId ? 'pact' : 'item';
  renderChoiceDetailBody(kind, kind === 'pact' ? target.pactId : target.itemId, { visualOpen: true });
}

async function saveChoiceItemDetail(itemId, fd) {
  const item = STATE.items.find(row => row.id === itemId);
  if (!item) throw new Error('선택을 다시 불러와주세요.');
  await updateCartItem(itemId, {
    title: fd.get('title'),
    price: numberFromInput(fd.get('price')),
    kind: fd.get('kind'),
    url: fd.get('url'),
    domain: domainFromUrl(fd.get('url')),
    note: fd.get('note'),
    conditions: itemConditionsFromForm(item, fd, itemConditions),
  });
}

async function saveChoicePactDetail(pactId, fd) {
  const pact = STATE.pacts.find(row => row.id === pactId);
  if (!pact) throw new Error('약속을 다시 불러와주세요.');
  const trigger = { ...(pact.trigger || {}) };
  const conditions = pactConditionsFromForm(pact, fd);
  if (trigger.type === 'savings') {
    const amountCondition = conditions.find(condition => condition.type === 'amount');
    trigger.config = {
      ...(trigger.config || {}),
      currentAmount: amountCondition ? amountCondition.current : numberFromInput(fd.get('currentAmount')),
      targetAmount: amountCondition ? amountCondition.target : numberFromInput(fd.get('targetAmount')),
    };
  }
  await updatePact(pactId, {
    what: {
      ...(pact.what || {}),
      title: fd.get('title'),
      cost: numberFromInput(fd.get('cost')),
      note: fd.get('note'),
    },
    signature: {
      ...(pact.signature || {}),
      message: fd.get('message'),
    },
    trigger,
    conditions,
  });
}

async function deletePactCondition(pactId, conditionId) {
  const pact = STATE.pacts.find(row => row.id === pactId);
  if (!pact || !conditionId) throw new Error('조건을 다시 불러와주세요.');
  const conditions = pactConditions(pact).filter(condition => condition.id !== conditionId);
  await updatePact(pactId, { conditions });
  showToast('조건을 삭제했어요.', 1200, 'success');
}

async function deleteItemCondition(itemId, conditionId) {
  const item = STATE.items.find(row => row.id === itemId);
  if (!item || !conditionId) throw new Error('조건을 다시 불러와주세요.');
  const conditions = itemConditions(item).filter(condition => condition.id !== conditionId);
  await updateCartItem(itemId, { conditions });
  showToast('조건을 삭제했어요.', 1200, 'success');
}

async function refreshChoiceVisualCandidates(target = {}, query, opts = {}) {
  const kind = target.kind === 'pact' || target.pactId ? 'pact' : 'item';
  const entity = kind === 'pact'
    ? STATE.pacts.find(row => row.id === target.pactId)
    : STATE.items.find(row => row.id === target.itemId);
  if (!entity) return;
  const key = `${kind}:${entity.id}`;
  STATE.visualSearchQueries[key] = query;
  const candidates = await searchPublicVisualCandidates(query, { limit: 6 });
  STATE.visualCandidateSources[key] = `${visualProviderLabel(candidates[0]?.provider)} 결과`;
  STATE.visualCandidates[key] = candidates.slice(0, 6).map(candidate => ({
    label: candidate.label || candidate.title || query,
    url: safeExternalUrl(candidate.url || candidate.imageUrl),
    query,
    credit: candidate.credit || candidate.source || '공개 이미지 후보',
  })).filter(candidate => candidate.url);
  const count = STATE.visualCandidates[key].length || 0;
  showToast(count ? `공개 이미지 후보 ${count}개를 찾았어요.` : '공개 이미지 검색 결과가 없습니다.', 1600, count ? 'success' : 'warning');
  if (opts.rerender !== false) rerenderChoiceVisualPickerOnly();
}
function visualProviderLabel(provider) {
  if (provider === 'google-custom-search') return 'Google 검색'; if (provider === 'pexels') return 'Pexels'; if (provider === 'pixabay') return 'Pixabay';
  if (provider === 'openverse' || provider === 'wikimedia-commons' || provider === 'public-image-search') return '공개 이미지 검색';
  return PUBLIC_VISUAL_PROVIDER_LABEL;
}

async function refreshChoiceSiteImageCandidates(target = {}, sourceUrl, opts = {}) {
  const kind = target.kind === 'pact' || target.pactId ? 'pact' : 'item';
  const entity = kind === 'pact'
    ? STATE.pacts.find(row => row.id === target.pactId)
    : STATE.items.find(row => row.id === target.itemId);
  if (!entity) return;
  const url = safeExternalUrl(sourceUrl || choiceVisualSourceUrl(entity, kind));
  if (!url) {
    showToast('대표 이미지를 가져올 사이트 URL이 없어요.', 1800, 'warning');
    return;
  }
  const key = `${kind}:${entity.id}`;
  const candidates = await searchSiteRepresentativeImages(url, { limit: 6 });
  STATE.visualSearchQueries[key] = domainFromUrl(url) || url;
  STATE.visualCandidateSources[key] = '사이트 대표 이미지';
  STATE.visualCandidates[key] = candidates.slice(0, 6).map(candidate => ({
    label: candidate.label || domainFromUrl(url) || '사이트 이미지',
    url: safeExternalUrl(candidate.url || candidate.imageUrl),
    query: domainFromUrl(url) || url,
    credit: candidate.credit || `${domainFromUrl(url) || '사이트'} · 대표 이미지`,
  })).filter(candidate => candidate.url);
  const count = STATE.visualCandidates[key].length || 0;
  showToast(count ? `사이트 대표 이미지 ${count}개를 가져왔어요.` : '사이트에서 쓸 만한 대표 이미지를 찾지 못했어요.', 1700, count ? 'success' : 'warning');
  if (opts.rerender !== false) rerenderChoiceVisualPickerOnly();
}

function cartDecisionInsight(aged, simple) {
  const agedSimple = aged.filter(item => !isRecipeItem(item));
  const total = simple.reduce((sum, item) => sum + itemDecisionTotal(item), 0);
  return `
    <div class="insight warn">
      <span class="tag">쿨오프 추천</span>
      <div class="head">${agedSimple.length ? `3일 이상 담아둔 아이템 ${agedSimple.length}개 · 하나만 지금 살래요?` : '새로 담은 것들은 잠깐 숙성시켜도 좋아요'}</div>
      <div class="body">${total ? `현재 결제 후보는 ${fmtKRW(total)}입니다. 충동 후보와 진짜 필요한 후보를 한 번 더 나눠보세요.` : 'URL이나 공유 텍스트를 붙이면 결정 보드에 쌓입니다.'}</div>
    </div>
  `;
}

function pactInsight(pactStats, unresolved) {
  return `
    <div class="insight review">
      <span class="tag">하고픈 것</span>
      <div class="head">준비된 약속 ${pactStats.ready}개 · 주문처 미정 재료 ${unresolved.length}개</div>
      <div class="body">레시피와 구매 후보를 약속 조건에 연결해두면, 사고 싶은 것과 하고 싶은 일이 같은 보드에서 관리됩니다.</div>
    </div>
  `;
}

function selectionFlowStats({ simple, recipes, pactStats, mindbank, urges }) {
  return {
    urges: urges.length || mindbank.urges,
    candidates: simple.length + recipes.length + pactStats.active + pactStats.ready,
    saved: Number(mindbank.total) || 0,
    kept: pactStats.fulfilled,
    readiness: pactStats.total ? Math.round(((pactStats.ready + pactStats.fulfilled) / pactStats.total) * 100) : 0,
  };
}

function selectionFlowInsight(flow) {
  const active = flow.candidates > 0;
  return `
    <div class="insight blue-glow">
      <span class="tag">전환 흐름</span>
      <div class="head">${active ? `충동 ${flow.urges}개가 후보 ${flow.candidates}개와 적립 ${fmtKRW(flow.saved)}로 이어졌어요` : '지금은 밀린 후보가 거의 없습니다'}</div>
      <div class="body">${active ? '사고 싶은 것, 약속, 감각뱅크 적립을 한 흐름으로 봅니다. 결제 전에는 후보, 조건을 붙이면 약속, 참거나 대체하면 적립입니다.' : '후보가 비어 있는 상태도 좋은 신호입니다. 필요할 때만 아래 도크에 붙여넣으세요.'}</div>
    </div>
  `;
}

function bankInsight(mindbank, pactStats) {
  return `
    <div class="insight">
      <span class="tag">적립</span>
      <div class="head">좋은 선택 ${mindbank.goodChoices}건 · 지킨 약속 ${pactStats.fulfilled}건</div>
      <div class="body">후보를 버리거나, 욕구를 대체하거나, 약속을 지킨 순간을 같은 적립 흐름으로 모읍니다.</div>
    </div>
  `;
}

function bankChoiceCard(entry) {
  const saved = Number(entry.savedAmount) || 0;
  const kcal = Number(entry.savedKcal) || 0;
  const when = normalizeDate(entry.occurredAt) || normalizeDate(entry.createdAt);
  const pact = String(entry.choiceType || '').startsWith('pact');
  const marker = pact ? '✓' : '◈';
  const value = saved
    ? `-${saved.toLocaleString('ko-KR')}`
    : pact
      ? '약속'
      : '기록';
  return `
    <article class="choice selection-choice-card choice-bank-entry">
      <span class="em">${marker}</span>
      <span class="body">
        <span class="h">${escHtml(entry.choiceTitle || entry.urgeWhat || '좋은 선택')}</span>
        <span class="m">${escHtml(entry.urgeWhat || '')}${when ? ` · ${relTime(when)}` : ''}${kcal ? ` · -${kcal.toLocaleString('ko-KR')}kcal` : ''}</span>
      </span>
      <span class="saved">${escHtml(value)}</span>
    </article>
  `;
}

function withRecipeFallbackDisplay(item) {
  if (!item || item.type !== 'recipe') return item;
  const ingredients = normalizedIngredients(item);
  const steps = normalizedRecipeSteps(item.steps);
  const shouldRefreshNote = shouldReplaceAutoRecipeMemo(item.note || item.summary || '') && (ingredients.length || steps.length);
  const sparseIngredients = ingredients.length > 0 && ingredients.length < 2;
  if (ingredients.length && !sparseIngredients && steps.length && !shouldRefreshNote) return item;
  const fallback = (!ingredients.length || sparseIngredients || !steps.length)
    ? recipePresetPreviewFromText(recipeFallbackSeedText(item), item.url, item)
    : null;
  if (!fallback && !shouldRefreshNote) return item;
  const nextIngredients = sparseIngredients ? mergeRecipeIngredients(ingredients, normalizedIngredients(fallback)) : ingredients.length ? ingredients : normalizedIngredients(fallback);
  const nextSteps = steps.length ? steps : normalizedRecipeSteps(fallback?.steps);
  if (!nextIngredients.length && !nextSteps.length) return item;
  const nextSummary = String(item.summary || fallback?.summary || '').trim();
  const nextNote = shouldReplaceAutoRecipeMemo(item.note || nextSummary)
    ? recipeMemoFromParts({ summary: nextSummary, ingredients: nextIngredients, steps: nextSteps })
    : String(item.note || '').trim();
  return {
    ...item,
    title: item.title || fallback?.title,
    summary: nextSummary,
    ingredients: nextIngredients,
    steps: nextSteps,
    note: nextNote || item.note || '',
  };
}

function recipeFallbackSeedText(item) {
  return [
    item?.title,
    item?.summary,
    item?.note,
    item?.source?.caption,
    item?.url,
  ].filter(Boolean).join('\n');
}

function normalizedRecipeSteps(value) {
  return Array.isArray(value) ? value.map(step => String(step || '').trim()).filter(Boolean) : [];
}

async function toggleRecipeIngredientAcquired(itemId, ingId, acquired) {
  const item = STATE.items.find(row => row.id === itemId);
  if (!item) throw new Error('레시피를 다시 불러와주세요.');
  const ingredients = normalizedIngredients(item).map(ing => ing.id === ingId ? { ...ing, acquired: !!acquired } : ing);
  await updateCartItem(itemId, { ingredients });
  item.ingredients = ingredients;
  await loadCartItems(); renderChoiceDetailBody('item', itemId);
  showToast(acquired ? '재료를 준비됨으로 표시했어요.' : '재료 체크를 해제했어요.', 1100, 'success');
}

async function applyRecipeManualText(itemId, text) {
  const item = STATE.items.find(row => row.id === itemId);
  if (!item) throw new Error('레시피를 다시 불러와주세요.');
  const parts = recipePartsFromManualText(text);
  if (!parts.summary && !parts.ingredients.length && !parts.steps.length) throw new Error('붙여넣은 텍스트에서 재료나 순서를 찾지 못했어요.');
  const ingredients = parts.ingredients.length ? parts.ingredients : normalizedIngredients(item);
  const steps = parts.steps.length ? parts.steps : normalizedRecipeSteps(item.steps);
  const summary = parts.summary || item.summary || '';
  const noteExtra = shouldReplaceAutoRecipeMemo(item.note || '') ? '' : item.note || '';
  const note = recipeMemoFromParts({ summary, ingredients, steps, extra: noteExtra });
  await updateCartItem(itemId, { type: 'recipe', kind: item.kind || 'eat', summary, ingredients, steps, note });
  Object.assign(item, { summary, ingredients, steps, note });
  await loadCartItems(); renderChoiceDetailBody('item', itemId);
  showToast('붙여넣은 텍스트를 재료와 순서로 정리했어요.', 1400, 'success');
}

function pactComposer() {
  return `
    <details class="pact-composer pact-wizard">
      <summary>
        <span>＋ 하고픈 것 만들기</span>
        <em>2-step · 조건 약속</em>
      </summary>
      <div class="pact-stepbar"><span></span><span></span></div>
      <form id="pact-form" class="pact-form">
        <div class="wizard-meta"><span class="step-label">1. WHAT</span><span>무엇을 미래로 보낼까요?</span></div>
        <div class="intent-row pact-intents">
          <label class="intent-pill"><span class="em">🛒</span><input type="radio" name="category" value="purchase" checked>구매</label>
          <label class="intent-pill"><span class="em">✈️</span><input type="radio" name="category" value="experience">경험</label>
          <label class="intent-pill"><span class="em">🏋️</span><input type="radio" name="category" value="action">행동</label>
          <label class="intent-pill"><span class="em">🤝</span><input type="radio" name="category" value="relation">관계</label>
          <label class="intent-pill"><span class="em">🚫</span><input type="radio" name="category" value="restraint">금지</label>
        </div>
        <input class="tds-input" name="title" placeholder="예: 70kg 되면 러닝화 사기" required>
        <div class="cart-form-grid">
          <input class="tds-input" name="cost" inputmode="numeric" placeholder="예상 비용">
        </div>
        <div class="wizard-meta"><span class="step-label">2. WHEN / IF</span><span>조건이 맞으면 실현합니다</span></div>
        <div class="chips pact-trigger-rail">
          ${triggerTypePill('time', '날짜', true)}
          ${triggerTypePill('savings', '저축액')}
          ${triggerTypePill('streak', '스트릭')}
          ${triggerTypePill('measure', '측정값')}
          ${triggerTypePill('event', '이벤트')}
          ${triggerTypePill('manual', '수동')}
        </div>
        <div class="trigger-card pact-ai-hint">
          <span class="ico">✦</span>
          <span class="body">
            <span class="h2">무리한 약속 방지</span>
            <span class="m">비용이 크면 감각뱅크/저축액 조건을 우선 추천합니다. 너무 빡센 약속은 깨짐을 늘려요.</span>
          </span>
        </div>
        <div class="pact-trigger-fields">
          <div class="pact-trigger-field-group" data-trigger-field="time">
            <span class="pact-trigger-field-label">날짜 조건</span>
            <input class="tds-input" name="date" type="date" aria-label="날짜">
          </div>
          <div class="pact-trigger-field-group" data-trigger-field="savings">
            <span class="pact-trigger-field-label">저축액 조건</span>
            <input class="tds-input" name="targetAmount" inputmode="numeric" placeholder="목표 금액">
            <input class="tds-input" name="currentAmount" inputmode="numeric" placeholder="현재 금액">
          </div>
          <div class="pact-trigger-field-group" data-trigger-field="streak">
            <span class="pact-trigger-field-label">스트릭 조건</span>
            <input class="tds-input" name="streakMetric" placeholder="지표명 예: 운동">
            <input class="tds-input" name="count" inputmode="numeric" placeholder="목표 횟수/일수">
            <input class="tds-input" name="currentCount" inputmode="numeric" placeholder="현재 횟수">
          </div>
          <div class="pact-trigger-field-group" data-trigger-field="measure">
            <span class="pact-trigger-field-label">측정값 조건</span>
            <input class="tds-input" name="measureMetric" placeholder="지표명 예: 체중">
            <select class="tds-select" name="op"><option value="<=">이하</option><option value=">=">이상</option></select>
            <input class="tds-input" name="value" inputmode="decimal" placeholder="목표값">
            <input class="tds-input" name="currentValue" inputmode="decimal" placeholder="현재값">
            <input class="tds-input" name="unit" placeholder="단위">
          </div>
          <div class="pact-trigger-field-group" data-trigger-field="event">
            <span class="pact-trigger-field-label">이벤트 조건</span>
            <input class="tds-input" name="eventName" placeholder="이벤트명">
          </div>
        </div>
        <input type="hidden" name="costSource" value="mindbank">
        <button class="tds-btn full pact-submit-btn" type="submit">약속 저장</button>
      </form>
    </details>
  `;
}

function triggerTypePill(value, label, checked = false) {
  return `
    <label class="chip pact-trigger-pill ${checked ? 'active' : ''}">
      <input type="checkbox" name="triggerType" value="${value}" ${checked ? 'checked' : ''}>
      <span>${label}</span>
    </label>
  `;
}

function pactSummary(pacts) {
  const rows = (pacts || []).map(withPactRuntime);
  return {
    total: rows.filter(p => !['archived'].includes(p.status)).length,
    active: rows.filter(p => ['active', 'ripening'].includes(effectivePactStatus(p))).length,
    ready: rows.filter(p => effectivePactStatus(p) === 'ready').length,
    fulfilled: rows.filter(p => p.status === 'fulfilled').length,
    broken: rows.filter(p => p.status === 'broken').length,
    archived: rows.filter(p => p.status === 'archived').length,
  };
}

function filteredPacts(pacts) {
  const rows = (pacts || []).map(withPactRuntime);
  if (STATE.pactFilter === 'ready') return rows.filter(p => effectivePactStatus(p) === 'ready');
  if (STATE.pactFilter === 'fulfilled') return rows.filter(p => p.status === 'fulfilled');
  if (STATE.pactFilter === 'broken') return rows.filter(p => p.status === 'broken');
  if (STATE.pactFilter === 'archived') return rows.filter(p => p.status === 'archived');
  return rows.filter(p => ['active', 'ripening'].includes(effectivePactStatus(p)));
}

function pactCard(pact) {
  const p = withPactRuntime(pact);
  const status = effectivePactStatus(p);
  const title = p.what?.title || '이름 없는 약속';
  const pct = Math.round((p.runtimeProgress || 0) * 100);
  return `
    <article class="pact-card ${status}" data-pact-card-id="${escAttr(p.id)}">
      <div class="pact-icon">${escHtml(p.what?.emoji || '🎯')}</div>
      <div class="pact-body">
        <div class="pact-kicker">
          <span>${escHtml(pactCategoryLabel(p.what?.category))}</span>
          <em>${escHtml(triggerLabel(p))}</em>
        </div>
        <h3>${escHtml(title)}</h3>
        <p>${escHtml(p.signature?.message || statusMessage(status))}</p>
        <div class="pact-trigger-card">
          <span>${triggerIcon(p.trigger?.type)}</span>
          <strong>${escHtml(triggerLabel(p))}</strong>
          <em>${status === 'ready' ? '지금 실행 가능' : status === 'broken' ? '회고 필요' : '조건을 채우는 중'}</em>
        </div>
        <div class="pact-progress">
          <i><b style="width:${pct}%"></b></i>
          <span>${pct}% · ${escHtml(statusLabel(status))}</span>
        </div>
      </div>
      <div class="pact-side">
        <strong>${p.what?.cost ? `${fmtKRW(p.what.cost)} · ${pactCostSourceLabel(p.cost?.source)}` : pactCostSourceLabel(p.cost?.source)}</strong>
        <div class="pact-actions">
          ${status === 'fulfilled'
            ? `<button type="button" data-pact-action="status" data-pact-id="${escAttr(p.id)}" data-status="active">↩</button>`
            : `<button type="button" data-pact-action="status" data-pact-id="${escAttr(p.id)}" data-status="fulfilled">실현</button>`}
          <button type="button" data-pact-action="status" data-pact-id="${escAttr(p.id)}" data-status="broken">깸</button>
          <button type="button" data-pact-action="status" data-pact-id="${escAttr(p.id)}" data-status="archived">보관</button>
        </div>
      </div>
    </article>
  `;
}

function emptyPactHtml() {
  return `
    <div class="empty-state compact cart-empty">
      <div>아직 하고픈 약속이 없습니다</div>
      <p>여행, 구매, 행동, 관계, 금지 약속을 조건과 함께 묶어두세요.</p>
      <div class="pact-empty-examples">
        <button type="button" data-pact-example="shoes">70kg 되면 러닝화</button>
        <button type="button" data-pact-example="travel">2년에 한 번 일본</button>
        <button type="button" data-pact-example="wine">30일 절주 후 와인</button>
      </div>
    </div>
  `;
}

function bindPactComposer() {
  const form = $('#pact-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  const refreshRadioGroup = (name, className = 'intent-pill') => {
    form.querySelectorAll(`input[name="${name}"]`).forEach(input => {
      input.closest(`.${className}`)?.classList.toggle('active', input.checked);
    });
  };
  const refreshFields = () => {
    const triggerTypes = getSelectedPactTriggerTypes(form);
    form.dataset.triggerType = primaryPactTriggerType(triggerTypes);
    form.dataset.triggerTypes = triggerTypes.join(' ');
    form.querySelectorAll('.pact-trigger-pill').forEach(label => {
      label.classList.toggle('active', !!label.querySelector('input')?.checked);
    });
    refreshRadioGroup('category');
    refreshRadioGroup('costSource');
  };
  const triggerInputs = [...form.querySelectorAll('input[name="triggerType"]')];
  triggerInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (input.value === 'manual' && input.checked) {
        triggerInputs.forEach(other => {
          if (other !== input) other.checked = false;
        });
      } else if (input.checked) {
        const manual = triggerInputs.find(other => other.value === 'manual');
        if (manual) manual.checked = false;
      }
      if (!triggerInputs.some(other => other.checked)) {
        const fallback = triggerInputs.find(other => other.value === 'manual') || triggerInputs[0];
        if (fallback) fallback.checked = true;
      }
      refreshFields();
    });
  });
  form.querySelectorAll('input[name="category"], input[name="costSource"]')
    .forEach(input => input.addEventListener('change', refreshFields));
  refreshFields();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    try {
      const pact = formDataToPact(fd);
      if (hasPactTriggerConflict(pact, STATE.pacts)) {
        showToast('이미 같은 조건의 활성 약속이 있어요.', 2200, 'warning');
        return;
      }
      await savePact(pact);
      form.reset();
      refreshFields();
      showToast('하고픈 약속을 저장했어요.', 1400, 'success');
      STATE.pactFilter = 'active';
      await loadCartItems();
    } catch (err) {
      showToast(err.message || '약속 저장 실패', 2400, 'error');
    }
  });
}

async function createPactFromItem(itemId, options = {}) {
  const baseItem = STATE.items.find(row => row.id === itemId);
  if (!baseItem) return;
  const item = {
    ...baseItem,
    ...(options.itemPatch || {}),
  };
  item.id = itemId;
  const model = choiceCardModelFromItem(item);
  const imageUrl = safeExternalUrl(model?.imageUrl) || choiceAutoVisualCandidate(item)?.url || choiceOriginalImageUrl(item);
  const originalImageUrl = choiceOriginalImageUrl(item) || imageUrl;
  const price = numberFromInput(item.price);
  const targetAmount = options.targetAmount || price || 0;
  const currentAmount = Math.max(0, Number(options.currentAmount) || 0);
  const message = String(options.message || '지금 바로 결제하지 않고, 조건을 채운 뒤 다시 결정한다.').trim();
  await savePact({
    what: {
      title: item.title || '사고픈 것',
      category: 'purchase',
      cost: price,
      note: item.note || '',
      sourceUrl: item.url || '',
      imageUrl,
      originalImageUrl,
      visualMode: item.visualMode || (imageUrl ? 'stock' : 'generated'),
      visualCredit: item.visualCredit || (imageUrl ? '이미지 후보' : ''),
      visualQuery: item.visualQuery || choiceImageSearchQuery(item),
    },
    trigger: {
      type: 'savings',
      config: {
        targetAmount,
        currentAmount,
      },
    },
    cost: { source: 'mindbank' },
    signature: { message, cooloffHours: 24 },
    conditions: [{
      id: 'purchase_budget',
      type: 'amount',
      label: '구매 예산',
      current: currentAmount,
      target: targetAmount,
      unit: '원',
      done: targetAmount > 0 && currentAmount >= targetAmount,
      note: '',
    }],
    linkedCartItemId: item.id,
    sourceUrl: item.url || '',
    status: 'active',
  });
  await updateCartItem(item.id, { status: 'archived' });
  STATE.segment = 'do';
  STATE.pactFilter = 'active';
  showToast('사고픈 것을 약속으로 옮겼어요.', 1500, 'success');
  await loadCartItems();
}

async function handlePactAction(action, target) {
  const pactId = target.dataset.pactId;
  if (action === 'delete') {
    await updatePact(pactId, { status: 'archived' });
    showToast('약속을 보관했어요.', 1200, 'success');
    await loadCartItems();
    return;
  }
  if (action === 'status') {
    const status = target.dataset.status;
    if (status === 'broken') {
      STATE.reflectionTarget = { kind: 'pact', pactId };
      STATE.actionSheetTarget = null;
      refreshChoiceOverlays();
      return;
    }
    if (status === 'fulfilled') await fulfillPact(pactId);
    else await updatePact(pactId, {
      status,
      fulfilledAt: null,
      brokenAt: null,
      brokenReason: null,
    });
    showToast(status === 'fulfilled'
      ? '약속을 실현 처리했어요.'
      : status === 'active'
        ? '조건 진행 중으로 되돌렸어요.'
        : '약속 상태를 바꿨어요.', 1200, 'success');
    if (status === 'fulfilled') STATE.pactFilter = 'fulfilled';
    if (status === 'broken') STATE.pactFilter = 'broken';
    if (status === 'active') STATE.pactFilter = 'active';
    await loadCartItems();
  }
}

async function fulfillPact(pactId) {
  const pact = STATE.pacts.find(p => p.id === pactId);
  if (!pact) throw new Error('약속을 다시 불러와주세요.');
  const p = withPactRuntime(pact);
  const title = p.what?.title || '이름 없는 약속';
  const cost = Math.max(0, Math.round(Number(p.what?.cost) || 0));
  let fulfilledTxId = p.fulfilledTxId || '';

  if (cost > 0 && !fulfilledTxId) {
    fulfilledTxId = await saveTransaction({
      type: 'card_payment',
      amount: cost,
      occurredAt: new Date(),
      merchant: title,
      category: pactCategoryToTxCategory(p.what?.category),
      subcategory: pactCostSourceLabel(p.cost?.source),
      memo: p.signature?.message || '약속 실현',
      needsReview: true,
      source: 'pact_fulfillment',
      pactId,
      pactTitle: title,
      intent: 'planned',
      reflection: 'Pact 실현으로 생성된 거래 후보입니다.',
    });
  }

  await updatePact(pactId, {
    status: 'fulfilled',
    fulfilledAt: new Date(),
    brokenAt: null,
    brokenReason: null,
    fulfilledTxId,
  });
  await saveMindbankEntry({
    pactId,
    pactTitle: title,
    pactStatus: 'fulfilled',
    urgeWhat: title,
    urgePrice: cost,
    desireType: 'pact',
    choiceType: 'pact_fulfilled',
    choiceTitle: `지킨 약속: ${title}`,
    choiceDesc: p.signature?.message || '미래의 나와 한 약속을 실현했습니다.',
    savedAmount: 0,
    badges: ['지킨 약속', pactCostSourceLabel(p.cost?.source)],
    category: pactCategoryLabel(p.what?.category),
    occurredAt: new Date(),
  });
}

async function breakPact(pactId, reasonText = '') {
  const pact = STATE.pacts.find(p => p.id === pactId);
  if (!pact) throw new Error('약속을 다시 불러와주세요.');
  const p = withPactRuntime(pact);
  const reason = String(reasonText || '').trim();
  const progress = Math.max(0, Math.min(1, p.runtimeProgress || 0));
  const effortValue = Math.round((Number(p.what?.cost) || 0) * progress);
  const title = p.what?.title || '이름 없는 약속';

  await updatePact(pactId, {
    status: 'broken',
    brokenAt: new Date(),
    brokenReason: reason,
    fulfilledAt: null,
  });
  await saveMindbankEntry({
    pactId,
    pactTitle: title,
    pactStatus: 'broken',
    urgeWhat: title,
    urgePrice: Number(p.what?.cost) || 0,
    desireType: 'pact',
    choiceType: 'pact_broken',
    choiceTitle: `깨진 약속 회고: ${title}`,
    choiceDesc: reason || '깨진 이유를 다음 조건 조정 데이터로 남겼습니다.',
    savedAmount: effortValue,
    badges: ['깨짐 회고', `${Math.round(progress * 100)}% 진척`],
    category: pactCategoryLabel(p.what?.category),
    occurredAt: new Date(),
  });
}

async function postponePact(pactId) {
  const pact = STATE.pacts.find(p => p.id === pactId);
  if (!pact) return;
  const next = new Date();
  next.setDate(next.getDate() + 14);
  const date = next.toISOString().slice(0, 10);
  await updatePact(pactId, {
    status: 'active',
    trigger: { type: 'time', config: { date } },
  });
  showToast('2주 뒤 다시 보기로 미뤘어요.', 1400, 'success');
  await loadCartItems();
}

function openPactDetail(pactId) {
  const pact = STATE.pacts.find(p => p.id === pactId);
  if (!pact) {
    showToast('약속을 다시 불러와주세요.', 1600, 'warning');
    return;
  }
  const p = withPactRuntime(pact);
  const status = effectivePactStatus(p);
  const pct = Math.round((p.runtimeProgress || 0) * 100);
  const cooloff = pactCooloffLabel(p);
  ensurePactDetailModal();
  const body = $('#pact-detail-body');
  body.innerHTML = `
    <section class="pact-detail-hero ${status}">
      <div class="pact-detail-emoji">${escHtml(p.what?.emoji || '□')}</div>
      <div class="label">${escHtml(statusLabel(status))}</div>
      <div class="h">${escHtml(p.what?.title || '이름 없는 약속')}</div>
      <p>${escHtml(p.signature?.message || statusMessage(status))}</p>
      <div class="pact-progress detail">
        <i><b style="width:${pct}%"></b></i>
        <span>${pct}%</span>
      </div>
    </section>
    <div class="trigger-card pact-detail-trigger">
      <span class="ico">${triggerIcon(p.trigger?.type)}</span>
      <span class="body">
        <span class="h2">${escHtml(triggerLabel(p))}</span>
        <span class="m">${p.what?.cost ? `예상 비용 ${fmtKRW(p.what.cost)} · ` : ''}${escHtml(pactCostSourceLabel(p.cost?.source))} · ${escHtml(pactCategoryLabel(p.what?.category))}</span>
      </span>
    </div>
    <div class="pact-detail-ledger">
      <div><span>서명</span><strong>${escHtml(p.signature?.message || '서명 메시지 없음')}</strong></div>
      <div><span>쿨오프</span><strong>${escHtml(cooloff)}</strong></div>
      <div><span>연결</span><strong>${escHtml(p.linkedCartItemId ? '장바구니 후보에서 전환' : p.linkedUrgeId ? '끌림 흐름에서 전환' : '직접 생성')}</strong></div>
      ${p.fulfilledTxId ? `<div><span>거래 후보</span><strong>생성됨</strong></div>` : ''}
    </div>
    ${status === 'broken' ? `
      <div class="insight warn">
        <span class="tag">깨짐 회고</span>
        <div class="head">다음 약속을 더 작게 만들 단서입니다</div>
        <div class="body">${escHtml(p.brokenReason || '이유가 아직 비어 있어요. 깨진 약속은 처벌이 아니라 다음 조건 조정 데이터입니다.')}</div>
      </div>
    ` : ''}
    <div class="pact-detail-actions">
      <button class="tds-btn secondary" type="button" data-pact-detail-action="postpone" data-pact-id="${escAttr(p.id)}">2주 미루기</button>
      <button class="tds-btn" type="button" data-pact-detail-action="fulfill" data-pact-id="${escAttr(p.id)}">실현</button>
      <button class="tds-btn ghost danger-text" type="button" data-pact-detail-action="break" data-pact-id="${escAttr(p.id)}">깨짐 기록</button>
    </div>
  `;
  body.onclick = async (event) => {
    const target = event.target.closest('[data-pact-detail-action]');
    if (!target) return;
      const action = target.dataset.pactDetailAction;
      try {
        target.disabled = true;
        if (action === 'postpone') await postponePact(target.dataset.pactId);
        if (action === 'fulfill') await fulfillPact(target.dataset.pactId);
        if (action === 'break') {
          STATE.reflectionTarget = { kind: 'pact', pactId: target.dataset.pactId };
          window.closeModal('pact-detail-modal');
          refreshChoiceOverlays();
          return;
        }
      window.closeModal('pact-detail-modal');
      await loadCartItems();
    } catch (err) {
      showToast(err.message || '약속 변경 실패', 2400, 'error');
    } finally {
      target.disabled = false;
    }
  };
  window.openModal('pact-detail-modal');
}

function ensurePactDetailModal() {
  if (document.getElementById('pact-detail-modal')) return;
  const container = document.getElementById('modals-container') || document.body;
  container.insertAdjacentHTML('beforeend', `
    <div class="tds-modal-overlay" id="pact-detail-modal">
      <div class="tds-modal-sheet">
        <div class="tds-modal-handle"></div>
        <div class="tds-modal-content" style="text-align:left">
          <div class="choice-modal-head choice-detail-modal-head">
            <div class="choice-modal-ico">⊕</div>
            <div>
              <h2>약속 상세</h2>
              <p>조건 진행과 회고를 한 시트에서 정리합니다.</p>
            </div>
            <button type="button" class="tds-modal-close choice-sheet-close" data-close-modal="pact-detail-modal">×</button>
          </div>
          <div id="pact-detail-body"></div>
        </div>
      </div>
    </div>
  `);
  const modal = document.getElementById('pact-detail-modal');
  bindChoiceSheetDismiss(modal, () => window.closeModal('pact-detail-modal'));
  bindModalCloseButtons(modal);
}

function bindModalCloseButtons(modal) {
  if (!modal) return;
  modal.querySelectorAll('[data-close-modal]').forEach(button => {
    button.addEventListener('click', () => {
      window.closeModal(button.dataset.closeModal);
    });
  });
}

function itemConditionStats(item, opts = {}) {
  const conditions = itemConditions(item, opts);
  const total = conditions.length;
  const done = conditions.filter(condition => conditionProgress(condition) >= 1).length;
  const progress = total
    ? conditions.reduce((sum, condition) => sum + conditionProgress(condition), 0) / total
    : 0;
  return {
    conditions,
    total,
    done,
    progress,
    progressPct: Math.round(progress * 100),
    ready: total ? done === total : false,
  };
}

function itemConditions(item, opts = {}) {
  const explicit = Array.isArray(item?.conditions)
    ? item.conditions.map(normalizeChoicePactCondition).filter(Boolean)
    : [];
  if (explicit.length) return explicit;
  if (opts.includeSuggestions === false) return [];
  return suggestedItemConditions(item);
}

function suggestedItemConditions(item) {
  if (isRecipeItem(item)) {
    const ingredients = normalizedIngredients(item);
    const decided = ingredients.filter(isIngredientDecided).length;
    return [
      {
        id: 'recipe_ingredients',
        type: 'number',
        label: '재료 후보 결정',
        current: decided,
        target: Math.max(1, ingredients.length || 3),
        unit: '개',
        done: ingredients.length ? decided >= ingredients.length : false,
        note: '',
      },
      { id: 'recipe_time', type: 'check', label: '실행할 요일/시간 정하기', current: 0, target: 1, unit: '', done: false, note: '' },
      { id: 'recipe_energy', type: 'check', label: '요리할 컨디션 확보', current: 0, target: 1, unit: '', done: false, note: '' },
    ];
  }
  const price = itemDecisionTotal(item);
  const created = timestampMs(item?.createdAt) || Date.now();
  const waitHours = Math.min(24, Math.max(0, Math.floor((Date.now() - created) / 3600000)));
  return [
    {
      id: 'cooloff_24h',
      type: 'number',
      label: '24시간 보류',
      current: waitHours,
      target: 24,
      unit: 'h',
      done: waitHours >= 24,
      note: '',
    },
    {
      id: 'budget_room',
      type: 'amount',
      label: '쓸 수 있는 예산 확보',
      current: 0,
      target: Math.max(1, price || Number(item?.price) || 0),
      unit: '원',
      done: false,
      note: '',
    },
    { id: 'need_check', type: 'check', label: '지금 필요한 이유 확인', current: 0, target: 1, unit: '', done: false, note: '' },
  ];
}

function bindCartBoardEvents(root) {
  root.onclick = async (event) => {
    const target = event.target.closest('[data-cart-action], [data-bank-range], [data-subplan-segment], [data-pact-filter], [data-pact-action], [data-pact-card-id], [data-pact-example]');
    if (!target) return;
    const pactExample = target.dataset.pactExample;
    if (pactExample) {
      applyPactExample(pactExample);
      return;
    }
    const pactCardId = target.dataset.pactCardId;
    if (pactCardId) {
      openPactDetail(pactCardId);
      return;
    }
    const segment = target.dataset.subplanSegment;
    if (segment) {
      STATE.segment = segment;
      localStorage.setItem('budget.planSegment', segment);
      STATE.filter = 'all';
      rerenderCartBoard();
      return;
    }
    const bankRange = target.dataset.bankRange;
    if (bankRange) {
      STATE.bankRange = bankRange;
      localStorage.setItem('budget.choiceBankRange', bankRange);
      rerenderCartBoard();
      return;
    }
    const pactFilter = target.dataset.pactFilter;
    if (pactFilter) {
      STATE.pactFilter = pactFilter;
      rerenderCartBoard();
      return;
    }
    const action = target.dataset.cartAction;
    const pactAction = target.dataset.pactAction;
    const itemId = target.dataset.itemId;
    const pactId = target.dataset.pactId;
    const ingId = target.dataset.ingId;
    try {
      if (target.tagName === 'BUTTON') target.disabled = true;
      if (action === 'explain-bookmarklet') {
        cartExplainBookmarklet(event);
        return;
      }
      if (action === 'copy-bookmarklet') {
        await copyCartBookmarklet();
        return;
      }
      if (action === 'open-capture') {
        STATE.actionSheetTarget = null;
        STATE.actionSheetReturnEl = null;
        STATE.reflectionTarget = null;
        openCaptureSheet();
        return;
      }
      if (action === 'open-action-sheet') {
        STATE.actionSheetReturnEl = target;
        STATE.actionSheetTarget = { kind: target.dataset.visualKind, itemId, pactId };
        STATE.reflectionTarget = null;
        STATE.visualPickerItemId = null;
        STATE.visualPickerPactId = null;
        refreshChoiceOverlays();
        return;
      }
      if (action === 'open-detail') {
        STATE.actionSheetTarget = null;
        STATE.reflectionTarget = null;
        openChoiceDetail({ itemId, pactId, kind: target.dataset.visualKind, detailPanel: target.dataset.detailPanel });
        refreshChoiceOverlays();
        return;
      }
      if (action === 'open-visual-picker') {
        openChoiceVisualPicker({ itemId, pactId, kind: target.dataset.visualKind });
        return;
      }
      if (pactAction) await handlePactAction(pactAction, target);
      if (action === 'status') await updateItemStatus(itemId, target.dataset.status);
      if (action === 'delete') await removeCartItem(itemId);
      if (action === 'pact-from-item') await createPactFromItem(itemId);
    } catch (err) {
      showToast(err.message || '처리 실패', 2400, 'error');
    } finally {
      if (target.tagName === 'BUTTON') target.disabled = false;
    }
  };
  bindPactComposer();
  bindChoiceCarousel(root);
}

function bindChoiceCarousel(root) {
  const carousel = root.querySelector('[data-choice-carousel]');
  if (!carousel) return;
  let startX = 0;
  const setIndex = (nextIndex) => {
    const max = Math.max(0, carousel.querySelectorAll('.choice-visual-slide').length - 1);
    STATE.heroIndex = Math.max(0, Math.min(max, nextIndex));
    carousel.classList.add('is-manual');
    carousel.style.setProperty('--choice-slide-index', String(STATE.heroIndex));
    const track = carousel.querySelector('.choice-visual-track');
    if (track) track.style.transform = `translateX(-${STATE.heroIndex * 33.3333}%)`;
    carousel.querySelectorAll('[data-choice-slide-dot]').forEach((dot, index) => {
      dot.classList.toggle('active', index === STATE.heroIndex);
    });
  };
  carousel.querySelectorAll('[data-choice-slide-dot]').forEach(dot => {
    dot.addEventListener('click', () => setIndex(Number(dot.dataset.choiceSlideDot) || 0));
  });
  carousel.addEventListener('touchstart', (event) => {
    startX = event.touches[0]?.clientX || 0;
  }, { passive: true });
  carousel.addEventListener('touchend', (event) => {
    if (!startX) return;
    const endX = event.changedTouches[0]?.clientX || startX;
    const delta = endX - startX;
    startX = 0;
    if (Math.abs(delta) < 38) return;
    setIndex(STATE.heroIndex + (delta < 0 ? 1 : -1));
  }, { passive: true });
}

function bindChoiceReflectionForm(root) {
  const form = $('#choice-reflection-form', root);
  if (!form) return;
  form.querySelectorAll('[data-reflection-intent]').forEach(button => {
    button.addEventListener('click', () => {
      form.elements.choiceType.value = button.dataset.reflectionIntent || 'resisted';
      form.querySelectorAll('[data-reflection-intent]').forEach(row => row.classList.toggle('active', row === button));
    });
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    try {
      if (submit) submit.disabled = true;
      await saveChoiceReflection(form);
      STATE.reflectionTarget = null;
      STATE.segment = 'bank';
      localStorage.setItem('budget.planSegment', 'bank');
      showToast('감각뱅크에 적립했어요.', 1300, 'success');
      await loadCartItems();
    } catch (err) {
      showToast(err.message || '회고 저장 실패', 2200, 'error');
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

async function saveChoiceReflection(form) {
  const fd = new FormData(form);
  const kind = form.dataset.visualKind === 'pact' || form.dataset.pactId ? 'pact' : 'item';
  const title = String(fd.get('title') || '').trim() || '선택 회고';
  const note = String(fd.get('note') || '').trim();
  const savedAmount = numberFromInput(fd.get('savedAmount'));
  const savedKcal = numberFromInput(fd.get('savedKcal'));
  const choiceType = String(fd.get('choiceType') || 'resisted');
  const choiceLabel = {
    resisted: '참았음',
    postponed: '미뤘음',
    substituted: '대체',
    pact_broken: '깨짐 회고',
  }[choiceType] || '참았음';

  if (kind === 'pact') {
    const pactId = form.dataset.pactId;
    const pact = STATE.pacts.find(row => row.id === pactId);
    if (!pact) throw new Error('약속을 다시 불러와주세요.');
    await breakPact(pactId, note);
    return;
  }

  const itemId = form.dataset.itemId;
  const item = STATE.items.find(row => row.id === itemId);
  if (!item) throw new Error('선택을 다시 불러와주세요.');
  await saveMindbankEntry({
    cartItemId: itemId,
    urgeWhat: title,
    urgePrice: itemDecisionTotal(item),
    desireType: isRecipeItem(item) ? 'recipe' : 'cart_item',
    choiceType,
    choiceTitle: `${choiceLabel}: ${title}`,
    choiceDesc: note || '카드에서 참거나 미룬 선택을 감각뱅크에 남겼습니다.',
    savedAmount,
    savedKcal,
    badges: [choiceLabel, categoryName(item.kind)],
    category: categoryName(item.kind),
    occurredAt: new Date(),
  });
  if (choiceType !== 'postponed') await updateCartItem(itemId, { status: 'archived' });
}

function applyPactExample(example) {
  const form = $('#pact-form');
  const details = form?.closest('details');
  if (!form) return;
  if (details) details.open = true;
  const presets = {
    shoes: {
      title: '70kg 되면 러닝화 사기',
      category: 'purchase',
      cost: '120000',
      triggerType: 'measure',
      measureMetric: '체중',
      op: '<=',
      value: '70',
      unit: 'kg',
      message: '체중 조건을 채운 뒤 필요한 운동화인지 다시 판단한다.',
    },
    travel: {
      title: '2년에 한 번 일본 여행',
      category: 'experience',
      cost: '1500000',
      triggerType: 'savings',
      targetAmount: '1500000',
      currentAmount: '0',
      message: '여행비를 모은 뒤 죄책감 없이 다녀온다.',
    },
    wine: {
      title: '30일 절주 후 좋은 와인 1병',
      category: 'restraint',
      cost: '80000',
      triggerType: 'streak',
      streakMetric: '절주',
      count: '30',
      currentCount: '0',
      message: '참는 것이 아니라 더 좋은 한 병으로 보상한다.',
    },
  };
  const preset = presets[example];
  if (!preset) return;
  Object.entries(preset).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field instanceof RadioNodeList) {
      const values = Array.isArray(value) ? value : [value];
      Array.from(field).forEach(input => {
        input.checked = values.includes(input.value);
      });
    } else {
      field.value = value;
    }
  });
  form.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  showToast('예시를 입력했어요. 조건만 조정해서 저장하세요.', 1600, 'success');
}

function bindCartForm(sharedDraft) {
  const forms = [
    ...document.querySelectorAll('[data-choice-capture-form]'),
    ...document.querySelectorAll('#cart-add-form'),
  ].filter((form, index, list) => form && list.indexOf(form) === index);
  forms.forEach(form => bindSingleCartForm(form, sharedDraft));
}

function bindSingleCartForm(form, sharedDraft) {
  if (!form || form.dataset.captureBound) return;
  form.dataset.captureBound = '1';
  const captureInput = form.elements.url;
  let pasteTimer = null;
  const submitSoon = () => {
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => {
      if (String(captureInput?.value || '').trim()) form.requestSubmit();
    }, 120);
  };
  captureInput?.addEventListener('paste', submitSoon);
  form.elements.type?.addEventListener('change', () => {
    const isRecipe = form.elements.type.value === 'recipe';
    form.elements.kind.value = isRecipe ? 'eat' : (form.elements.kind.value || 'other');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.submitting === '1') return;
    const submit = form.querySelector('button[type="submit"]');
    try {
      form.dataset.submitting = '1';
      if (submit) {
        submit.disabled = true;
        submit.textContent = '담는 중';
      }
      const rawCapture = String(new FormData(form).get('url') || '').trim();
      if (!rawCapture) return;
      await previewCartLink(form);
      const fd = new FormData(form);
      const inferredType = fd.get('type') || inferCaptureType(rawCapture);
      const payload = capturePayloadFromFormData(fd);
      const siteImageCandidates = parseSiteImageCandidates(fd.get('siteImagesJson'));
      const itemId = await saveCartItem(payload);
      form.reset();
      closeCaptureSheet();
      if (sharedDraft) clearShareParams();
      STATE.segment = inferredType === 'recipe' ? 'recipe' : 'want';
      showToast(inferredType === 'recipe' ? '레시피함에 담았어요.' : '사고픈 것에 담았어요.', 1300, 'success');
      await loadCartItems();
      if (siteImageCandidates.length > 1) {
        const key = `item:${itemId}`;
        STATE.visualCandidates[key] = siteImageCandidates.slice(0, 6);
        STATE.visualCandidateSources[key] = '사이트 대표 이미지';
        STATE.visualSearchQueries[key] = domainFromUrl(payload.url) || payload.title;
        openChoiceVisualPicker({ itemId, kind: 'item' });
        showToast('사이트 대표 이미지 후보를 골라 적용할 수 있어요.', 1800, 'info');
      }
    } catch (err) {
      showToast(err.message || '저장 실패', 2400, 'error');
    } finally {
      form.dataset.submitting = '0';
      if (submit) {
        submit.disabled = false;
        submit.textContent = '확인';
      }
    }
  });
}

async function saveSharedCartDraft(draft) {
  if (!draft) return;
  const inferredType = draft.type || inferCaptureType([draft.title, draft.note, draft.url].filter(Boolean).join('\n'));
  const url = safeExternalUrl(draft.url) || extractFirstUrl(draft.url || draft.note || '');
  const resolvedVisual = await resolveDirectVisualFromUrl(url, draft.title || domainFromUrl(url));
  const recipeSeed = [draft.title, draft.summary, draft.sharedCaption, draft.note, draft.url].filter(Boolean).join('\n');
  const presetRecipePreview = inferredType === 'recipe' ? recipePresetPreviewFromText(recipeSeed, url, resolvedVisual) : null;
  const staticRecipePreview = inferredType === 'recipe'
    ? (await buildStaticRecipePreview(url, recipeSeed, resolvedVisual).catch(() => null)) || presetRecipePreview
    : null;
  const apiRecipePreview = inferredType === 'recipe' ? await fetchRecipePreview(url, { text: draft.sharedCaption, title: draft.title }).catch(() => null) : null;
  const providedImage = safeExternalUrl(draft.imageUrl);
  const imageUrl = resolvedVisual?.provider === 'youtube' ? (resolvedVisual.imageUrl || providedImage || apiRecipePreview?.imageUrl || staticRecipePreview?.imageUrl || '') : (providedImage || apiRecipePreview?.imageUrl || staticRecipePreview?.imageUrl || resolvedVisual?.imageUrl || '');
  const previewIngredients = inferredType === 'recipe' ? (Array.isArray(draft.ingredients) && draft.ingredients.length ? draft.ingredients : (apiRecipePreview?.ingredients?.length ? apiRecipePreview.ingredients : (staticRecipePreview?.ingredients || []))) : [];
  const previewSteps = inferredType === 'recipe' ? (Array.isArray(draft.steps) && draft.steps.length ? draft.steps : (apiRecipePreview?.steps?.length ? apiRecipePreview.steps : (staticRecipePreview?.steps || []))) : [];
  const previewSummary = inferredType === 'recipe' ? (draft.summary || apiRecipePreview?.summary || staticRecipePreview?.summary || '') : '';
  const previewNote = inferredType === 'recipe' ? recipeMemoFromParts({ summary: previewSummary, ingredients: previewIngredients, steps: previewSteps, extra: draft.note || '' }) : (draft.note || '');
  await saveCartItem({
    type: inferredType,
    title: draft.title || apiRecipePreview?.title || staticRecipePreview?.title || domainFromUrl(url) || (inferredType === 'recipe' ? '공유한 레시피' : '공유한 상품'),
    price: numberFromInput(draft.price),
    kind: draft.kind || (inferredType === 'recipe' ? 'eat' : inferKind(`${draft.title || ''} ${draft.note || ''}`)),
    url,
    domain: domainFromUrl(url),
    imageUrl,
    originalImageUrl: imageUrl,
    visualMode: imageUrl ? 'original' : 'generated',
    visualQuery: draft.title || domainFromUrl(url),
    note: previewNote,
    status: 'active',
    source: inferredType === 'recipe' ? (apiRecipePreview?.source || staticRecipePreview?.source || draft.source || sourcePlatformFromUrl(url)) : null,
    ingredients: previewIngredients,
    summary: previewSummary,
    steps: previewSteps,
  });
  STATE.segment = inferredType === 'recipe' ? 'recipe' : 'want';
  showToast(inferredType === 'recipe' ? '공유 레시피를 레시피함에 담았어요.' : '공유 상품을 바로 담았어요.', 1300, 'success');
  await loadCartItems();
}
async function previewCartLink(form = $('#cart-add-form')) {
  const raw = String(form?.elements?.url?.value || '').trim();
  const url = safeExternalUrl(raw) || extractFirstUrl(raw);
  const inferred = inferCaptureType(raw);
  if (form?.elements?.type) form.elements.type.value = inferred;
  if (form?.elements?.kind) form.elements.kind.value = inferred === 'recipe' ? 'eat' : inferKind(raw);
  if (form?.elements?.sourcePlatform) form.elements.sourcePlatform.value = sourcePlatformFromUrl(url).platform;
  const previewEl = $('#cart-link-preview');
  const button = form.querySelector('.cart-preview-btn');
  if (!url) {
    fillIfEmpty(form.elements.title, cleanSharedTitle(raw, '', 0));
    if (previewEl && raw) {
      previewEl.classList.remove('hidden');
      previewEl.innerHTML = '<div><strong>공유텍스트로 인식</strong><span>제목과 메모를 직접 보완해서 저장하세요.</span></div>';
    }
    return;
  }
  const quickVisual = await resolveDirectVisualFromUrl(url, cleanSharedTitle(raw, url, 0) || inferTitleFromUrl(url));
  let staticRecipePreview = null;
  if (quickVisual) {
    fillIfEmpty(form.elements.title, quickVisual.title);
    if (form.elements.imageUrl) form.elements.imageUrl.value = quickVisual.imageUrl;
    if (previewEl) { previewEl.classList.remove('hidden'); previewEl.innerHTML = previewHtml({ ...quickVisual, type: inferred }); }
    if (inferred === 'recipe') {
      staticRecipePreview = (await buildStaticRecipePreview(url, raw, quickVisual).catch(() => null))
        || recipePresetPreviewFromText(raw, url, quickVisual);
      if (staticRecipePreview) {
        applyRecipePreviewToForm(form, staticRecipePreview);
        if (previewEl) previewEl.innerHTML = previewHtml({ ...staticRecipePreview, type: 'recipe' });
      }
    }
    if (quickVisual.provider !== 'youtube' || !recipePreviewEndpoint(url)) {
      const hasIngredients = Array.isArray(staticRecipePreview?.ingredients) && staticRecipePreview.ingredients.length > 0;
      showToast(
        quickVisual.provider === 'youtube'
          ? (hasIngredients ? 'Shorts 제목으로 재료 후보를 담았어요.' : 'YouTube 대표 이미지를 담았어요.')
          : '이미지 주소를 후보 썸네일로 담았어요.',
        1400,
        hasIngredients ? 'success' : 'warning'
      );
      return;
    }
  }
  if (previewEl && !quickVisual) {
    previewEl.classList.remove('hidden');
    previewEl.innerHTML = inferred === 'recipe'
      ? '<div><strong>영상 링크 확인 중</strong><span>제목과 썸네일을 찾고 있어요. 재료는 직접 입력할 수 있습니다.</span></div>'
      : '<div><strong>링크 정보 확인 중</strong><span>상품 페이지에서 제목, 가격, 이미지를 찾고 있어요.</span></div>';
  }
  if (button) button.disabled = true;
  try {
    if (inferred === 'recipe') {
      const endpoint = recipePreviewEndpoint(url);
      if (!endpoint) throw apiUnavailableError();
      const response = await fetch(endpoint);
      const data = await readJsonResponse(response);
      if (!response.ok || !data.ok) {
        fillIfEmpty(form.elements.title, data.title || inferTitleFromUrl(url) || domainFromUrl(url));
        const message = data.warning || data.error || '영상에서 재료를 자동 추출하지 못했어요.';
        if (quickVisual) { showToast('YouTube 대표 이미지만 담았어요.', 1600, 'warning'); return; }
        if (previewEl) previewEl.innerHTML = `<div><strong>레시피 자동정리 불가</strong><span>${escHtml(message)}</span></div>`;
        showToast(message, 2400, 'warning');
        return;
      }
      const previewData = quickVisual ? { ...data, imageUrl: safeExternalUrl(data.imageUrl) || quickVisual.imageUrl } : data;
      applyRecipePreviewToForm(form, previewData);
      if (previewEl) previewEl.innerHTML = previewHtml({ ...previewData, type: 'recipe' });
      const message = data.transcriptAvailable ? '자막을 읽어서 재료와 순서를 정리했어요.' : data.sharedCaptionAvailable ? '공유 캡션을 읽어서 재료와 순서를 정리했어요.' : '자막 없이 제목/메타데이터 기준으로 정리했어요.';
      showToast(message, 1600, data.transcriptAvailable || data.sharedCaptionAvailable ? 'success' : 'warning');
      return;
    }
    const endpoint = productPreviewEndpoint(url);
    if (!endpoint) throw apiUnavailableError();
    const response = await fetch(endpoint);
    const data = await readJsonResponse(response);
    if (!response.ok || !data.ok) {
      fillIfEmpty(form.elements.title, data.title || inferTitleFromUrl(url) || domainFromUrl(url));
      const message = (data.warning || data.error)
        || (data.blocked ? '쇼핑몰이 자동 읽기를 막았어요. 링크만 저장할 수 있습니다.' : '상품 정보를 자동으로 찾지 못했어요.');
      const siteCandidates = await fillSiteImagePreview(form, url, previewEl);
      if (siteCandidates.length) {
        showToast('사이트 대표 이미지를 찾았어요. 저장 후 후보를 고를 수 있습니다.', 1800, 'success');
        return;
      }
      if (previewEl) previewEl.innerHTML = `<div><strong>자동 입력 불가</strong><span>${escHtml(message)}</span></div>`;
      showToast(message, 2200, 'warning');
      return;
    }
    fillIfEmpty(form.elements.title, data.title);
    fillIfEmpty(form.elements.price, inferred === 'simple' && data.price ? String(data.price) : '');
    if (form.elements.imageUrl) form.elements.imageUrl.value = data.imageUrl || '';
    if (previewEl) previewEl.innerHTML = previewHtml({ ...data, type: inferred });
    showToast(inferred === 'recipe' ? '영상 후보를 채웠어요.' : '상품 정보를 채웠어요.', 1200, 'success');
  } catch (err) {
    fillIfEmpty(form.elements.title, inferTitleFromUrl(url) || domainFromUrl(url));
    if (quickVisual?.provider === 'youtube') { showToast('YouTube 대표 이미지만 담았어요.', 1600, 'warning'); return; }
    const siteCandidates = await fillSiteImagePreview(form, url, previewEl);
    if (siteCandidates.length) {
      showToast('사이트 대표 이미지를 찾았어요. 저장 후 후보를 고를 수 있습니다.', 1800, 'success');
      return;
    }
    const message = err.code === 'API_UNAVAILABLE'
      ? '미리보기 서버에 닿지 못했어요. 링크만 저장할 수 있습니다.'
      : (err.message || '상품 정보 불러오기 실패');
    if (previewEl) previewEl.innerHTML = `<div><strong>자동 입력 불가</strong><span>${escHtml(message)}</span></div>`;
    showToast(message, 2200, 'warning');
  } finally {
    if (button) button.disabled = false;
  }
}

async function updateItemStatus(itemId, status) {
  const nextStatus = status === 'bought' ? 'bought' : 'active';
  await updateCartItem(itemId, { status: nextStatus });
  STATE.filter = nextStatus === 'bought' ? 'bought' : 'all';
  showToast(nextStatus === 'bought' ? '구매완료 목록으로 이동했어요.' : '대기 목록으로 복구했어요.', 1300, 'success');
  await loadCartItems();
}

async function removeCartItem(itemId) {
  await deleteCartItem(itemId);
  showToast('삭제했어요.', 1200, 'success');
  await loadCartItems();
}

async function removePact(pactId) {
  await deletePact(pactId);
  showToast('조건 슬롯을 삭제했어요.', 1200, 'success');
  await loadCartItems();
}

function cartCategoryOptions(selected) {
  const categories = STATE.categories.length ? STATE.categories : FALLBACK_CART_CATEGORIES;
  const selectedId = normalizedKind(selected || 'other');
  return categories.map(cat => `
    <option value="${escAttr(cat.id)}" ${cat.id === selectedId ? 'selected' : ''}>
      ${escHtml(`${cat.emoji || ''} ${cat.name || ''}`.trim())}
    </option>
  `).join('');
}

function mergeCategoriesWithItems(categories, items) {
  const map = new Map((categories.length ? categories : FALLBACK_CART_CATEGORIES).map(cat => [cat.id, cat]));
  for (const item of items) {
    const id = normalizedKind(item.kind);
    if (!map.has(id)) map.set(id, { id, name: LEGACY_CATEGORY_LABELS[id] || id || '기타', emoji: '□', order: 999 });
  }
  if (!map.has('other')) map.set('other', { id: 'other', name: '기타', emoji: '□', order: 999 });
  return [...map.values()].sort((a, b) => (a.order || 99) - (b.order || 99) || String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
}

function normalizedKind(kind) {
  const value = String(kind || 'other').trim();
  if (!value || value === 'buy') return 'other';
  return value;
}

function categoryName(kind) {
  const id = normalizedKind(kind);
  const category = STATE.categories.find(cat => cat.id === id);
  return category ? `${category.emoji || ''} ${category.name}`.trim() : (LEGACY_CATEGORY_LABELS[id] || '기타');
}

function ageDays(item) {
  const created = item?.createdAt;
  const ms = created?.toMillis ? created.toMillis() : (created ? new Date(created).getTime() : 0);
  if (!ms || Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}

function consumeSharedCartDraft() {
  const params = new URLSearchParams(window.location.search);
  const isShare = params.get('shareTarget') === 'cart'
    || params.has('title')
    || params.has('text')
    || params.has('url');
  if (!isShare) return null;

  const rawTitle = String(params.get('title') || '').trim();
  const rawText = String(params.get('text') || '').trim();
  const rawUrl = String(params.get('url') || '').trim();
  const directImage = String(params.get('imageUrl') || params.get('image') || '').trim();
  const directPriceRaw = String(params.get('price') || '').trim();
  const directPrice = directPriceRaw ? Number(directPriceRaw.replace(/[^\d]/g, '')) || 0 : 0;
  const source = [rawTitle, rawText, rawUrl].filter(Boolean).join('\n');
  const url = rawUrl || extractFirstUrl(source);
  const price = directPrice || extractPrice(source);
  const type = inferCaptureType(source);
  const title = cleanSharedTitle(rawTitle || rawText, url, price);
  const draft = {
    type,
    title: title || domainFromUrl(url) || (type === 'recipe' ? '공유한 레시피' : '공유한 상품'),
    url,
    price,
    domain: domainFromUrl(url),
    imageUrl: safeExternalUrl(directImage),
    kind: type === 'recipe' ? 'eat' : inferKind(source),
    note: rawText && rawText !== title ? compactSharedNote(rawText, url) : '',
    sharedCaption: type === 'recipe' ? rawText.slice(0, 8000) : '',
    source: type === 'recipe' ? sourcePlatformFromUrl(url) : null,
  };
  clearShareParams();
  return draft;
}

function clearShareParams() {
  const url = new URL(window.location.href);
  ['shareTarget', 'title', 'text', 'url', 'imageUrl', 'image', 'price'].forEach(key => url.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function escAttr(value) {
  return escHtml(String(value || ''));
}

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

window.cartPreviewCurrentLink = () => previewCartLink();

function cartExplainBookmarklet(event) {
  event.preventDefault();
  showToast('이 버튼은 앱에서 누르는 게 아니라 북마크바로 끌어 설치하는 용도예요.', 2200, 'info');
}

async function copyCartBookmarklet() {
  try {
    await navigator.clipboard.writeText(cartBookmarkletHref());
    showToast('북마클릿 스크립트를 복사했어요. 북마크 URL에 붙여넣으세요.', 2200, 'success');
  } catch {
    showToast('복사가 막혔어요. 버튼을 북마크바로 드래그해 설치하세요.', 2400, 'warning');
  }
}

window.cartExplainBookmarklet = cartExplainBookmarklet;
window.copyCartBookmarklet = copyCartBookmarklet;
