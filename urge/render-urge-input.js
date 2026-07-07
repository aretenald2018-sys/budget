// ================================================================
// urge/render-urge-input.js — Step 1: capture purchase urge
// ================================================================

import { getCategories, saveUrge } from '../data.js?v=20260707-newsfeed-digest-clipboard';
import { buildFallbackAlternatives } from '../utils/mindbank.js?v=20260502-deep-violet';
import { $, escHtml } from '../utils/dom.js';
import { showToast } from '../utils/toast.js';
import { hasServerApi } from '../utils/runtime.js?v=20260505-github-pages';
import { renderUrgeAlternatives } from './render-urge-alternatives.js?v=20260702-stale-reminder-settings-css';

const FLOW = {
  urge: null,
};

const MOOD_OPTIONS = [
  '긴장이 높아요',
  '마음이 허전해요',
  '지쳐서 쉬고 싶어요',
  '보상받고 싶어요',
  '그냥 끌려요',
];

const DESIRE_TYPES = [
  {
    id: 'buy',
    label: '사고 싶음',
    category: '취미/여가/의류/쇼핑/기타',
    detailLabel: '어떤 물건이 떠올랐나요?',
    detailPlaceholder: '예: 새 노트, 부드러운 니트, 향이 좋은 캔들',
  },
  {
    id: 'eat',
    label: '먹고 싶음',
    category: '생활비용',
    detailLabel: '어떤 맛이 떠올랐나요?',
    detailPlaceholder: '예: 매운 야식, 영화관 팝콘, 달달한 디저트',
  },
  {
    id: 'wine',
    label: '와인이 끌림',
    category: '와인/야식',
    detailLabel: '어떤 와인이 떠올랐나요?',
    detailPlaceholder: '예: 피노누아, 샤르도네, 오늘 어울릴 내추럴 와인',
  },
];

export async function renderUrgeInput() {
  const root = $('#tab-urge');
  const cats = getCategories().filter(c => c.kind === 'expense');
  const primaryCats = preferredCategories(cats);

  root.innerHTML = `
    <div class="urge-screen">
      <div class="urge-topbar">
        <button type="button" class="urge-back" onclick="switchTab('home')">‹</button>
        <div>1/3 단계</div>
        <span></span>
      </div>
      <div class="pact-stepbar urge-stepbar"><span></span><span></span><span></span></div>

      <div class="urge-input-h">
        <div class="step">✦ 끌림 들여다보기</div>
        <div class="h">지금 뭐가 끌리세요?</div>
        <div class="sub">먼저 끌림의 모양만 잡아요. 돈이나 칼로리는 필요할 때만 덧붙이면 돼요.</div>
      </div>

      <form id="urge-input-form">
        <div class="field">
          <label>어떤 끌림인가요?</label>
          <div class="desire-type-row" id="urge-desire-types">
            ${DESIRE_TYPES.map((type, idx) => `<button type="button" class="intent-pill desire-type ${idx === 0 ? 'active' : ''}" data-desire-type="${type.id}" data-category="${escHtml(type.category)}" data-detail-label="${escHtml(type.detailLabel)}" data-detail-placeholder="${escHtml(type.detailPlaceholder)}">${escHtml(type.label)}</button>`).join('')}
          </div>
          <input type="hidden" name="desireType" value="${DESIRE_TYPES[0].id}">
        </div>

        <div class="field">
          <label data-urge-detail-label>${escHtml(DESIRE_TYPES[0].detailLabel)}</label>
          <input class="tds-input warm-input" name="what" required placeholder="${escHtml(DESIRE_TYPES[0].detailPlaceholder)}">
        </div>

        <div class="food-portion-fields hidden" data-food-portions>
          <div class="field">
            <label>처음 떠오른 양</label>
            <input class="tds-input warm-input" name="originalPortion" placeholder="예: 라지 전체, 한 봉지, 300g">
          </div>
          <div class="field">
            <label>실제로 즐길 양</label>
            <input class="tds-input warm-input" name="plannedPortion" placeholder="예: 100g만, 반만, 작은 컵">
          </div>
          <div class="portion-hint">비워도 괜찮아요. 앱이 음식명과 대안 문구를 보고 조심스럽게 추정합니다.</div>
        </div>

        <details class="optional-panel">
          <summary>더 남길 정보</summary>
          <div class="field">
            <label>금액</label>
            <div class="price-input">
              <input class="tds-input warm-input" name="price" inputmode="numeric" placeholder="필요할 때만 입력">
              <span class="won">원</span>
            </div>
          </div>

          <div class="field">
            <label>카테고리</label>
            <div class="cat-row-pick" id="urge-category-picks">
              ${primaryCats.map((cat, idx) => `
                <button type="button" class="cat-pick ${idx === 0 ? 'active' : ''}" data-category="${escHtml(cat.name)}">${cat.emoji || ''} ${escHtml(cat.name)}</button>
              `).join('')}
            </div>
            <input type="hidden" name="category" value="${escHtml(primaryCats[0]?.name || '기타')}">
          </div>

          <div class="field">
            <label>지금 기분</label>
            <div class="mood-row-pick" id="urge-mood-picks">
              ${MOOD_OPTIONS.map(mood => `<button type="button" class="mood-pill" data-mood="${escHtml(mood)}">${escHtml(mood)}</button>`).join('')}
            </div>
            <input type="hidden" name="mood">
          </div>

          <div class="field">
            <label>맥락 한 줄</label>
            <input class="tds-input warm-input" name="context" placeholder="예: 회의가 길어서 풀고 싶어요">
          </div>
        </details>

        <button class="next-btn" type="submit">대안 보기 →</button>
      </form>
    </div>
  `;

  bindInputForm(root);
}

function bindInputForm(root) {
  root.querySelectorAll('.desire-type').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.desire-type').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      root.querySelector('[name=desireType]').value = btn.dataset.desireType;
      root.querySelector('[data-urge-detail-label]').textContent = btn.dataset.detailLabel;
      root.querySelector('[name=what]').placeholder = btn.dataset.detailPlaceholder;
      root.querySelector('[data-food-portions]')?.classList.toggle('hidden', btn.dataset.desireType !== 'eat');
      const matching = [...root.querySelectorAll('.cat-pick')].find(el => el.dataset.category === btn.dataset.category);
      if (matching) matching.click();
    });
  });
  root.querySelectorAll('.cat-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.cat-pick').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      root.querySelector('[name=category]').value = btn.dataset.category;
    });
  });
  root.querySelectorAll('.mood-pill[data-mood]').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.mood-pill[data-mood]').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
      root.querySelector('[name=mood]').value = btn.dataset.mood;
    });
  });
  $('#urge-input-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = e.currentTarget.querySelector('.next-btn');
    submit.disabled = true;
    submit.textContent = '대안 준비 중...';
    const fd = new FormData(e.currentTarget);
    const price = parseAmount(fd.get('price'));
    const urge = {
      what: String(fd.get('what') || '').trim(),
      estimatedPrice: price,
      desireType: fd.get('desireType') || 'buy',
      originalPortion: String(fd.get('originalPortion') || '').trim() || null,
      plannedPortion: String(fd.get('plannedPortion') || '').trim() || null,
      category: fd.get('category') || '기타',
      mood: fd.get('mood') || null,
      context: String(fd.get('context') || '').trim() || null,
    };
    try {
      const alternatives = await suggestAlternatives(urge);
      const urgeId = await saveUrge({ ...urge, alternatives, status: 'pending' });
      FLOW.urge = { ...urge, id: urgeId, alternatives };
      renderUrgeAlternatives(FLOW.urge);
    } catch (err) {
      console.error('[urge-input]', err);
      showToast(`저장 실패: ${err.message}`, 2400, 'error');
      submit.disabled = false;
      submit.textContent = '대안 보기 →';
    }
  });
}

async function suggestAlternatives(urge) {
  const fallback = buildFallbackAlternatives({
    what: urge.what,
    price: urge.estimatedPrice,
    desireType: urge.desireType,
    originalPortion: urge.originalPortion,
    plannedPortion: urge.plannedPortion,
    category: urge.category,
    mood: urge.mood,
  });
  if (!hasServerApi()) return enrichWithCalories(urge, fallback);
  try {
    const res = await withTimeout(fetch('/api/urge-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        what: urge.what,
        price: urge.estimatedPrice,
        desireType: urge.desireType,
        originalPortion: urge.originalPortion,
        plannedPortion: urge.plannedPortion,
        category: urge.category,
        mood: urge.mood,
        context: urge.context,
      }),
    }), 1200);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.alternatives) && data.alternatives.length >= 4) {
        return enrichWithCalories(urge, data.alternatives.slice(0, 4));
      }
    }
  } catch (err) {
    console.warn('[urge-suggest:fallback]', err);
  }
  return enrichWithCalories(urge, fallback);
}

async function enrichWithCalories(urge, alternatives) {
  if (urge.desireType !== 'eat') return alternatives;
  if (!hasServerApi()) return alternatives;
  try {
    const res = await withTimeout(fetch('/api/calorie-estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urge, alternatives }),
    }), 900);
    if (res.ok) {
      const data = await res.json();
      const byId = new Map((data.items || []).map(item => [item.id, item]));
      return alternatives.map(item => {
        const kcal = byId.get(item.id);
        return kcal ? {
          ...item,
          savedKcal: Math.max(0, Math.round(Number(kcal.savedKcal) || 0)),
          calorieMeta: kcal,
        } : item;
      });
    }
  } catch (err) {
    console.warn('[calorie-estimate:fallback]', err);
  }
  return alternatives;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function preferredCategories(cats) {
  const order = ['와인/야식', '취미/여가/의류/쇼핑/기타', '카페비용', '생활비용', '술·와인', '충동쇼핑', '야식', '쇼핑·의류', '여가·취미', '기타'];
  return order.map(name => cats.find(cat => cat.name === name)).filter(Boolean).slice(0, 4);
}

function parseAmount(value) {
  return Math.round(Math.abs(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0));
}

window.getCurrentUrgeFlow = () => FLOW;
