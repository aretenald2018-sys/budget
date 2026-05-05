// ================================================================
// render-cart.js — wish + recipe decision board
// ================================================================

import {
  listCartItems, saveCartItem, updateCartItem, deleteCartItem,
  listCartCategories, saveCartCategory, updateCartCategory, deleteCartCategory,
  listPacts, savePact, updatePact, deletePact,
  listMindbankEntries, saveMindbankEntry, listUrges, saveTransaction,
} from './data.js';
import { fmtKRW, relTime } from './utils/format.js';
import { normalizeDate, summarizeMindbank, weekdayPattern } from './utils/mindbank.js?v=20260504-mockup-complete';
import { $, escHtml } from './utils/dom.js';
import { showToast } from './utils/toast.js';
import { hasServerApi } from './utils/runtime.js?v=20260505-github-pages';

const STATE = {
  segment: localStorage.getItem('budget.planSegment') || 'want',
  filter: 'all',
  pactFilter: 'active',
  bankRange: localStorage.getItem('budget.choiceBankRange') || 'biweek',
  heroIndex: 0,
  actionSheetTarget: null,
  reflectionTarget: null,
  visualPickerItemId: null,
  visualPickerPactId: null,
  visualSearchQueries: {},
  visualCandidates: {},
  items: [],
  pacts: [],
  categories: [],
  mindbankEntries: [],
  urges: [],
};

const LEGACY_CATEGORY_LABELS = {
  buy: '기타',
  eat: '식재료',
  wear: '의류',
  wine: '와인',
  home: '생활',
  other: '기타',
};

const FALLBACK_CART_CATEGORIES = [
  { id: 'wear', name: '의류', emoji: '👕' },
  { id: 'eat', name: '식재료', emoji: '🥬' },
  { id: 'wine', name: '와인', emoji: '🍷' },
  { id: 'home', name: '생활', emoji: '🧺' },
  { id: 'other', name: '기타', emoji: '□' },
];

export async function renderCart() {
  const root = $('#tab-cart');
  const sharedDraft = consumeSharedCartDraft();
  STATE.segment = sharedDraft?.type === 'recipe' ? 'do' : (localStorage.getItem('budget.planSegment') || STATE.segment || 'want');
  if (!['want', 'do', 'bank'].includes(STATE.segment)) STATE.segment = 'want';
  STATE.categories = await listCartCategories().catch(() => STATE.categories.length ? STATE.categories : FALLBACK_CART_CATEGORIES);
  root.innerHTML = `
    <div class="cart-board-shell subplan-shell choice-os-shell">
      <div id="cart-board-body"><div class="empty-state"><div class="loading-spinner"></div></div></div>
      <div id="choice-overlay-root"></div>
      <div id="cart-source-sheet" class="cart-source-sheet hidden"></div>
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

async function loadCartItems() {
  const [items, categories, pacts, mindbankEntries, urges] = await Promise.all([
    listCartItems({ max: 140 }),
    listCartCategories(),
    listPacts({ max: 120 }).catch(() => []),
    listMindbankEntries({ max: 120 }).catch(() => []),
    listUrges({ max: 120 }).catch(() => []),
  ]);
  STATE.items = items;
  STATE.pacts = pacts;
  STATE.mindbankEntries = mindbankEntries;
  STATE.urges = urges;
  STATE.categories = mergeCategoriesWithItems(categories, items);
  const body = $('#cart-board-body');
  body.innerHTML = cartBoard(items, STATE.categories);
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
        ${STATE.segment === 'bank' ? '' : `
          ${choiceInlineCaptureForm()}
        `}
        <div class="choice-feed-tabs">
          ${segmentButton('want', '추천')}
          ${segmentButton('do', '보류함')}
          ${segmentButton('bank', '감각뱅크')}
        </div>
      </div>
      ${STATE.segment === 'want' ? choiceVisualCarousel(featured) : ''}
      ${STATE.segment === 'want' ? choicePromoRail(rail) : ''}
      ${STATE.segment === 'bank'
        ? choiceBankFeed({ mindbank, entries: STATE.mindbankEntries, urges: STATE.urges, pacts: STATE.pacts })
        : STATE.segment === 'do'
          ? choiceHoldFeed({ simple, recipes, pacts, pactStats })
          : choiceTodayFeed({ simple, recipes, pacts, mindbank, bought })}
    </div>
  `;
}

function choiceInlineCaptureForm() {
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
      <textarea name="ingredientsText" hidden></textarea>
      <textarea name="stepsText" hidden></textarea>
    </form>
  `;
}

function segmentButton(id, label, readyCount = 0) {
  return `
    <button type="button" class="${STATE.segment === id ? 'active' : ''}" data-subplan-segment="${id}">
      ${escHtml(label)}${readyCount ? '<span class="ready-dot"></span>' : ''}
    </button>
  `;
}

function choiceFeaturedSlides({ simple = [], recipes = [], pacts = [] }) {
  const rows = [
    ...simple.slice(0, 3).map(item => choiceCardModelFromItem(item)),
    ...recipes.slice(0, 2).map(item => choiceCardModelFromItem(item)),
    ...pacts.slice(0, 2).map(item => choiceCardModelFromPact(item)),
  ].filter(Boolean);
  if (rows.length >= 3) return rows.slice(0, 3);
  return [
    ...rows,
    {
      title: '이미지로 담아두고, 선택은 천천히',
      meta: '파싱 실패 시에도 상품처럼 보이는 비주얼 카드를 만듭니다.',
      badge: '이미지 보류',
      kind: 'fashion',
      progressLabel: '기본 기다림',
      progressValue: '24h',
      progressPct: 62,
    },
    {
      title: '저장한 레시피가 루틴 퀘스트로',
      meta: '숏츠 썸네일이 없으면 음식 키워드 기반 비주얼을 붙입니다.',
      badge: '레시피',
      kind: 'food',
      progressLabel: '조건',
      progressValue: '목요일',
      progressPct: 100,
    },
    {
      title: '목표까지 남은 거리를 게이지로',
      meta: '예산, 몸무게, 날짜, 장소 조건을 한눈에 봅니다.',
      badge: '조건 84%',
      kind: 'sports',
      progressLabel: '예산',
      progressValue: '84%',
      progressPct: 84,
    },
  ].slice(0, 3);
}

function choiceVisualCarousel(rows) {
  const safeRows = rows.slice(0, 3);
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

function choiceTodayFeed({ simple = [], recipes = [], pacts = [], mindbank, bought = [] }) {
  const readyPacts = pacts.filter(p => effectivePactStatus(p) === 'ready');
  const products = [
    ...readyPacts.map(choiceCardModelFromPact),
    ...recipes.slice(0, 3).map(choiceCardModelFromItem),
    ...simple.slice(0, 6).map(choiceCardModelFromItem),
  ].filter(Boolean);
  const fallbackProducts = [
    ...simple.map(choiceCardModelFromItem),
    ...recipes.map(choiceCardModelFromItem),
    ...pacts.map(choiceCardModelFromPact),
  ].filter(Boolean);
  const visibleProducts = products.length ? products.slice(0, 6) : fallbackProducts.slice(0, 6);
  return `
    <section class="choice-feed-section">
      <div class="choice-section-head"><h2>오늘 열린 선택</h2><span>${visibleProducts.length || 0}개</span></div>
      ${visibleProducts.length ? `<div class="choice-product-grid">${visibleProducts.map(choiceProductCard).join('')}</div>` : choiceEmptyVisual()}
    </section>
  `;
}

function choiceHoldFeed({ simple = [], recipes = [], pacts = [], pactStats }) {
  const rows = [
    ...simple.map(choiceCardModelFromItem),
    ...recipes.map(choiceCardModelFromItem),
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
        <em>5/10 · 02:18 남음</em>
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

function choiceBankCollections(entries = []) {
  const wineEntries = entries.filter(isWineBankEntry);
  const moneyEntries = entries.filter(entry => Number(entry.savedAmount) > 0);
  const kcalEntries = entries.filter(entry => Number(entry.savedKcal) > 0);
  return `
    <div class="choice-bank-collections">
      <article>
        <span>좋은 선택</span>
        <strong>${entries.length}건</strong>
        <small>넘김, 대체, 실현, 보류 연장이 한 기록으로 쌓입니다.</small>
      </article>
      <article>
        <span>와인셀러</span>
        <strong>${wineEntries.length}건</strong>
        <small>와인/술 관련 선택만 따로 보는 하위 컬렉션입니다.</small>
      </article>
      <article>
        <span>돈/열량</span>
        <strong>${moneyEntries.length + kcalEntries.length}건</strong>
        <small>금액과 kcal가 있는 기록을 감각 지표로 모읍니다.</small>
      </article>
    </div>
  `;
}

function isWineBankEntry(entry = {}) {
  const text = [
    entry.choiceTitle,
    entry.urgeWhat,
    entry.category,
    ...(Array.isArray(entry.badges) ? entry.badges : []),
  ].filter(Boolean).join(' ').toLowerCase();
  return /와인|술|wine|alcohol|drink/.test(text);
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
    badge: hasConditions ? (conditionStats.ready ? '열림' : conditionSummary.badge) : recipe ? '루틴' : (progress.progressPct >= 100 ? '판단' : '보류'),
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
    badge: status === 'ready' ? '열림' : (conditionSummary?.badge || (conditionStats.total > 1 ? '퀘스트' : triggerLabelShort(pact.trigger?.type))),
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

function choiceDisplayImageUrl(item, originalImageUrl = '', autoCandidate = null) {
  const visualMode = item?.visualMode || 'auto';
  const savedImage = safeExternalUrl(item?.imageUrl || originalImageUrl);
  if (visualMode === 'custom' || visualMode === 'stock' || visualMode === 'original') {
    return safeExternalUrl(savedImage || autoCandidate?.url);
  }
  return safeExternalUrl(savedImage || autoCandidate?.url);
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
  return `
    <article class="choice-product-card choice-musinsa-card ${ready ? 'ready' : ''}">
      <div class="choice-product-image" data-cart-action="open-detail" ${targetAttrs}>
        ${choiceVisualMarkup(row, 'card')}
        <span class="choice-product-badge">${escHtml(ready ? '열림' : row.badge)}</span>
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
      </div>
    </article>
  `;
}

function choiceCardTargetAttrs(row = {}) {
  if (row.item) return `data-visual-kind="item" data-item-id="${escAttr(row.item.id)}"`;
  if (row.pact) return `data-visual-kind="pact" data-pact-id="${escAttr(row.pact.id)}"`;
  return '';
}

function choiceVisualMarkup(row, size = 'card') {
  const imageUrl = safeExternalUrl(row?.imageUrl);
  const fallback = choiceGeneratedVisual(row?.title || '이미지 후보', row?.kind || 'calm', size);
  if (imageUrl) {
    return `
      <div class="choice-image-stack">
        ${fallback}
        <img src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()">
      </div>
    `;
  }
  return fallback;
}

function choiceDetailVisualMarkup(row, actionAttrs = '') {
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

function choiceGeneratedVisual(title, kind = 'calm', size = 'card') {
  return `
    <div class="choice-generated-visual ${escAttr(kind)} ${escAttr(size)}">
      <b>${escHtml(generatedVisualKeyword(title))}</b>
    </div>
  `;
}

function generatedVisualKeyword(title) {
  const clean = String(title || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts.slice(0, 3).join(' ') || 'Choice';
}

function choiceGauge(label, value, pct) {
  const safePct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  return `
    <div class="choice-metric-line"><small>${escHtml(label || '진행')}</small><b>${escHtml(value || `${safePct}%`)}</b></div>
    <div class="choice-gauge"><i style="width:${safePct}%"></i></div>
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

function choiceEmptyVisual(title = '아직 열린 선택이 없습니다', body = '이미지나 링크를 담으면 이곳이 추천 피드처럼 채워집니다.') {
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
  const isItem = kind === 'item';
  const ownerAttrs = choiceCardTargetAttrs(row);
  const externalUrl = isItem
    ? safeExternalUrl(entity.url)
    : safeExternalUrl(entity.what?.sourceUrl || entity.sourceUrl);
  const done = isItem ? entity.status === 'bought' : entity.status === 'fulfilled';
  return `
    <section class="tds-modal-overlay choice-action-layer open" aria-modal="true" role="dialog">
      <div class="choice-capture-backdrop" data-cart-action="close-action-sheet"></div>
      <div class="choice-action-stack">
        <div class="choice-action-title">${escHtml(row.title || '선택 후보')}</div>
        <div class="choice-action-sheet">
          <button type="button" class="primary" data-cart-action="action-sheet-status" ${ownerAttrs} data-status="${done ? 'active' : 'bought'}"><span class="em">→</span><span>${done ? '되돌림' : '실행함'}</span></button>
          <button type="button" data-cart-action="action-sheet-reflect" ${ownerAttrs}><span class="em">◇</span><span>참았음 / 미뤘음</span></button>
          ${isItem && !isRecipeItem(entity) ? `<button type="button" data-cart-action="action-sheet-condition" ${ownerAttrs}><span class="em">⊕</span><span>조건 추가</span></button>` : ''}
          <button type="button" data-cart-action="open-visual-picker" ${ownerAttrs}><span class="em">□</span><span>이미지 바꾸기</span></button>
          ${externalUrl ? `<a href="${escHtml(externalUrl)}" target="_blank" rel="noreferrer"><span class="em">↗</span><span>원문 페이지</span></a>` : ''}
          <button type="button" data-cart-action="open-detail" ${ownerAttrs}><span class="em">✎</span><span>상세 보기 / 수정</span></button>
          <button type="button" class="danger" data-cart-action="action-sheet-delete" ${ownerAttrs}><span class="em">×</span><span>삭제</span></button>
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
  const stockCandidates = STATE.visualCandidates[key]?.length
    ? STATE.visualCandidates[key]
    : Array.isArray(STATE.visualCandidates[key])
      ? []
      : choiceStockCandidates(querySource, query);
  const currentLabel = choiceVisualSourceLabel(entity, kind);
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
          <label>링크 키워드로 Google 이미지 찾기</label>
          <div>
            <input class="tds-input" name="query" value="${escAttr(query)}" placeholder="예: 일본 여행, 샐러드, 러닝화">
            <button type="submit">무료 이미지 찾기</button>
          </div>
        </form>
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
          <label>이미지 URL 직접 붙여넣기</label>
          <div>
            <input class="tds-input" name="imageUrl" placeholder="https://..." autocomplete="off">
            <button type="submit">적용</button>
          </div>
        </form>
        <div class="choice-visual-subhead">Google 이미지 검색 후보 ${stockCandidates.length}개</div>
        <div class="choice-stock-grid">
          ${stockCandidates.length ? stockCandidates.map(candidate => `
            <button type="button" class="choice-stock-option" data-cart-action="visual-stock" data-visual-kind="${escAttr(kind)}" ${kind === 'item' ? `data-item-id="${escAttr(entity.id)}"` : `data-pact-id="${escAttr(entity.id)}"`} data-image-url="${escAttr(candidate.url)}" data-credit="${escAttr(candidate.credit)}" data-query="${escAttr(candidate.query)}">
              <img src="${escHtml(candidate.url)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('image-failed')">
              <span>${escHtml(candidate.label)}</span>
              <em>${escHtml(candidate.credit)}</em>
            </button>
          `).join('') : '<div class="choice-condition-empty">검색어와 맞는 무료 이미지 후보를 찾지 못했어요.</div>'}
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
  const stockCandidates = STATE.visualCandidates[key]?.length
    ? STATE.visualCandidates[key]
    : Array.isArray(STATE.visualCandidates[key])
      ? []
      : choiceStockCandidates(querySource, query);
  const currentLabel = choiceVisualSourceLabel(entity, kind);
  const ownerAttrs = kind === 'item'
    ? `data-visual-kind="item" data-item-id="${escAttr(entity.id)}"`
    : `data-visual-kind="pact" data-pact-id="${escAttr(entity.id)}"`;
  return `
    <div class="choice-detail-visual-editor" style="${opts.open ? '' : 'display:none'}">
      <div class="choice-detail-visual-head">
        <span>이미지 관리</span>
        <em>현재 ${escHtml(currentLabel)}</em>
      </div>
      <form class="choice-visual-search-form choice-detail-visual-search-form" ${ownerAttrs}>
        <label>링크 키워드로 Google 이미지 찾기</label>
        <div>
          <input class="tds-input" name="query" value="${escAttr(query)}" placeholder="예: 일본 여행, 샐러드, 러닝화">
          <button type="submit">무료 이미지 찾기</button>
        </div>
      </form>
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
        <label>이미지 URL 직접 붙여넣기</label>
        <div>
          <input class="tds-input" name="imageUrl" placeholder="https://..." autocomplete="off">
          <button type="submit">적용</button>
        </div>
      </form>
      <div class="choice-visual-subhead">Google 이미지 검색 후보 ${stockCandidates.length}개</div>
      <div class="choice-stock-grid">
        ${stockCandidates.length ? stockCandidates.map(candidate => `
          <button type="button" class="choice-stock-option" data-choice-detail-action="visual-stock" ${ownerAttrs} data-image-url="${escAttr(candidate.url)}" data-credit="${escAttr(candidate.credit)}" data-query="${escAttr(candidate.query)}">
            <img src="${escHtml(candidate.url)}" alt="" loading="lazy" onerror="this.parentElement.classList.add('image-failed')">
            <span>${escHtml(candidate.label)}</span>
            <em>${escHtml(candidate.credit)}</em>
          </button>
        `).join('') : '<div class="choice-condition-empty">검색어와 맞는 무료 이미지 후보를 찾지 못했어요.</div>'}
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
  if (mode === 'stock') return '무료 사진';
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

function choiceOriginalImageUrl(item) {
  return safeExternalUrl(item?.originalImageUrl)
    || safeExternalUrl(item?.imageUrl)
    || youtubeThumbnailFromUrl(item?.url)
    || '';
}

function choiceVisualSourceText(item, queryText = '') {
  return `${queryText || ''} ${item?.title || ''} ${item?.kind || ''} ${item?.note || ''} ${item?.url || ''}`.toLowerCase();
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

function choiceVisualIntentKey(sourceText) {
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

function choiceImageSearchQuery(item) {
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

function choiceStockCandidates(item, queryText = '') {
  const source = choiceVisualSourceText(item, queryText);
  const query = choiceVisualIntentKey(source);
  const sets = {
    'travel-china': [
      ['베이징 거리', 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=900&q=80'],
      ['상하이 스카이라인', 'https://images.unsplash.com/photo-1545893835-abaa50cbe628?auto=format&fit=crop&w=900&q=80'],
      ['중국 여행 무드', 'https://images.unsplash.com/photo-1510332981392-36692ea3a195?auto=format&fit=crop&w=900&q=80'],
    ],
    'travel-japan': [
      ['교토 산책', 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=80'],
      ['일본 여행', 'https://images.unsplash.com/photo-1528164344705-47542687000d?auto=format&fit=crop&w=900&q=80'],
      ['도시의 밤', 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=900&q=80'],
    ],
    'wellness-stay': [
      ['리조트 라운지', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80'],
      ['스파 휴식', 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80'],
      ['마운틴 스테이', 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80'],
    ],
    salad: [
      ['샐러드 볼', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=80'],
      ['그린 플레이트', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=900&q=80'],
      ['토마토 샐러드', 'https://images.unsplash.com/photo-1568158879083-c42860933ed7?auto=format&fit=crop&w=900&q=80'],
    ],
    'fresh-food': [
      ['피코 데 가요 무드', 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=900&q=80'],
      ['마켓 채소', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80'],
      ['홈 쿠킹', 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80'],
    ],
    'muscle-fit-top': [
      ['머슬핏 티셔츠', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80'],
      ['슬림핏 상의', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80'],
      ['운동 상의', 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=80'],
    ],
    'shirt-top': [
      ['티셔츠 상품', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80'],
      ['상의 디테일', 'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&w=900&q=80'],
      ['기본 셔츠', 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=80'],
    ],
    'pants-shorts': [
      ['팬츠 상품', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=80'],
      ['데일리 팬츠', 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80'],
      ['하프팬츠 후보', 'https://images.unsplash.com/photo-1506629905607-d9d297d5f5f2?auto=format&fit=crop&w=900&q=80'],
    ],
    outerwear: [
      ['아우터 상품', 'https://images.unsplash.com/photo-1520975954732-35dd22299614?auto=format&fit=crop&w=900&q=80'],
      ['자켓 디테일', 'https://images.unsplash.com/photo-1543076447-215ad9ba6923?auto=format&fit=crop&w=900&q=80'],
      ['코트 후보', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80'],
    ],
    activewear: [
      ['운동복 상의', 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&w=900&q=80'],
      ['러닝 팬츠', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=80'],
      ['트레이닝 슈즈', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80'],
    ],
    shoes: [
      ['러닝화 상품', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80'],
      ['스니커즈 디테일', 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80'],
      ['운동화 후보', 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=900&q=80'],
    ],
    fashion: [
      ['티셔츠 상품', 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80'],
      ['팬츠 상품', 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=80'],
      ['스니커즈 상품', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80'],
    ],
    sensory: [
      ['와인 테이블', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=900&q=80'],
      ['저녁 무드', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=900&q=80'],
      ['느린 선택', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80'],
    ],
    lifestyle: [
      ['선택 보드', 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80'],
      ['데일리 오브젝트', 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=900&q=80'],
      ['라이트 무드', 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=80'],
    ],
  };
  return (sets[query] || sets.lifestyle).map(([label, url]) => ({
    label,
    url,
    query,
    credit: 'Unsplash 무료 사진 후보',
  }));
}

function choiceVisualCandidatesMatchIntent(item, queryText = '', candidates = []) {
  if (!Array.isArray(candidates) || !candidates.length) return false;
  const intent = choiceVisualIntentKey(choiceVisualSourceText(item, queryText));
  const keywordMap = {
    'muscle-fit-top': /머슬|슬림|티셔츠|반팔|상의|셔츠|shirt|t-?shirt|tee|top|gym|fitness|workout|apparel|clothing/,
    'wellness-stay': /park\s*roche|파크\s*로쉬|호텔|리조트|숙소|호캉스|스파|웰니스|hotel|resort|stay|spa|wellness|lounge|mountain/,
    'shirt-top': /티셔츠|반팔|긴팔|상의|셔츠|shirt|t-?shirt|tee|top|hood|sweatshirt|apparel|clothing/,
    'pants-shorts': /팬츠|바지|반바지|쇼츠|shorts?|pants?|trousers?|leggings?|joggers?/,
    outerwear: /패딩|다운|점퍼|자켓|재킷|코트|아우터|outer|outerwear|puffer|down|jacket|coat|parka|apparel|clothing/,
    activewear: /액티브|러닝|운동|스포츠|active|running|workout|athletic|sportswear|fitness|shirt|pants|shoes|apparel|clothing/,
    shoes: /러닝화|운동화|스니커즈|신발|shoes?|sneakers?|trainers?|running/,
    fashion: /의류|옷|패션|clothing|apparel|fashion|shirt|pants|shoes|sneakers?/,
  };
  const gate = keywordMap[intent];
  if (!gate) return true;
  return candidates.some(candidate => gate.test(`${candidate.label || ''} ${candidate.title || ''} ${candidate.credit || ''} ${candidate.source || ''}`.toLowerCase()));
}

function choiceLocalCandidatesMatchQuery(queryText = '', candidates = []) {
  const stopWords = new Set(['상품', '사진', '이미지', '후보', '무료', '검색', '추천', 'product', 'photo', 'image']);
  const tokens = String(queryText || '')
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/i)
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !stopWords.has(token));
  if (!tokens.length || !Array.isArray(candidates) || !candidates.length) return false;
  const text = candidates
    .map(candidate => `${candidate.label || ''} ${candidate.title || ''} ${candidate.credit || ''} ${candidate.source || ''}`)
    .join(' ')
    .toLowerCase();
  return tokens.some(token => text.includes(token));
}

function choiceAutoVisualCandidate(item) {
  return choiceStockCandidates(item, choiceImageSearchQuery(item))[0] || null;
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

function rerenderCartBoard() {
  const body = $('#cart-board-body');
  if (!body) return;
  body.innerHTML = cartBoard(STATE.items, STATE.categories);
  bindCartBoardEvents(body);
  refreshChoiceOverlays();
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
        STATE.actionSheetTarget = null;
        refreshChoiceOverlays();
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
      if (action === 'open-condition-sheet') {
        STATE.conditionSheetItemId = itemId;
        refreshChoiceOverlays();
        return;
      }
      if (action === 'action-sheet-delete') {
        STATE.actionSheetTarget = null;
        if (pactId) await removePact(pactId);
        else await removeCartItem(itemId);
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
        STATE.actionSheetTarget = null;
        refreshChoiceOverlays();
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
  if (searchForm) {
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
          button.textContent = '찾는 중';
        }
        await refreshChoiceVisualCandidates(target, query);
      } catch (err) {
        showToast(err.message || '이미지 후보를 찾지 못했어요.', 2200, 'warning');
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = '무료 이미지 찾기';
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
    visualOpen: target.detailPanel === 'visual',
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
          <textarea class="tds-input" name="note" rows="3">${escHtml(item.note || '')}</textarea>
        </div>
      </div>
      ${choiceItemConditionsEditorHtml(item, stats)}
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

function choiceItemConditionsEditorHtml(item, stats = itemConditionStats(item)) {
  const conditions = stats.conditions.length ? stats.conditions : itemConditions(item);
  const ids = conditions.map(condition => condition.id).join(',');
  const progressPct = conditions.length ? Math.round((stats.done / conditions.length) * 100) : 0;
  return `
    <section class="choice-condition-receipt tx-receipt-form">
      <div class="choice-condition-head">
        <span>구매 조건</span>
        <div class="choice-condition-head-meta">
          ${progressPct > 0 ? `<b class="choice-condition-pct">${progressPct}%</b>` : ''}
          <button type="button" class="choice-condition-add-icon" data-condition-add-toggle title="조건 추가">+</button>
        </div>
      </div>
      ${conditions.length > 0 ? `<div class="choice-condition-agg-gauge"><i style="width:${progressPct}%"></i></div>` : ''}
      <input type="hidden" name="conditionIds" value="${escAttr(ids)}">
      <div class="choice-pact-condition-list">
        ${conditions.length > 0
          ? conditions.map(condition => choiceConditionRowHtml(condition, { kind: 'item', id: item.id })).join('')
          : '<div class="choice-condition-empty">+ 버튼으로 첫 조건을 추가하세요</div>'}
      </div>
      <div class="choice-condition-add-form" data-condition-add-form style="display:none;">
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
  const binary = isBinaryConditionType(condition.type);
  const dateLike = condition.type === 'date';
  const targetPlaceholder = condition.type === 'amount' ? '모을 금액' : condition.type === 'diet' ? '1' : '목표';
  const currentPlaceholder = condition.type === 'amount' ? '모은 금액' : condition.type === 'diet' ? '0' : '현재';
  const ownerAttrs = owner.kind === 'item'
    ? `data-item-id="${escAttr(owner.id || '')}"`
    : `data-pact-id="${escAttr(owner.id || '')}"`;
  const deleteAction = owner.kind === 'item' ? 'delete-item-condition' : 'delete-condition';
  const valueLabel = conditionValueLabel(condition);
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
        <div class="tx-receipt-row">
          <span>조건명</span>
          <input class="tds-input" name="conditionLabel:${escAttr(id)}" value="${escAttr(condition.label)}">
        </div>
        <div class="tx-receipt-row">
          <span>종류</span>
          <select class="tds-select" name="conditionType:${escAttr(id)}" data-condition-type-select>${conditionTypeOptions(condition.type)}</select>
        </div>
        <div class="tx-receipt-row condition-date-field">
          <span>도래일</span>
          <input class="tds-input" name="conditionDueDate:${escAttr(id)}" type="date" value="${escAttr(condition.dueDate || '')}">
        </div>
        <div class="tx-receipt-row condition-number-fields">
          <span>현재</span>
          <input class="tds-input" name="conditionCurrent:${escAttr(id)}" inputmode="numeric" value="${condition.current ? String(condition.current) : ''}" placeholder="${escAttr(currentPlaceholder)}">
        </div>
        <div class="tx-receipt-row condition-number-fields">
          <span>목표</span>
          <input class="tds-input" name="conditionTarget:${escAttr(id)}" inputmode="numeric" value="${condition.target ? String(condition.target) : ''}" placeholder="${escAttr(targetPlaceholder)}">
        </div>
        <div class="tx-receipt-row condition-unit-field">
          <span>단위</span>
          <input class="tds-input" name="conditionUnit:${escAttr(id)}" value="${escAttr(condition.unit || (condition.type === 'amount' ? '원' : ''))}">
        </div>
        <div class="tx-receipt-row">
          <span>메모</span>
          <input class="tds-input" name="conditionNote:${escAttr(id)}" value="${escAttr(condition.note || '')}" placeholder="조건의 근거를 짧게 기록">
        </div>
        <div class="tx-shared-row choice-condition-actions">
          <span>조건 관리</span>
          <button type="button" class="choice-pact-condition-remove" data-choice-detail-action="${deleteAction}" ${ownerAttrs} data-condition-id="${escAttr(id)}">삭제</button>
        </div>
        ${binary ? `
          <label class="tx-shared-remember choice-pact-condition-check">
            <input type="checkbox" name="conditionDone:${escAttr(id)}" ${conditionProgress(condition) >= 1 ? 'checked' : ''}>
            ${condition.type === 'diet' ? '다이어트 성공함' : condition.type === 'date' ? '도래/확인됨' : '완료됨'}
          </label>
        ` : ''}
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

function isBinaryConditionType(type) {
  return ['check', 'date', 'diet'].includes(type);
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
          button.textContent = '무료 이미지 찾기';
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
    conditions: itemConditionsFromForm(item, fd),
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

function itemConditionsFromForm(item, fd) {
  const ids = String(fd.get('conditionIds') || '').split(',').map(id => id.trim()).filter(Boolean);
  const conditions = ids
    .map(id => pactConditionFromForm(id, fd))
    .filter(Boolean);
  const next = pactNewConditionFromForm(fd);
  if (next) conditions.push(next);
  if (conditions.length) return conditions;
  return itemConditions(item);
}

function pactConditionsFromForm(pact, fd) {
  const ids = String(fd.get('conditionIds') || '').split(',').map(id => id.trim()).filter(Boolean);
  const conditions = ids
    .map(id => pactConditionFromForm(id, fd))
    .filter(Boolean);
  const next = pactNewConditionFromForm(fd);
  if (next) conditions.push(next);
  if (conditions.length) return conditions;
  return pactConditions(pact);
}

function pactConditionFromForm(id, fd) {
  const type = normalizeChoiceConditionType(fd.get(`conditionType:${id}`));
  const label = String(fd.get(`conditionLabel:${id}`) || '').trim();
  if (!label) return null;
  const done = fd.get(`conditionDone:${id}`) === 'on';
  if (isBinaryConditionType(type)) {
    return {
      id,
      type,
      label,
      current: done ? 1 : 0,
      target: 1,
      unit: '',
      done,
      dueDate: String(fd.get(`conditionDueDate:${id}`) || '').trim(),
      note: String(fd.get(`conditionNote:${id}`) || '').trim(),
    };
  }
  return {
    id,
    type,
    label,
    current: numberFromInput(fd.get(`conditionCurrent:${id}`)),
    target: numberFromInput(fd.get(`conditionTarget:${id}`)),
    unit: String(fd.get(`conditionUnit:${id}`) || (type === 'amount' ? '원' : '')).trim(),
    done,
    note: String(fd.get(`conditionNote:${id}`) || '').trim(),
  };
}

function pactNewConditionFromForm(fd) {
  const label = String(fd.get('newConditionLabel') || '').trim();
  if (!label) return null;
  const type = normalizeChoiceConditionType(fd.get('newConditionType'));
  const done = fd.get('newConditionDone') === 'on';
  const dueDate = String(fd.get('newConditionDueDate') || '').trim();
  if (isBinaryConditionType(type)) {
    return {
      id: makeId('cond'),
      type,
      label,
      current: done ? 1 : 0,
      target: 1,
      unit: '',
      done,
      dueDate,
      note: '',
    };
  }
  const target = numberFromInput(fd.get('newConditionTarget'));
  const current = Math.max(
    numberFromInput(fd.get('newConditionCurrent')),
    done && target ? target : 0,
  );
  return {
    id: makeId('cond'),
    type,
    label,
    current,
    target,
    unit: String(fd.get('newConditionUnit') || (type === 'amount' ? '원' : '')).trim(),
    done,
    note: '',
  };
}

async function refreshChoiceVisualCandidates(target = {}, query, opts = {}) {
  const kind = target.kind === 'pact' || target.pactId ? 'pact' : 'item';
  const entity = kind === 'pact'
    ? STATE.pacts.find(row => row.id === target.pactId)
    : STATE.items.find(row => row.id === target.itemId);
  if (!entity) return;
  const source = kind === 'pact' ? choicePactVisualSeed(entity) : entity;
  const key = `${kind}:${entity.id}`;
  STATE.visualSearchQueries[key] = query;
  const fallbackCandidates = choiceStockCandidates(source, query);
  let candidates = [];
  let provider = '';
  if (shouldFetchRemoteVisualSearch()) {
    try {
      const response = await fetch(visualSearchEndpoint(query), { cache: 'no-store' });
      const data = await readJsonResponse(response);
      provider = data.provider || '';
      if (response.ok && Array.isArray(data.items)) candidates = data.items;
    } catch {
      candidates = [];
    }
  }
  const intent = choiceVisualIntentKey(choiceVisualSourceText(source, query));
  const localOnly = provider !== 'google-images';
  if (!choiceVisualCandidatesMatchIntent(source, query, candidates)) candidates = fallbackCandidates;
  if (localOnly && intent === 'lifestyle' && !choiceLocalCandidatesMatchQuery(query, candidates)) {
    candidates = [];
  }
  STATE.visualCandidates[key] = candidates.slice(0, 3).map(candidate => ({
    label: candidate.label || candidate.title || query,
    url: safeExternalUrl(candidate.url || candidate.imageUrl),
    query,
    credit: candidate.credit || candidate.source || 'Google 이미지 검색',
  })).filter(candidate => candidate.url);
  const count = STATE.visualCandidates[key].length || 0;
  showToast(count ? `Google 이미지 후보 ${count}개를 찾았어요.` : '검색어와 맞는 무료 이미지 후보를 찾지 못했어요.', 1600, count ? 'success' : 'warning');
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

function buySegmentHtml({ items, categories, simple, bought, aged, visibleSimple }) {
  return `
    <div class="cart-filter-rail chips">
      ${filterChip('all', '전체', simple.length)}
      ${filterChip('aged', '숙성됨', aged.filter(item => !isRecipeItem(item)).length)}
      ${categories.map(cat => filterChip(`cat:${cat.id}`, `${cat.emoji || ''} ${cat.name}`.trim(), simple.filter(item => normalizedKind(item.kind) === cat.id).length)).join('')}
      ${filterChip('bought', '완료', bought.filter(item => !isRecipeItem(item)).length)}
    </div>
    ${pactRecommendationInsight(simple)}
    ${categoryManager(categories)}
    <div class="cart-section-head">
      <b>${STATE.filter === 'bought' ? '구매완료' : '사고픈 것'}</b>
      <em>결제 전 한 번 멈춰두는 후보</em>
    </div>
    <section class="cart-card-grid">
      ${visibleSimple.length ? visibleSimple.map(simpleCard).join('') : emptyCartHtml('사고픈 것이 없습니다', '상품 링크나 공유 텍스트를 아래 소계획 도크에 붙여넣으세요.')}
    </section>
  `;
}

function pactRecommendationInsight(items) {
  const candidates = (items || [])
    .filter(item => (item.status || 'active') === 'active' && !isRecipeItem(item) && itemDecisionTotal(item) >= 50000)
    .slice(0, 3);
  if (!candidates.length) return '';
  const total = candidates.reduce((sum, item) => sum + itemDecisionTotal(item), 0);
  return `
    <button type="button" class="insight review pact-recommendation" data-subplan-segment="do">
      <span class="tag pact">약속 추천</span>
      <div class="head">${candidates.length}건은 약속으로 미루는 게 어울려요</div>
      <div class="body">${fmtKRW(total)} 규모의 후보입니다. 감각뱅크나 날짜 조건을 붙여 미래의 나에게 한 번 더 결정권을 넘길 수 있어요.</div>
    </button>
  `;
}

function doSegmentHtml({ recipes, visibleRecipes, unresolved, pactStats }) {
  const visiblePacts = filteredPacts(STATE.pacts);
  return `
    <div class="cart-filter-rail chips">
      ${pactFilterChip('active', '활성', pactStats.active)}
      ${pactFilterChip('ready', '준비됨', pactStats.ready)}
      ${pactFilterChip('fulfilled', '실현', pactStats.fulfilled)}
      ${pactFilterChip('broken', '깨짐', pactStats.broken)}
      ${pactFilterChip('archived', '보관', pactStats.archived)}
      ${filterChip('recipe', '레시피', recipes.length)}
      ${filterChip('unresolved', '주문처 미정', unresolved.length)}
    </div>
    ${pactBreakWarning(STATE.pacts)}
    ${pactComposer()}
    <div class="cart-section-head">
      <b>미래 약속</b>
      <em>하고 싶은 일을 조건과 연결</em>
    </div>
    <section class="pact-card-list">
      ${visiblePacts.length ? visiblePacts.map(pactCard).join('') : emptyPactHtml()}
    </section>
    <div class="cart-section-head simple">
      <b>레시피 계획</b>
      <em>재료별 주문처 연결</em>
    </div>
    <section class="cart-card-grid">
      ${visibleRecipes.length ? visibleRecipes.map(recipeCard).join('') : emptyCartHtml('레시피 계획이 없습니다', 'Shorts, Reels, YouTube 링크를 아래 도크에 붙이면 이곳에 정리됩니다.')}
    </section>
  `;
}

function bankSegmentHtml({ mindbank, entries, urges, pacts }) {
  const pattern = weekdayPattern(urges.length ? urges : entries);
  const fulfilled = pacts.filter(p => p.status === 'fulfilled').length;
  const broken = pacts.filter(p => p.status === 'broken').length;
  return `
    <div class="mb-stat-grid selection-bank-grid">
      <div class="mb-stat"><div class="l">덜어낸 지출</div><div class="v pos">${fmtKRW(mindbank.total).replace('원', '')}</div><div class="sub">감각뱅크 적립</div></div>
      <div class="mb-stat"><div class="l">약속 신뢰도</div><div class="v">${fulfilled}<span style="font-size:13px;color:var(--text-secondary)">/${fulfilled + broken || 0}</span></div><div class="sub">지킨 약속 / 종료 약속</div></div>
    </div>
    <div class="cart-filter-rail chips">
      <button type="button" class="chip active">전체 <span class="count">${entries.length}</span></button>
      <button type="button" class="chip">후보 버림 <span class="count">${entries.filter(e => e.choiceType === 'scheduled').length}</span></button>
      <button type="button" class="chip">욕구 대안 <span class="count">${entries.filter(e => e.choiceType !== 'scheduled').length}</span></button>
      <button type="button" class="chip">약속 지킴 <span class="count">${fulfilled}</span></button>
    </div>
    <div class="section-title"><h3>주간 전환 패턴</h3><button type="button" class="more" data-subplan-segment="bank">감각뱅크 ›</button></div>
    <div class="bars selection-flow-bars">
      ${pattern.map(row => `<div class="bar"><div class="v" style="height:${Math.max(6, row.pct)}%"></div><span class="lbl">${escHtml(row.label)}</span></div>`).join('')}
    </div>
    <div class="section-title"><h3>최근 적립</h3></div>
    ${entries.length ? entries.slice(0, 8).map(bankChoiceCard).join('') : emptyCartHtml('아직 적립된 선택이 없습니다', '홈에서 끌림을 기록하거나 후보를 약속으로 미루면 이곳에 쌓입니다.')}
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

function bankPatternPeakLabel(pattern = []) {
  const peak = pattern.reduce((best, row) => row.count > best.count ? row : best, { label: '', count: 0, pct: 0 });
  return peak.count ? '패턴 발견' : '기록 대기';
}

function bankPatternInsight(pattern = []) {
  const peak = pattern.reduce((best, row) => row.count > best.count ? row : best, { label: '', count: 0, pct: 0 });
  if (!peak.count) {
    return `
      <div class="choice-bank-pattern-insight">
        <strong>아직 패턴을 찾는 중</strong>
        <span>좋은 선택과 욕구 기록이 쌓이면 자주 흔들리는 요일을 보여줍니다.</span>
      </div>
    `;
  }
  return `
    <div class="choice-bank-pattern-insight">
      <strong>${escHtml(peak.label)}에 충동이 가장 많아요</strong>
      <span>최근 기록에서 ${escHtml(peak.label)}에 ${peak.count}건이 몰렸어요. 그 시간대에 미리 대안을 하나 놓아두면 좋아요.</span>
    </div>
  `;
}

function isWithinDays(date, days) {
  if (!date) return false;
  return Date.now() - date.getTime() <= days * 86400000;
}

function filterBankRowsByRange(rows = [], range = 'biweek') {
  if (range === 'all') return rows;
  const days = range === '30d' ? 30 : 14;
  return rows.filter(row => isWithinDays(normalizeDate(row.occurredAt) || normalizeDate(row.createdAt), days));
}

function pactBreakWarning(pacts) {
  const closed = (pacts || []).filter(p => ['fulfilled', 'broken'].includes(p.status));
  const broken = closed.filter(p => p.status === 'broken');
  if (closed.length < 3 || broken.length / closed.length < 0.45) return '';
  return `
    <div class="insight warn pact-break-warning">
      <span class="tag">약속 조정</span>
      <div class="head">최근 약속이 자주 깨지고 있어요</div>
      <div class="body">새 약속은 비용을 낮추거나 날짜를 늦추고, 조건은 하나만 붙이는 편이 오래 갑니다. 깨짐은 실패가 아니라 다음 조건을 조정하는 데이터입니다.</div>
    </div>
  `;
}

function filteredItems(items, categories) {
  const active = items.filter(item => (item.status || 'active') === 'active');
  if (STATE.filter === 'bought') return items.filter(item => item.status === 'bought' && !isRecipeItem(item));
  if (STATE.filter === 'recipe') return active.filter(isRecipeItem);
  if (STATE.filter === 'unresolved') return active.filter(hasUnresolvedIngredients);
  if (STATE.filter === 'aged') return active.filter(item => !isRecipeItem(item) && ageDays(item) >= 14);
  if (STATE.filter.startsWith('cat:')) {
    const id = STATE.filter.slice(4);
    return active.filter(item => !isRecipeItem(item) && normalizedKind(item.kind) === id);
  }
  return STATE.segment === 'do'
    ? active.filter(isRecipeItem)
    : active.filter(item => !isRecipeItem(item));
}

function filterChip(id, label, count) {
  return `
    <button type="button" class="chip ${STATE.filter === id ? 'active' : ''}" data-cart-filter="${escAttr(id)}">
      <span>${escHtml(label)}</span>
      <span class="count">${count}</span>
    </button>
  `;
}

function pactFilterChip(id, label, count) {
  return `
    <button type="button" class="chip ${STATE.pactFilter === id ? 'active' : ''}" data-pact-filter="${escAttr(id)}">
      <span>${escHtml(label)}</span>
      <span class="count">${count}</span>
    </button>
  `;
}

function recipeCard(item) {
  const ingredients = normalizedIngredients(item);
  const decided = ingredients.filter(isIngredientDecided);
  const total = itemDecisionTotal(item);
  const pct = ingredients.length ? Math.round(decided.length / ingredients.length * 100) : 0;
  const platform = sourcePlatform(item);
  const externalUrl = safeExternalUrl(item.url);
  return `
    <article class="cart-recipe-card ${item.status === 'bought' ? 'bought' : ''}">
      <div class="cart-recipe-head">
        <div class="cart-recipe-thumb">
          ${safeExternalUrl(item.imageUrl) ? `<img src="${escHtml(item.imageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : '<span>🥢</span>'}
          <span class="cart-source-badge ${platform.className}">${escHtml(platform.label)}</span>
          ${externalUrl ? `<a class="cart-play-dot" href="${escHtml(externalUrl)}" target="_blank" rel="noreferrer">▶</a>` : '<span class="cart-play-dot">▶</span>'}
        </div>
        <div class="cart-recipe-meta">
          <div class="cart-recipe-tag">레시피<span></span><em>${escHtml(item.domain || domainFromUrl(item.url) || platform.name)}</em></div>
          <h3>${escHtml(item.title || '이름 없는 레시피')}</h3>
          <p>${ingredients.length ? escHtml(ingredients.slice(0, 3).map(x => x.name).join(' · ') + (ingredients.length > 3 ? ` 외 ${ingredients.length - 3}개 재료` : '')) : '재료를 직접 추가해 주세요'}</p>
        </div>
      </div>
        <div class="cart-recipe-progress">
        <span><b>${decided.length}/${ingredients.length}</b> 재료 주문처 결정</span>
        <i><b style="width:${pct}%"></b></i>
        <strong>${total ? fmtKRW(total) : '가격 미정'}</strong>
      </div>
      <div class="cart-ingredients">
        ${ingredients.length ? ingredients.map(ing => ingredientRow(item, ing)).join('') : emptyIngredientRow(item)}
      </div>
      ${recipeStepsHtml(item)}
      <div class="cart-recipe-actions">
        <button type="button" class="primary" data-cart-action="open-first-unresolved" data-item-id="${escAttr(item.id)}">선택한 ${decided.length}개 일괄 주문</button>
        ${externalUrl ? `<a class="ghost" href="${escHtml(externalUrl)}" target="_blank" rel="noreferrer">영상</a>` : ''}
        <button type="button" class="ghost" data-cart-action="add-ingredient" data-item-id="${escAttr(item.id)}">재료 추가</button>
        ${item.status === 'bought'
          ? `<button type="button" class="iconbtn" data-cart-action="status" data-item-id="${escAttr(item.id)}" data-status="active">↩</button>`
          : `<button type="button" class="iconbtn" data-cart-action="status" data-item-id="${escAttr(item.id)}" data-status="bought">✓</button>`}
        <button type="button" class="iconbtn danger-text" data-cart-action="delete" data-item-id="${escAttr(item.id)}">×</button>
      </div>
    </article>
  `;
}

function ingredientRow(item, ing) {
  const sources = normalizedSources(ing);
  const selected = selectedSource(ing);
  const decided = !!selected;
  return `
    <div class="cart-ing-row ${decided ? 'decided' : 'pending'}">
      <span class="cart-ing-check">${decided ? '✓' : ''}</span>
      <div class="cart-ing-body">
        <button type="button" class="cart-ing-name" data-cart-action="open-sheet" data-item-id="${escAttr(item.id)}" data-ing-id="${escAttr(ing.id)}">
          <b>${escHtml(ing.name || '재료')}</b>
          <span>${escHtml(ing.quantity || '')}</span>
        </button>
        ${sources.length ? `
          <div class="cart-ing-srcs">
            ${sources.map(src => sourceChip(item, ing, src)).join('')}
            <button type="button" class="cart-src-chip add" data-cart-action="add-source" data-item-id="${escAttr(item.id)}" data-ing-id="${escAttr(ing.id)}">+ 주문처 추가</button>
          </div>
        ` : `
          <button type="button" class="cart-ing-empty" data-cart-action="add-source" data-item-id="${escAttr(item.id)}" data-ing-id="${escAttr(ing.id)}">
            ⚠ <b>주문처 미등록</b> · 직접 링크 추가
          </button>
        `}
      </div>
    </div>
  `;
}

function recipeStepsHtml(item) {
  const steps = Array.isArray(item.steps) ? item.steps.filter(Boolean) : [];
  const summary = String(item.summary || '').trim();
  if (!summary && !steps.length) return '';
  return `
    <details class="cart-recipe-steps">
      <summary>
        <span>만드는 순서</span>
        <em>${steps.length ? `${steps.length}단계` : '요약'}</em>
      </summary>
      ${summary ? `<p>${escHtml(summary)}</p>` : ''}
      ${steps.length ? `<ol>${steps.map(step => `<li>${escHtml(step)}</li>`).join('')}</ol>` : ''}
    </details>
  `;
}

function sourceChip(item, ing, src) {
  const picked = selectedSource(ing)?.id === src.id;
  const storeClass = storeClassName(src);
  return `
    <button type="button" class="cart-src-chip ${storeClass} ${picked ? 'picked' : ''}" data-cart-action="pick-source" data-item-id="${escAttr(item.id)}" data-ing-id="${escAttr(ing.id)}" data-source-id="${escAttr(src.id)}">
      <i></i>${escHtml(src.store || src.domain || '쇼핑몰')}
      ${src.price ? `<strong>${formatPriceShort(src.price)}</strong>` : ''}
      ${src.shipping ? `<small>${escHtml(src.shipping)}</small>` : ''}
    </button>
  `;
}

function emptyIngredientRow(item) {
  return `
    <div class="cart-ing-row pending">
      <span class="cart-ing-check"></span>
      <div class="cart-ing-body">
        <button type="button" class="cart-ing-empty" data-cart-action="add-ingredient" data-item-id="${escAttr(item.id)}">
          ⚠ <b>재료 미등록</b> · 직접 입력해서 주문처를 붙일 수 있어요
        </button>
      </div>
    </div>
  `;
}

function simpleCard(item) {
  const status = item.status || 'active';
  const domain = item.domain || domainFromUrl(item.url) || '링크 없음';
  const price = Number(item.price) || 0;
  const externalUrl = safeExternalUrl(item.url);
  const imageUrl = safeExternalUrl(item.imageUrl);
  const age = ageDays(item);
  return `
    <article class="cart-card cart-simple-card ${price >= 50000 ? 'expensive' : ''} ${age >= 14 ? 'hot' : ''} ${status === 'bought' ? 'done' : ''}">
      <div class="cart-thumb cart-simple-thumb">
        ${imageUrl ? `<img src="${escHtml(imageUrl)}" alt="" loading="lazy" onerror="this.remove()">` : '<span>□</span>'}
        ${age ? `<em class="${age >= 14 ? 'cool' : ''}">${age}일째</em>` : ''}
      </div>
      <div class="cart-info cart-simple-body">
        <div class="cart-simple-top">
          <span>${escHtml(categoryName(item.kind))}</span>
          <em>${escHtml(domain)}</em>
        </div>
        <div class="title">${escHtml(item.title || '이름 없는 품목')}</div>
        <div class="cart-simple-price">
          <strong class="price">${price ? fmtKRW(price) : '가격 미입력'}</strong>
          <i><b style="width:${Math.min(100, Math.max(5, price / 500000 * 100))}%"></b></i>
        </div>
        ${item.note ? `<p>${escHtml(item.note)}</p>` : ''}
        <div class="cart-simple-actions">
          ${externalUrl ? `<a class="cart-mini-btn primary ${age >= 14 ? 'hotbtn' : ''}" href="${escHtml(externalUrl)}" target="_blank" rel="noreferrer">열기</a>` : ''}
          ${status === 'active' ? `<button type="button" class="cart-mini-btn pact ${price >= 50000 ? 'primary' : ''}" data-cart-action="pact-from-item" data-item-id="${escAttr(item.id)}">약속</button>` : ''}
          ${status === 'bought'
            ? `<button type="button" class="cart-mini-btn" data-cart-action="status" data-item-id="${escAttr(item.id)}" data-status="active">되돌리기</button>`
            : `<button type="button" class="cart-mini-btn" data-cart-action="status" data-item-id="${escAttr(item.id)}" data-status="bought">완료</button>`}
          <button type="button" class="cart-mini-btn danger" data-cart-action="delete" data-item-id="${escAttr(item.id)}">삭제</button>
        </div>
      </div>
    </article>
  `;
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

const PACT_TRIGGER_ORDER = ['time', 'savings', 'streak', 'measure', 'event', 'manual'];

function getSelectedPactTriggerTypes(form) {
  const selected = [...form.querySelectorAll('input[name="triggerType"]:checked')]
    .map(input => input.value);
  return normalizePactTriggerTypes(selected);
}

function selectedTriggerTypesFromFormData(fd) {
  return normalizePactTriggerTypes(fd.getAll('triggerType'));
}

function normalizePactTriggerTypes(values) {
  const selected = values
    .map(value => String(value || '').trim())
    .filter(value => PACT_TRIGGER_ORDER.includes(value));
  const unique = PACT_TRIGGER_ORDER.filter(type => selected.includes(type));
  if (!unique.length) return ['manual'];
  if (unique.includes('manual') && unique.length > 1) return unique.filter(type => type !== 'manual');
  return unique;
}

function primaryPactTriggerType(triggerTypes) {
  const selected = normalizePactTriggerTypes(triggerTypes);
  return selected.find(type => type !== 'manual') || 'manual';
}

function formDataToPact(fd) {
  const triggerTypes = selectedTriggerTypesFromFormData(fd);
  const type = primaryPactTriggerType(triggerTypes);
  const pact = {
    what: {
      title: fd.get('title'),
      category: fd.get('category'),
      cost: numberFromInput(fd.get('cost')),
      note: '',
    },
    trigger: { type, config: triggerConfigFromForm(type, fd) },
    cost: { source: fd.get('costSource') || 'mindbank' },
    signature: { message: fd.get('message') || '', cooloffHours: 24 },
    status: 'active',
  };
  pact.conditions = pactConditionsFromTriggerTypes(pact, triggerTypes, fd);
  return pact;
}

function pactConditionsFromTriggerTypes(pact, triggerTypes, fd) {
  return normalizePactTriggerTypes(triggerTypes)
    .map(type => legacyTriggerCondition({
      ...pact,
      trigger: { type, config: triggerConfigFromForm(type, fd) },
    }))
    .filter(Boolean);
}

function triggerConfigFromForm(type, fd) {
  if (type === 'time') return { date: fd.get('date'), recurrence: 'none' };
  if (type === 'savings') return { targetAmount: numberFromInput(fd.get('targetAmount')), currentAmount: numberFromInput(fd.get('currentAmount')) };
  if (type === 'streak') return { metric: fd.get('streakMetric') || fd.get('metric'), count: numberFromInput(fd.get('count')) || 1, currentCount: numberFromInput(fd.get('currentCount')), of: 'days' };
  if (type === 'measure') return { metric: fd.get('measureMetric') || fd.get('metric'), op: fd.get('op') || '<=', value: Number(fd.get('value')) || 0, currentValue: Number(fd.get('currentValue')) || 0, unit: fd.get('unit') };
  if (type === 'event') return { eventName: fd.get('eventName'), done: false };
  return { manual: true, done: false };
}

function numberFromInput(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0));
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

function withPactRuntime(pact) {
  const progress = computePactProgress(pact);
  return { ...pact, runtimeProgress: progress };
}

function computePactProgress(pact) {
  if (pact?.status === 'fulfilled') return 1;
  const conditions = pactConditions(pact);
  if (conditions.length) {
    const total = conditions.reduce((sum, condition) => sum + conditionProgress(condition), 0);
    return total / conditions.length;
  }
  return legacyPactProgress(pact);
}

function legacyPactProgress(pact) {
  const trigger = pact?.trigger || {};
  const cfg = trigger.config || {};
  if (pact?.status === 'fulfilled') return 1;
  if (trigger.type === 'time') {
    const due = cfg.date ? new Date(`${cfg.date}T23:59:59`) : null;
    if (!due || Number.isNaN(due.getTime())) return 0;
    const created = timestampMs(pact.createdAt) || Date.now();
    const span = Math.max(1, due.getTime() - created);
    return Math.max(0, Math.min(1, (Date.now() - created) / span));
  }
  if (trigger.type === 'savings') return ratio(cfg.currentAmount, cfg.targetAmount);
  if (trigger.type === 'streak') return ratio(cfg.currentCount, cfg.count);
  if (trigger.type === 'measure') {
    const target = Number(cfg.value) || 0;
    const current = Number(cfg.currentValue) || 0;
    if (!target) return 0;
    if (cfg.op === '<=') return current <= target ? 1 : Math.max(0, Math.min(0.95, target / current));
    return current >= target ? 1 : Math.max(0, Math.min(0.95, current / target));
  }
  if (trigger.type === 'event') return cfg.done ? 1 : 0;
  if (trigger.type === 'manual') return 1;
  return cfg.done ? 1 : Number(trigger.progress) || 0;
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

function pactConditionStats(pact) {
  const conditions = pactConditions(pact);
  const total = conditions.length;
  const done = conditions.filter(condition => conditionProgress(condition) >= 1).length;
  const progress = total
    ? conditions.reduce((sum, condition) => sum + conditionProgress(condition), 0) / total
    : legacyPactProgress(pact);
  return {
    conditions,
    total,
    done,
    progress,
    progressPct: Math.round(progress * 100),
    ready: total ? done === total : progress >= 1,
  };
}

function pactConditions(pact) {
  const explicit = Array.isArray(pact?.conditions)
    ? pact.conditions.map(normalizeChoicePactCondition).filter(Boolean)
    : [];
  if (explicit.length) return explicit;
  if (isTravelPact(pact)) return suggestedTravelConditions(pact);
  const legacy = legacyTriggerCondition(pact);
  return legacy ? [legacy] : [];
}

function normalizeChoicePactCondition(value) {
  if (!value) return null;
  const label = String(value.label || value.name || '').trim();
  if (!label) return null;
  const type = normalizeChoiceConditionType(value.type);
  const dueDate = String(value.dueDate || value.date || '').trim();
  const due = type === 'date' && dueDate ? isDateConditionDue(dueDate) : false;
  const done = !!value.done || due || Number(value.current) >= Math.max(1, Number(value.target) || 0);
  if (isBinaryConditionType(type)) {
    return {
      id: String(value.id || makeId('cond')),
      type,
      label,
      current: done ? 1 : 0,
      target: 1,
      unit: '',
      done,
      dueDate,
      note: String(value.note || '').trim(),
    };
  }
  return {
    id: String(value.id || makeId('cond')),
    type,
    label,
    current: Math.max(0, Number(value.current) || 0),
    target: Math.max(0, Number(value.target) || 0),
    unit: String(value.unit || (type === 'amount' ? '원' : '')).trim(),
    done,
    note: String(value.note || '').trim(),
  };
}

function normalizeChoiceConditionType(value) {
  const type = String(value || 'amount').toLowerCase();
  return ['amount', 'check', 'date', 'diet', 'number'].includes(type) ? type : 'amount';
}

function legacyTriggerCondition(pact) {
  const trigger = pact?.trigger || {};
  const cfg = trigger.config || {};
  if (trigger.type === 'savings') {
    return {
      id: 'legacy_savings',
      type: 'amount',
      label: isTravelPact(pact) ? '여행 예산' : '구매 예산',
      current: Math.max(0, Number(cfg.currentAmount) || 0),
      target: Math.max(0, Number(cfg.targetAmount) || Number(pact?.what?.cost) || 0),
      unit: '원',
      done: ratio(cfg.currentAmount, cfg.targetAmount || pact?.what?.cost) >= 1,
      note: '',
    };
  }
  if (trigger.type === 'time') {
    const progress = legacyPactProgress(pact);
    return {
      id: 'legacy_time',
      type: 'date',
      label: cfg.date ? `${cfg.date} 도래` : '날짜 도래',
      current: progress >= 1 ? 1 : 0,
      target: 1,
      unit: '',
      done: progress >= 1,
      dueDate: cfg.date || '',
      note: '',
    };
  }
  if (trigger.type === 'streak') {
    return {
      id: 'legacy_streak',
      type: 'number',
      label: cfg.metric || '루틴 달성',
      current: Math.max(0, Number(cfg.currentCount) || 0),
      target: Math.max(1, Number(cfg.count) || 1),
      unit: cfg.of === 'days' ? '일' : '회',
      done: ratio(cfg.currentCount, cfg.count) >= 1,
      note: '',
    };
  }
  if (trigger.type === 'measure') {
    const progress = legacyPactProgress(pact);
    return {
      id: 'legacy_measure',
      type: 'number',
      label: `${cfg.metric || '측정값'} ${cfg.op || '<='} ${cfg.value || 0}${cfg.unit || ''}`,
      current: Math.round(progress * 100),
      target: 100,
      unit: '%',
      done: progress >= 1,
      note: '',
    };
  }
  if (trigger.type === 'event') {
    return {
      id: 'legacy_event',
      type: 'check',
      label: cfg.eventName || '이벤트 완료',
      current: cfg.done ? 1 : 0,
      target: 1,
      unit: '',
      done: !!cfg.done,
      note: '',
    };
  }
  if (trigger.type === 'manual') {
    return {
      id: 'legacy_manual',
      type: 'check',
      label: '수동 확인',
      current: 1,
      target: 1,
      unit: '',
      done: true,
      note: '',
    };
  }
  return null;
}

function suggestedTravelConditions(pact) {
  const legacy = legacyTriggerCondition(pact);
  const budgetCurrent = legacy?.type === 'amount'
    ? legacy.current
    : Math.max(0, Number(pact?.trigger?.config?.currentAmount) || 0);
  const budgetTarget = legacy?.type === 'amount'
    ? legacy.target
    : Math.max(0, Number(pact?.trigger?.config?.targetAmount) || Number(pact?.what?.cost) || 0);
  return [
    {
      id: 'travel_budget',
      type: 'amount',
      label: '여행 예산',
      current: budgetCurrent,
      target: budgetTarget,
      unit: '원',
      done: budgetTarget > 0 && budgetCurrent >= budgetTarget,
      note: '',
    },
    { id: 'travel_ticket', type: 'check', label: '항공권/동선 확정', current: 0, target: 1, unit: '', done: false, note: '' },
    { id: 'travel_stay', type: 'check', label: '숙소 후보 확정', current: 0, target: 1, unit: '', done: false, note: '' },
    { id: 'travel_schedule', type: 'check', label: '휴가/일정 확정', current: 0, target: 1, unit: '', done: false, note: '' },
  ];
}

function isTravelPact(pact) {
  const text = [
    pact?.what?.title,
    pact?.what?.note,
    pact?.signature?.message,
    pact?.sourceUrl,
  ].filter(Boolean).join(' ').toLowerCase();
  return /일본|도쿄|오사카|교토|후쿠오카|여행|travel|japan|tokyo|osaka|kyoto/.test(text);
}

function conditionProgress(condition) {
  if (!condition) return 0;
  if (condition.done) return 1;
  if (condition.type === 'date') {
    if (!condition.dueDate) return 0;
    const due = new Date(`${condition.dueDate}T23:59:59`).getTime();
    if (Number.isNaN(due)) return 0;
    const now = Date.now();
    if (now >= due) return 1;
    // 생성일이 있으면 그것을 기준, 없으면 만기일 90일 전을 기준으로 진행률 계산
    const createdMs = condition.createdAt ? toMillis(condition.createdAt) : 0;
    const start = createdMs > 0 ? createdMs : due - 90 * 24 * 60 * 60 * 1000;
    if (now <= start) return 0.05;
    return Math.max(0.05, Math.min(0.97, (now - start) / (due - start)));
  }
  if (isBinaryConditionType(condition.type)) return condition.done ? 1 : 0;
  return ratio(condition.current, condition.target);
}

function conditionValueLabel(condition) {
  return conditionRemainingLabel(condition);
}

function choiceConditionSummary(stats = {}) {
  const conditions = Array.isArray(stats.conditions) ? stats.conditions : [];
  const primary = conditions.find(condition => conditionProgress(condition) < 1) || conditions[0];
  if (!primary) {
    return {
      label: '조건',
      badge: '조건',
      value: '조건 없음',
      meta: '0/0 조건',
    };
  }
  const value = conditionRemainingLabel(primary);
  const label = conditionTypeCardLabel(primary);
  return {
    label,
    badge: conditionBadgeLabel(primary),
    value,
    meta: `${stats.done || 0}/${stats.total || conditions.length} 조건 · ${label} ${value}`,
  };
}

function conditionRemainingLabel(condition) {
  if (!condition) return '조건 없음';
  const current = Math.max(0, Number(condition.current) || 0);
  const target = Math.max(0, Number(condition.target) || 0);
  if (condition.type === 'date') return dateRemainingLabel(condition.dueDate, conditionProgress(condition) >= 1);
  if (condition.type === 'diet') return conditionProgress(condition) >= 1 ? '성공 완료' : '성공 여부 대기';
  if (condition.type === 'check') return conditionProgress(condition) >= 1 ? '완료' : '체크 필요';
  if (condition.type === 'amount') {
    if (!target) return '목표 금액 필요';
    const remain = Math.max(0, target - current);
    return remain ? `${fmtKRW(remain)} 남음` : '금액 완료';
  }
  const unit = condition.unit || '';
  if (!target) return '목표 수치 필요';
  const remain = Math.max(0, target - current);
  return remain ? `${remain.toLocaleString('ko-KR')}${unit} 남음` : '달성 완료';
}

function dateRemainingLabel(value, done = false) {
  if (!value) return '날짜 미정';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${value}T00:00:00`);
  if (Number.isNaN(due.getTime())) return value;
  const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (done || days <= 0) return '오늘 도래';
  if (days === 1) return '내일 도래';
  return `D-${days}`;
}

function conditionTypeCardLabel(condition) {
  if (!condition) return '조건';
  if (condition.type === 'amount') return '예산';
  if (condition.type === 'date') return '날짜';
  if (condition.type === 'diet') return '다이어트';
  if (condition.type === 'check') return '체크';
  if (condition.type === 'number') return condition.unit ? `수치(${condition.unit})` : '수치';
  return '조건';
}

function conditionBadgeLabel(condition) {
  if (!condition) return '조건';
  if (condition.type === 'amount') return '예산';
  if (condition.type === 'date') return dateRemainingLabel(condition.dueDate, conditionProgress(condition) >= 1).replace(' 도래', '');
  if (condition.type === 'diet') return '식단';
  if (condition.type === 'check') return '체크';
  if (condition.type === 'number') return '수치';
  return '조건';
}

function isDateConditionDue(value) {
  if (!value) return false;
  const due = new Date(`${value}T23:59:59`);
  return !Number.isNaN(due.getTime()) && Date.now() >= due.getTime();
}

function hasPactTriggerConflict(next, pacts = []) {
  const nextSig = pactTriggerSignature(next);
  if (!nextSig) return false;
  return pacts.some(pact => {
    if (['fulfilled', 'broken', 'archived'].includes(pact.status)) return false;
    return pactTriggerSignature(pact) === nextSig;
  });
}

function pactTriggerSignature(pact) {
  const trigger = pact?.trigger || {};
  const cfg = trigger.config || {};
  if (!trigger.type) return '';
  if (trigger.type === 'time') return cfg.date ? `time:${cfg.date}` : '';
  if (trigger.type === 'savings') return cfg.targetAmount ? `savings:${cfg.targetAmount}` : '';
  if (trigger.type === 'streak') return `streak:${cfg.metric || ''}:${cfg.count || ''}`;
  if (trigger.type === 'measure') return `measure:${cfg.metric || ''}:${cfg.op || ''}:${cfg.value || ''}:${cfg.unit || ''}`;
  if (trigger.type === 'event') return cfg.eventName ? `event:${String(cfg.eventName).toLowerCase()}` : '';
  return '';
}

function effectivePactStatus(pact) {
  if (['fulfilled', 'broken', 'archived'].includes(pact.status)) return pact.status;
  if (isPactOverdue(pact)) return 'broken';
  const stats = pactConditionStats(pact);
  if (stats.ready) return 'ready';
  if (stats.progress >= 0.5) return 'ripening';
  return 'active';
}

function isPactOverdue(pact) {
  const cfg = pact.trigger?.config || {};
  if (pact.trigger?.type !== 'time' || !cfg.date) return false;
  const due = new Date(`${cfg.date}T23:59:59`);
  return !Number.isNaN(due.getTime()) && Date.now() - due.getTime() > 14 * 86400000;
}

function ratio(current, target) {
  const t = Number(target) || 0;
  if (!t) return 0;
  return Math.max(0, Math.min(1, (Number(current) || 0) / t));
}

function timestampMs(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function triggerLabel(pact) {
  const conditions = pactConditions(pact);
  if (conditions.length > 1) {
    const done = conditions.filter(condition => conditionProgress(condition) >= 1).length;
    return `${done}/${conditions.length} 조건`;
  }
  const t = pact.trigger?.type;
  const cfg = pact.trigger?.config || {};
  if (t === 'time') return cfg.date || '날짜';
  if (t === 'savings') return `${fmtKRW(cfg.currentAmount || 0)} / ${fmtKRW(cfg.targetAmount || 0)}`;
  if (t === 'streak') return `${cfg.metric || '스트릭'} ${cfg.currentCount || 0}/${cfg.count || 0}`;
  if (t === 'measure') return `${cfg.metric || '측정'} ${cfg.currentValue || 0}${cfg.unit || ''} → ${cfg.value || 0}${cfg.unit || ''}`;
  if (t === 'event') return cfg.eventName || '이벤트';
  return '수동';
}

function triggerIcon(type) {
  if (type === 'time') return '◷';
  if (type === 'savings') return '₩';
  if (type === 'streak') return '▰';
  if (type === 'measure') return '↗';
  if (type === 'event') return '◆';
  return '✓';
}

function pactCategoryLabel(value) {
  if (value === 'experience') return '경험';
  if (value === 'action') return '행동';
  if (value === 'relation') return '관계';
  if (value === 'restraint') return '금지';
  return '구매';
}

function pactCategoryToTxCategory(value) {
  if (value === 'experience') return '여가·취미';
  if (value === 'action') return '생활비용';
  if (value === 'relation') return '식비';
  if (value === 'restraint') return '와인/야식';
  return '취미/여가/의류/쇼핑/기타';
}

function pactCostSourceLabel(value) {
  if (value === 'mindbank') return '감각뱅크';
  if (value === 'envelope') return '저축통';
  if (value === 'external') return '외부 지원';
  return '예산';
}

function pactCooloffLabel(pact) {
  const hours = Math.max(0, Number(pact.signature?.cooloffHours) || 0);
  if (!hours) return '없음';
  const created = timestampMs(pact.createdAt);
  if (!created) return `${hours}시간`;
  const end = created + hours * 3600000;
  const remain = end - Date.now();
  if (remain <= 0) return '종료됨';
  const remainHours = Math.ceil(remain / 3600000);
  return `${remainHours}시간 남음`;
}

function statusLabel(value) {
  if (value === 'ready') return '실현 가능';
  if (value === 'ripening') return '숙성 중';
  if (value === 'fulfilled') return '실현됨';
  if (value === 'broken') return '깨짐';
  if (value === 'archived') return '보관됨';
  return '진행 중';
}

function statusMessage(value) {
  if (value === 'ready') return '조건을 채웠어요. 이제 실행 여부를 결정할 차례입니다.';
  if (value === 'ripening') return '절반 이상 왔습니다. 충동이 아니라 계획으로 바뀌는 중이에요.';
  if (value === 'fulfilled') return '지킨 약속으로 남겨두었습니다.';
  if (value === 'broken') return '깨진 약속도 다음 판단의 데이터입니다.';
  return '미래의 나와 합의한 조건을 따라갑니다.';
}

function categoryManager(categories) {
  return `
    <details class="cart-category-manager">
      <summary>
        <span>카테고리 관리</span>
        <em>단품 후보 분류</em>
      </summary>
      <form class="cart-category-add" data-cart-category-add>
        <input class="tds-input" name="emoji" placeholder="□" maxlength="4">
        <input class="tds-input" name="name" placeholder="새 카테고리" required>
        <button class="tds-btn tonal" type="submit">추가</button>
      </form>
      <div class="cart-category-list">
        ${categories.map(cat => `
          <div class="cart-category-row">
            <input class="tds-input" value="${escHtml(cat.emoji || '')}" data-cart-cat-emoji="${escAttr(cat.id)}" maxlength="4">
            <input class="tds-input" value="${escHtml(cat.name || '')}" data-cart-cat-name="${escAttr(cat.id)}">
            <button class="tds-btn secondary sm" type="button" data-cart-action="category-rename" data-category-id="${escAttr(cat.id)}">저장</button>
            <button class="tds-btn ghost sm danger-text" type="button" data-cart-action="category-remove" data-category-id="${escAttr(cat.id)}">삭제</button>
          </div>
        `).join('')}
      </div>
    </details>
  `;
}

function bindCartBoardEvents(root) {
  root.querySelector('[data-cart-category-add]')?.addEventListener('submit', cartAddCategory);
  root.onclick = async (event) => {
    const target = event.target.closest('[data-cart-action], [data-cart-filter], [data-bank-range], [data-subplan-segment], [data-pact-filter], [data-pact-action], [data-pact-card-id], [data-pact-example]');
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
    const filter = target.dataset.cartFilter;
    if (filter) {
      STATE.filter = filter;
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
      if (action === 'category-rename') {
        await cartRenameCategory(target.dataset.categoryId);
        return;
      }
      if (action === 'category-remove') {
        await cartRemoveCategory(target.dataset.categoryId);
        return;
      }
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
        STATE.reflectionTarget = null;
        openCaptureSheet();
        return;
      }
      if (action === 'open-action-sheet') {
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
      if (action === 'open-sheet') openIngredientSheet(itemId, ingId);
      if (action === 'pick-source') await pickIngredientSource(itemId, ingId, target.dataset.sourceId);
      if (action === 'add-source') await addIngredientSource(itemId, ingId);
      if (action === 'add-ingredient') await addIngredient(itemId);
      if (action === 'open-first-unresolved') openFirstIngredientNeedingDecision(itemId);
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
      const payload = capturePayloadFromForm(fd);
      await saveCartItem(payload);
      form.reset();
      closeCaptureSheet();
      if (sharedDraft) clearShareParams();
      STATE.segment = inferredType === 'recipe' ? 'do' : 'want';
      showToast(inferredType === 'recipe' ? '하고픈 것에 레시피를 담았어요.' : '사고픈 것에 담았어요.', 1300, 'success');
      await loadCartItems();
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

function capturePayloadFromForm(fd) {
  const rawCapture = String(fd.get('url') || '').trim();
  const url = safeExternalUrl(rawCapture) || extractFirstUrl(rawCapture);
  const inferredType = fd.get('type') || inferCaptureType(rawCapture);
  const title = String(fd.get('title') || '').trim() || cleanSharedTitle(rawCapture, url, 0) || domainFromUrl(url) || '선택 후보';
  const imageUrl = safeExternalUrl(fd.get('imageUrl'));
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
    note: fd.get('note') || (!url ? rawCapture : ''),
    status: 'active',
    source: inferredType === 'recipe'
      ? {
        platform: fd.get('sourcePlatform') || sourcePlatformFromUrl(url).platform,
        caption: rawCapture,
      }
      : null,
    ingredients: inferredType === 'recipe' ? parseIngredientsText(fd.get('ingredientsText')) : [],
    summary: inferredType === 'recipe' ? (fd.get('recipeSummary') || fd.get('note') || '') : '',
    steps: inferredType === 'recipe' ? parseStepsText(fd.get('stepsText'), fd.get('recipeStepsJson')) : [],
  };
}

async function saveSharedCartDraft(draft) {
  if (!draft) return;
  const inferredType = draft.type || inferCaptureType([draft.title, draft.note, draft.url].filter(Boolean).join('\n'));
  const url = safeExternalUrl(draft.url) || extractFirstUrl(draft.url || draft.note || '');
  const imageUrl = safeExternalUrl(draft.imageUrl);
  await saveCartItem({
    type: inferredType,
    title: draft.title || domainFromUrl(url) || (inferredType === 'recipe' ? '공유한 레시피' : '공유한 상품'),
    price: numberFromInput(draft.price),
    kind: draft.kind || (inferredType === 'recipe' ? 'eat' : inferKind(`${draft.title || ''} ${draft.note || ''}`)),
    url,
    domain: domainFromUrl(url),
    imageUrl,
    originalImageUrl: imageUrl,
    visualMode: imageUrl ? 'original' : 'generated',
    visualQuery: draft.title || domainFromUrl(url),
    note: draft.note || '',
    status: 'active',
    source: inferredType === 'recipe' ? (draft.source || sourcePlatformFromUrl(url)) : null,
    ingredients: Array.isArray(draft.ingredients) ? draft.ingredients : [],
    summary: draft.summary || '',
    steps: Array.isArray(draft.steps) ? draft.steps : [],
  });
  STATE.segment = inferredType === 'recipe' ? 'do' : 'want';
  showToast(inferredType === 'recipe' ? '공유 레시피를 바로 담았어요.' : '공유 상품을 바로 담았어요.', 1300, 'success');
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
  if (previewEl) {
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
        if (previewEl) previewEl.innerHTML = `<div><strong>레시피 자동정리 불가</strong><span>${escHtml(message)}</span></div>`;
        showToast(message, 2400, 'warning');
        return;
      }
      applyRecipePreview(form, data);
      if (previewEl) previewEl.innerHTML = previewHtml({ ...data, type: 'recipe' });
      const message = data.transcriptAvailable
        ? '자막을 읽어서 재료와 순서를 정리했어요.'
        : '자막 없이 제목/메타데이터 기준으로 정리했어요.';
      showToast(message, 1600, data.transcriptAvailable ? 'success' : 'warning');
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
    const message = err.code === 'API_UNAVAILABLE'
      ? '미리보기 서버에 닿지 못했어요. 링크만 저장할 수 있습니다.'
      : (err.message || '상품 정보 불러오기 실패');
    if (previewEl) previewEl.innerHTML = `<div><strong>자동 입력 불가</strong><span>${escHtml(message)}</span></div>`;
    showToast(message, 2200, 'warning');
  } finally {
    if (button) button.disabled = false;
  }
}

function previewHtml(item) {
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

function openIngredientSheet(itemId, ingId) {
  const item = STATE.items.find(row => row.id === itemId);
  const ing = normalizedIngredients(item).find(row => row.id === ingId);
  if (!item || !ing) return;
  const sheet = $('#cart-source-sheet');
  const sources = normalizedSources(ing);
  const selected = selectedSource(ing);
  const linkedCandidates = ingredientBuyCandidates(ing);
  sheet.classList.remove('hidden');
  sheet.innerHTML = `
    <div class="cart-sheet-backdrop" data-cart-sheet-close></div>
    <section class="cart-sheet-panel">
      <div class="cart-sheet-grab"></div>
      <div class="cart-sheet-head">
        <h3>${escHtml(ing.name || '재료')} 주문처</h3>
        <button type="button" data-cart-sheet-close>✕</button>
      </div>
      <p>레시피: ${escHtml(item.title || '레시피')} · ${escHtml(ing.quantity || '수량 미입력')}</p>
      <span class="cart-sheet-qty">이 재료로 뭘 살까?</span>
      <div class="cart-source-options">
        ${sources.length ? sources.map(src => `
          <button type="button" class="cart-source-option ${selected?.id === src.id ? 'active' : ''}" data-cart-action="pick-source" data-item-id="${escAttr(item.id)}" data-ing-id="${escAttr(ing.id)}" data-source-id="${escAttr(src.id)}">
            ${selected?.id === src.id ? '<span class="ribbon">현재 선택</span>' : ''}
            <span class="logo ${storeClassName(src)}">${storeInitial(src)}</span>
            <span class="meta">
              <em>${escHtml(src.store || src.domain || '쇼핑몰')} · ${escHtml(src.domain || domainFromUrl(src.url) || '')}</em>
              <b>${escHtml(src.title || src.store || '주문처 후보')}</b>
              <small>${escHtml(src.shipping || '배송 정보 미입력')}</small>
            </span>
            <strong>${src.price ? fmtKRW(src.price) : '가격 미정'}</strong>
          </button>
        `).join('') : '<div class="cart-sheet-empty">아직 등록된 주문처가 없습니다.</div>'}
        ${linkedCandidates.length ? `
          <div class="cart-linked-source-head">사고픈 것에서 연결</div>
          ${linkedCandidates.map(candidate => `
            <button type="button" class="cart-source-option compact" data-cart-action="link-item-source" data-item-id="${escAttr(item.id)}" data-ing-id="${escAttr(ing.id)}" data-source-cart-id="${escAttr(candidate.id)}">
              <span class="logo">${escHtml(storeInitial({ store: candidate.domain || candidate.title }))}</span>
              <span class="meta">
                <em>${escHtml(candidate.domain || '사고픈 것')}</em>
                <b>${escHtml(candidate.title || '상품 후보')}</b>
                <small>소계획의 사고픈 것에 담긴 품목</small>
              </span>
              <strong>${candidate.price ? fmtKRW(candidate.price) : '가격 미정'}</strong>
            </button>
          `).join('')}
        ` : ''}
        <button type="button" class="cart-source-add" data-cart-action="add-source" data-item-id="${escAttr(item.id)}" data-ing-id="${escAttr(ing.id)}">＋ 다른 쇼핑몰 링크 직접 추가</button>
      </div>
      <div class="cart-sheet-actions">
        <button type="button" class="ghost" data-cart-sheet-close>닫기</button>
        ${selected?.url ? `<a class="primary" href="${escHtml(safeExternalUrl(selected.url))}" target="_blank" rel="noreferrer">${escHtml(selected.store || '선택 주문처')} 열기</a>` : '<button type="button" class="primary" data-cart-action="add-source" data-item-id="' + escAttr(item.id) + '" data-ing-id="' + escAttr(ing.id) + '">주문처 추가</button>'}
      </div>
    </section>
  `;
  sheet.onclick = async (event) => {
    if (event.target.closest('[data-cart-sheet-close]')) {
      closeIngredientSheet();
      return;
    }
    const target = event.target.closest('[data-cart-action]');
    if (!target) return;
    try {
      if (target.dataset.cartAction === 'pick-source') {
        await pickIngredientSource(target.dataset.itemId, target.dataset.ingId, target.dataset.sourceId);
        closeIngredientSheet();
      }
      if (target.dataset.cartAction === 'add-source') {
        await addIngredientSource(target.dataset.itemId, target.dataset.ingId);
        closeIngredientSheet();
      }
      if (target.dataset.cartAction === 'link-item-source') {
        await linkCartItemAsIngredientSource(target.dataset.itemId, target.dataset.ingId, target.dataset.sourceCartId);
        closeIngredientSheet();
      }
    } catch (err) {
      showToast(err.message || '처리 실패', 2400, 'error');
    }
  };
}

function ingredientBuyCandidates(ing) {
  const name = String(ing?.name || '').replace(/\s+/g, '').toLowerCase();
  return STATE.items
    .filter(item => !isRecipeItem(item) && (item.status || 'active') === 'active')
    .filter(item => {
      const title = String(item.title || '').replace(/\s+/g, '').toLowerCase();
      return name && (title.includes(name) || name.includes(title));
    })
    .slice(0, 5);
}

async function linkCartItemAsIngredientSource(itemId, ingId, sourceCartId) {
  const item = STATE.items.find(row => row.id === itemId);
  const candidate = STATE.items.find(row => row.id === sourceCartId);
  if (!item || !candidate) return;
  const source = {
    id: makeId('src'),
    store: storeNameFromDomain(candidate.domain) || '사고픈 것',
    title: candidate.title || '',
    url: candidate.url || '',
    domain: candidate.domain || domainFromUrl(candidate.url),
    price: Number(candidate.price) || 0,
    imageUrl: candidate.imageUrl || '',
    shipping: '사고픈 것에서 연결',
  };
  const ingredients = normalizedIngredients(item).map(ing => {
    if (ing.id !== ingId) return ing;
    const sources = normalizedSources(ing).concat(source);
    return { ...ing, sources, decidedSourceId: ing.decidedSourceId || source.id };
  });
  await updateCartItem(itemId, { ingredients });
  showToast('사고픈 것 품목을 재료 주문처로 연결했어요.', 1400, 'success');
  await loadCartItems();
}

function closeIngredientSheet() {
  const sheet = $('#cart-source-sheet');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.innerHTML = '';
}

function openFirstIngredientNeedingDecision(itemId) {
  const item = STATE.items.find(row => row.id === itemId);
  const ingredients = normalizedIngredients(item);
  const target = ingredients.find(ing => !isIngredientDecided(ing)) || ingredients[0];
  if (target) openIngredientSheet(itemId, target.id);
}

async function pickIngredientSource(itemId, ingId, sourceId) {
  const item = STATE.items.find(row => row.id === itemId);
  if (!item) return;
  const ingredients = normalizedIngredients(item).map(ing => ing.id === ingId ? { ...ing, decidedSourceId: sourceId } : ing);
  await updateCartItem(itemId, { ingredients });
  showToast('주문처를 선택했어요.', 1100, 'success');
  await loadCartItems();
}

async function addIngredientSource(itemId, ingId) {
  showToast('주문처 추가는 상세 시트에서 링크를 저장하는 방식으로 이어갈게요.', 1800, 'info');
  openChoiceDetail({ itemId, kind: 'item' });
}

async function addIngredient(itemId) {
  showToast('재료 추가는 상세 시트에서 조건과 함께 정리할게요.', 1800, 'info');
  openChoiceDetail({ itemId, kind: 'item' });
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

function isRecipeItem(item) {
  return item?.type === 'recipe' || Array.isArray(item?.ingredients) && item.ingredients.length > 0;
}

function hasUnresolvedIngredients(item) {
  if (!isRecipeItem(item)) return false;
  const ingredients = normalizedIngredients(item);
  return !ingredients.length || ingredients.some(ing => !isIngredientDecided(ing));
}

function isIngredientDecided(ing) {
  return !!selectedSource(ing);
}

function normalizedIngredients(item) {
  return Array.isArray(item?.ingredients)
    ? item.ingredients.map((ing, index) => ({
      id: ing.id || `ing_${index}`,
      name: String(ing.name || '').trim() || `재료 ${index + 1}`,
      quantity: String(ing.quantity || '').trim(),
      decidedSourceId: String(ing.decidedSourceId || '').trim(),
      sources: normalizedSources(ing),
    }))
    : [];
}

function normalizedSources(ing) {
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

function selectedSource(ing) {
  const sources = normalizedSources(ing);
  if (!sources.length) return null;
  return sources.find(src => src.id === ing.decidedSourceId) || null;
}

function itemDecisionTotal(item) {
  if (!isRecipeItem(item)) return Number(item.price) || 0;
  return normalizedIngredients(item).reduce((sum, ing) => sum + (Number(selectedSource(ing)?.price) || 0), 0);
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
    return Array.isArray(parsed) ? parsed.map(step => String(step || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function applyRecipePreview(form, data) {
  fillIfEmpty(form.elements.title, data.title);
  if (form.elements.imageUrl) form.elements.imageUrl.value = data.imageUrl || '';
  if (form.elements.sourcePlatform) form.elements.sourcePlatform.value = data.source?.platform || sourcePlatformFromUrl(data.url).platform;
  if (form.elements.recipeSummary) form.elements.recipeSummary.value = data.summary || '';
  if (form.elements.recipeStepsJson) form.elements.recipeStepsJson.value = JSON.stringify(Array.isArray(data.steps) ? data.steps : []);
  if (form.elements.note && data.summary) form.elements.note.value = data.summary;
  if (form.elements.ingredientsText && Array.isArray(data.ingredients) && data.ingredients.length) {
    form.elements.ingredientsText.value = data.ingredients
      .map(ing => `${ing.name || ''}${ing.quantity ? ` | ${ing.quantity}` : ''}`.trim())
      .join('\n');
  }
  if (form.elements.stepsText && Array.isArray(data.steps) && data.steps.length) {
    form.elements.stepsText.value = data.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  }
  if (form.elements.type) form.elements.type.value = 'recipe';
  if (form.elements.kind) form.elements.kind.value = 'eat';
}

function ageDays(item) {
  const created = item?.createdAt;
  const ms = created?.toMillis ? created.toMillis() : (created ? new Date(created).getTime() : 0);
  if (!ms || Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}

function inferCaptureType(text) {
  const source = String(text || '').toLowerCase();
  return /(youtube\.com|youtu\.be|instagram\.com\/reel|instagram\.com\/p\/|tiktok\.com|shorts)/i.test(source) ? 'recipe' : 'simple';
}

function sourcePlatformFromUrl(url) {
  const value = String(url || '').toLowerCase();
  if (/youtube\.com|youtu\.be/.test(value)) return { platform: 'youtube', label: 'YT', name: 'YouTube', className: 'yt' };
  if (/instagram\.com/.test(value)) return { platform: 'instagram', label: 'REELS', name: 'Instagram', className: 'ig' };
  if (/tiktok\.com/.test(value)) return { platform: 'tiktok', label: 'TT', name: 'TikTok', className: 'tk' };
  return { platform: 'web', label: 'WEB', name: 'Web', className: 'web' };
}

function sourcePlatform(item) {
  const platform = String(item?.source?.platform || '').toLowerCase();
  if (platform === 'youtube') return { platform, label: 'YT', name: 'YouTube', className: 'yt' };
  if (platform === 'instagram') return { platform, label: 'REELS', name: 'Instagram', className: 'ig' };
  if (platform === 'tiktok') return { platform, label: 'TT', name: 'TikTok', className: 'tk' };
  if (platform === 'web') return { platform, label: 'WEB', name: 'Web', className: 'web' };
  return sourcePlatformFromUrl(item?.url || '');
}

function storeClassName(src) {
  const text = `${src.store || ''} ${src.domain || ''}`.toLowerCase();
  if (/coupang|쿠팡/.test(text)) return 'coupang';
  if (/kurly|컬리/.test(text)) return 'kurly';
  if (/oasis|오아시스/.test(text)) return 'oasis';
  if (/naver|smartstore|스마트|네이버/.test(text)) return 'naver';
  return 'store';
}

function storeInitial(src) {
  const name = src.store || src.domain || '몰';
  if (/coupang|쿠팡/i.test(name)) return '쿠';
  if (/kurly|컬리/i.test(name)) return '컬';
  if (/oasis|오아시스/i.test(name)) return '오';
  if (/naver|smartstore|스마트|네이버/i.test(name)) return 'N';
  return name.slice(0, 1).toUpperCase();
}

function storeNameFromDomain(domain) {
  const value = String(domain || '').toLowerCase();
  if (value.includes('coupang')) return '쿠팡';
  if (value.includes('kurly')) return '컬리';
  if (value.includes('oasis')) return '오아시스';
  if (value.includes('naver') || value.includes('smartstore')) return '스마트스토어';
  return domain || '쇼핑몰';
}

function formatPriceShort(value) {
  const n = Number(value) || 0;
  return n ? n.toLocaleString('ko-KR') : '';
}

function emptyCartHtml() {
  return `
    <div class="empty-state compact cart-empty">
      <div>아직 담긴 후보가 없습니다</div>
      <p>상품 링크, 레시피 영상, 공유 텍스트를 아래 도크에 붙여넣어 보세요.</p>
    </div>
  `;
}

function productPreviewEndpoint(url) {
  if (!hasServerApi()) return '';
  return `/api/market-symbol-search?productUrl=${encodeURIComponent(url)}`;
}

function recipePreviewEndpoint(url) {
  if (!hasServerApi()) return '';
  return `/api/market-symbol-search?recipeUrl=${encodeURIComponent(url)}`;
}

function visualSearchEndpoint(query) {
  if (!hasServerApi()) return '';
  return `/api/visual-search?q=${encodeURIComponent(query)}`;
}

function shouldFetchRemoteVisualSearch() {
  return hasServerApi();
}

function apiUnavailableError() {
  const err = new Error('GitHub Pages에서는 미리보기 API를 사용할 수 없습니다.');
  err.code = 'API_UNAVAILABLE';
  return err;
}

async function readJsonResponse(response) {
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

function cartBookmarkletHref() {
  const targetBase = typeof window !== 'undefined'
    ? new URL('./', window.location.href).href.replace(/\/$/, '')
    : '';
  const code = `(function(){function meta(k){var e=document.querySelector('meta[property="'+k+'"],meta[name="'+k+'"]');return e?(e.content||'').trim():''}function one(s){try{return document.querySelector(s)}catch(e){return null}}function text(e){return e?(e.textContent||e.content||'').trim():''}function price(){var keys=['product:price:amount','og:price:amount','twitter:data1'];for(var i=0;i<keys.length;i++){var v=meta(keys[i]);if(/[0-9]/.test(v))return v.replace(/[^0-9]/g,'')}var sels=['.total-price strong','.prod-price-content strong','.prod-sale-price strong','[class*="totalPrice"] strong','[class*="price"] strong','[data-testid*="price"]'];for(var j=0;j<sels.length;j++){var v=text(one(sels[j]));if(/[0-9]/.test(v))return v.replace(/[^0-9]/g,'')}var body=(document.body&&document.body.innerText||'').match(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})\\s*원/);return body?body[1].replace(/,/g,''):''}var title=meta('og:title')||meta('twitter:title')||document.title||'';var image=meta('og:image')||meta('twitter:image')||'';var selected=(window.getSelection&&String(window.getSelection()))||'';var u='${targetBase}/?shareTarget=cart&title='+encodeURIComponent(title)+'&text='+encodeURIComponent(selected)+'&url='+encodeURIComponent(location.href)+'&imageUrl='+encodeURIComponent(image)+'&price='+encodeURIComponent(price());window.open(u,'_blank','noopener')})();`;
  return `javascript:${encodeURI(code)}`;
}

function cartBookmarkletHint() {
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

function fillIfEmpty(input, value) {
  if (!input || !value) return;
  if (!String(input.value || '').trim()) input.value = value;
}

function inferTitleFromUrl(url) {
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

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function safeExternalUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function extractFirstUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[)\].,;]+$/, '') : '';
}

function extractPrice(text) {
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

function cleanSharedTitle(text, url, price) {
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

function compactSharedNote(text, url) {
  return String(text || '')
    .replace(url || '', '')
    .replace(/https?:\/\/[^\s]+/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function inferKind(text) {
  const value = String(text || '').toLowerCase();
  if (/와인|wine|pinot|chardonnay|샤르도네|피노/.test(value)) return 'wine';
  if (/셔츠|팬츠|니트|자켓|코트|신발|의류|clothes|shirt|pants|jacket|shoes/.test(value)) return 'wear';
  if (/식품|먹|과자|커피|음식|food|meal|recipe|reels|shorts|youtube|instagram/.test(value)) return 'eat';
  if (/수납|조명|침구|가구|생활|home|interior/.test(value)) return 'home';
  return 'other';
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
    imageUrl: directImage,
    kind: type === 'recipe' ? 'eat' : inferKind(source),
    note: rawText && rawText !== title ? compactSharedNote(rawText, url) : '',
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

async function cartAddCategory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const fd = new FormData(form);
  try {
    const id = await saveCartCategory({
      emoji: fd.get('emoji'),
      name: fd.get('name'),
      order: (STATE.categories.length + 1) * 10,
    });
    STATE.filter = `cat:${id}`;
    form.reset();
    showToast('카테고리를 추가했어요.', 1200, 'success');
    await loadCartItems();
  } catch (err) {
    showToast(err.message || '카테고리 추가 실패', 2200, 'error');
  }
}

async function cartRenameCategory(categoryId) {
  const nameInput = document.querySelector(`[data-cart-cat-name="${CSS.escape(categoryId)}"]`);
  const emojiInput = document.querySelector(`[data-cart-cat-emoji="${CSS.escape(categoryId)}"]`);
  try {
    await updateCartCategory(categoryId, {
      name: nameInput?.value,
      emoji: emojiInput?.value,
    });
    showToast('카테고리를 저장했어요.', 1200, 'success');
    await loadCartItems();
  } catch (err) {
    showToast(err.message || '카테고리를 저장 실패', 2200, 'error');
  }
}

async function cartRemoveCategory(categoryId) {
  if (categoryId === 'other') {
    showToast('기타 카테고리는 남겨둘게요.', 1600, 'warning');
    return;
  }
  const affected = STATE.items.filter(item => normalizedKind(item.kind) === categoryId);
  try {
    await deleteCartCategory(categoryId);
    if (affected.length) {
      await Promise.all(affected.map(item => updateCartItem(item.id, { kind: 'other' })));
    }
    showToast('카테고리를 삭제했어요.', 1200, 'success');
    await loadCartItems();
  } catch (err) {
    showToast(err.message || '카테고리 삭제 실패', 2200, 'error');
  }
}

window.cartExplainBookmarklet = cartExplainBookmarklet;
window.copyCartBookmarklet = copyCartBookmarklet;
window.cartAddCategory = cartAddCategory;
window.cartRenameCategory = cartRenameCategory;
window.cartRemoveCategory = cartRemoveCategory;
