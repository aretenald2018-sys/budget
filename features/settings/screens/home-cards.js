// ================================================================
// 설정 07 홈 화면 구성 — 즉시 반영 화면
// homeCards 설정을 features/home/dashboard.js 가 읽어 카드 표시/순서/형태를 반영.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-07
// ================================================================

import { getAppSettings, saveAppSettings } from '../../../data.js';
import { showToast } from '../../../utils/toast.js';
import { escHtml, switchHtml, sectionHtml } from './shared.js';

// 홈 대시보드 섹션과 1:1. core = 기본 표시, extra = 추가 가능(기본 숨김).
export const HOME_CARD_DEFS = [
  { id: 'hero', name: '지금까지 쓴 돈', desc: '써도 되는 돈 / 쓴 돈 히어로', core: true, variants: true },
  { id: 'kpis', name: '요약 지표', desc: '수입·충당금·고정비·예산', core: true, variants: false },
  { id: 'categories', name: '카테고리 요약', desc: '지출 요약 도넛', core: true, variants: true },
  { id: 'funds', name: '충당금', desc: '비상금 주머니', core: true, variants: false },
  { id: 'goals', name: '나의 목표', desc: '카테고리 목표 진행', core: true, variants: true },
  { id: 'points', name: '포인트 / 미션', desc: '적립 포인트 요약', core: true, variants: true },
  { id: 'recentTx', name: '최근 거래', desc: '최근 거래 5건', core: false, variants: false },
  { id: 'budgetSummary', name: '예산 요약', desc: '이번 달 예산 진행 카드', core: false, variants: false },
  { id: 'calendar', name: '소비 캘린더', desc: '일별 지출 히트맵', core: false, variants: false },
];

// 저장된 homeCards 설정과 기본 정의를 병합해 최종 카드 상태 목록을 만든다.
export function resolveHomeCards(saved = []) {
  const savedById = new Map((Array.isArray(saved) ? saved : []).map(card => [card.id, card]));
  const resolved = HOME_CARD_DEFS.map((def, index) => {
    const stored = savedById.get(def.id);
    return {
      ...def,
      visible: stored ? stored.visible !== false : def.core,
      variant: stored?.variant === 'simple' ? 'simple' : 'detailed',
      order: stored && Number.isFinite(Number(stored.order)) ? Number(stored.order) : (index + 1) * 10,
    };
  });
  return resolved.sort((a, b) => a.order - b.order);
}

async function persist(cards) {
  await saveAppSettings({
    homeCards: cards.map((card, index) => ({
      id: card.id,
      visible: card.visible,
      variant: card.variant,
      order: (index + 1) * 10,
    })),
  });
  window.refreshCurrentTab?.();
}

export const homeCardsScreen = {
  id: 'settings-screen-home-cards',
  title: '홈 화면 구성',

  async render() {
    const appSettings = await getAppSettings();
    const cards = resolveHomeCards(appSettings.homeCards);
    const visible = cards.filter(card => card.visible);
    const hidden = cards.filter(card => !card.visible);

    const rowHtml = (card, index, list) => `
      <div class="settings-goal-row">
        <span class="settings-order-btns">
          <button type="button" class="tds-icon-btn sm" data-card-move="up" data-card-id="${card.id}" ${index === 0 ? 'disabled' : ''} aria-label="${escHtml(card.name)} 위로">▲</button>
          <button type="button" class="tds-icon-btn sm" data-card-move="down" data-card-id="${card.id}" ${index === list.length - 1 ? 'disabled' : ''} aria-label="${escHtml(card.name)} 아래로">▼</button>
        </span>
        <div class="settings-goal-main">
          <strong>${escHtml(card.name)}</strong>
          <small>${escHtml(card.desc)}</small>
        </div>
        ${card.variants ? `
          <select class="tds-select sm" data-card-variant="${card.id}" aria-label="${escHtml(card.name)} 표시 형태">
            <option value="detailed" ${card.variant === 'detailed' ? 'selected' : ''}>상세히</option>
            <option value="simple" ${card.variant === 'simple' ? 'selected' : ''}>간단히</option>
          </select>
        ` : ''}
        ${switchHtml(`card-${card.id}`, true, `data-card-toggle="${card.id}"`)}
      </div>
    `;

    return `
      <small class="settings-screen-note">카드 순서를 변경하고 표시 여부를 설정하세요. 변경은 바로 홈에 반영돼요.</small>
      ${sectionHtml('표시 중인 카드', `
        <div class="settings-goal-list">
          ${visible.map((card, i) => rowHtml(card, i, visible)).join('') || '<div class="settings-screen-empty">표시 중인 카드가 없어요.</div>'}
        </div>
      `)}
      ${sectionHtml('추가 가능한 카드', `
        <div class="settings-goal-list">
          ${hidden.map(card => `
            <div class="settings-goal-row">
              <div class="settings-goal-main">
                <strong>${escHtml(card.name)}</strong>
                <small>${escHtml(card.desc)}</small>
              </div>
              ${switchHtml(`card-${card.id}`, false, `data-card-toggle="${card.id}"`)}
            </div>
          `).join('') || '<div class="settings-screen-empty">모든 카드가 표시 중이에요.</div>'}
        </div>
      `)}
      <button type="button" class="tds-btn settings-screen-cta secondary" data-screen-action="reset-default">기본값으로 초기화</button>
    `;
  },

  bind(body, ctx) {
    const withCards = async mutate => {
      const appSettings = await getAppSettings();
      const cards = resolveHomeCards(appSettings.homeCards);
      mutate(cards);
      try {
        await persist(cards);
        ctx.refresh();
      } catch (err) {
        showToast(err.message || '홈 구성 저장 실패', 2400, 'error');
      }
    };

    body.querySelectorAll('[data-card-toggle]').forEach(input => {
      input.addEventListener('change', () => withCards(cards => {
        const card = cards.find(c => c.id === input.dataset.cardToggle);
        if (card) card.visible = input.checked;
      }));
    });

    body.querySelectorAll('[data-card-variant]').forEach(select => {
      select.addEventListener('change', () => withCards(cards => {
        const card = cards.find(c => c.id === select.dataset.cardVariant);
        if (card) card.variant = select.value === 'simple' ? 'simple' : 'detailed';
      }));
    });

    body.querySelectorAll('[data-card-move]').forEach(btn => {
      btn.addEventListener('click', () => withCards(cards => {
        const visible = cards.filter(c => c.visible);
        const index = visible.findIndex(c => c.id === btn.dataset.cardId);
        const target = btn.dataset.cardMove === 'up' ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= visible.length) return;
        const a = cards.indexOf(visible[index]);
        const b = cards.indexOf(visible[target]);
        [cards[a], cards[b]] = [cards[b], cards[a]];
      }));
    });

    body.querySelector('[data-screen-action="reset-default"]')?.addEventListener('click', async () => {
      if (!window.confirm('홈 화면 구성을 기본값으로 초기화할까요?')) return;
      try {
        await saveAppSettings({ homeCards: [] });
        window.refreshCurrentTab?.();
        showToast('기본 구성으로 초기화했어요.', 1400, 'success');
        ctx.refresh();
      } catch (err) {
        showToast(err.message || '초기화 실패', 2400, 'error');
      }
    });
  },
};
