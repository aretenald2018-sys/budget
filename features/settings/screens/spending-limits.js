// ================================================================
// 설정 03 지출 한도 설정 — 명시 저장(저장하기) 화면
// 카테고리 금액은 02와 동일한 monthlyTargets 를 읽기 전용으로 표시하고,
// 이 화면은 경고 단계(전역 기본 + 카테고리별 오버라이드)만 소유한다.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-03
// ================================================================

import { getAppSettings, saveAppSettings, getCategories } from '../../../data.js';
import { currentTarget } from '../budget-goals/index.js';
import { fmtMonthKey } from '../../../utils/format.js';
import { showToast } from '../../../utils/toast.js';
import {
  escHtml, fmtWon, sectionHtml, primaryButtonHtml,
  markDirtyOnChange, clearDirty, sortedExpenseCategories,
} from './shared.js';

const STAGES = [
  { key: 'warn', label: '주의', tone: 'warn' },
  { key: 'alert', label: '경고', tone: 'alert' },
  { key: 'over', label: '초과', tone: 'over' },
];

function ringHtml(stage, value) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  const R = 15.9155;
  const C = 2 * Math.PI * R;
  const len = (pct / 100) * C;
  return `
    <div class="settings-limit-ring settings-limit-${stage.tone}">
      <svg viewBox="0 0 42 42">
        <circle cx="21" cy="21" r="${R}" fill="none" stroke="var(--border)" stroke-width="4"/>
        <circle cx="21" cy="21" r="${R}" fill="none" stroke="currentColor" stroke-width="4"
          stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(C / 4).toFixed(1)}" stroke-linecap="round"/>
      </svg>
      <div class="settings-limit-ring-center">
        <input class="settings-limit-input" inputmode="numeric" data-stage-default="${stage.key}" value="${value}" aria-label="${stage.label} 단계(%)">
        <em>%</em>
      </div>
      <span>${stage.label}</span>
    </div>
  `;
}

export const spendingLimitsScreen = {
  id: 'settings-screen-limits',
  title: '지출 한도 설정',

  async render() {
    const monthKey = fmtMonthKey(new Date());
    const appSettings = await getAppSettings();
    const { categoryDefault, basis, categoryOverrides } = appSettings.budgetAlerts;
    const categories = sortedExpenseCategories(getCategories());
    const perCategory = basis === 'per_category';

    return `
      ${sectionHtml('기본 경고 단계', `
        <div class="settings-limit-rings">
          ${STAGES.map(stage => ringHtml(stage, categoryDefault[stage.key])).join('')}
        </div>
      `)}

      ${sectionHtml('기본 기준', `
        <select class="tds-select settings-limit-basis" data-screen-field="basis" aria-label="한도 기준">
          <option value="common" ${basis === 'common' ? 'selected' : ''}>모든 카테고리에 기본 단계 사용</option>
          <option value="per_category" ${basis === 'per_category' ? 'selected' : ''}>카테고리별 개별 단계 사용</option>
        </select>
      `)}

      ${sectionHtml('카테고리별 기준', `
        <div class="settings-limit-list" data-limit-list ${perCategory ? '' : 'data-common'}>
          ${categories.map(cat => {
            const target = currentTarget(cat, monthKey);
            const stages = categoryOverrides[cat.id] || categoryDefault;
            return `
              <div class="settings-limit-row" data-limit-category-id="${escHtml(cat.id)}">
                <span class="settings-goal-emoji">${cat.emoji || '□'}</span>
                <div class="settings-goal-main">
                  <strong>${escHtml(cat.name)}</strong>
                  <small>${target ? `${fmtWon(target)} · 금액은 카테고리 목표에서 수정` : '목표 미설정'}</small>
                </div>
                <div class="settings-limit-stage-inputs">
                  ${STAGES.map(stage => `
                    <input class="settings-limit-input sm" inputmode="numeric"
                      data-stage-override="${stage.key}" value="${stages[stage.key]}"
                      aria-label="${escHtml(cat.name)} ${stage.label}(%)" ${perCategory ? '' : 'disabled'}>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <small class="settings-screen-note">단계는 카테고리 목표 대비 사용률(%) 기준이에요.</small>
      `)}

      ${primaryButtonHtml('save', '저장하기')}
    `;
  },

  bind(body, ctx) {
    markDirtyOnChange(body);

    body.querySelector('[data-screen-field="basis"]')?.addEventListener('change', event => {
      const perCategory = event.target.value === 'per_category';
      body.querySelectorAll('[data-stage-override]').forEach(input => {
        input.disabled = !perCategory;
      });
      body.querySelector('[data-limit-list]')?.toggleAttribute('data-common', !perCategory);
    });

    body.querySelector('[data-screen-action="save"]')?.addEventListener('click', async () => {
      const readPct = (input, fallback) => {
        const n = Math.round(Number(String(input?.value || '').replace(/[^\d]/g, '')));
        return Number.isFinite(n) && n > 0 ? n : fallback;
      };
      const categoryDefault = {
        warn: readPct(body.querySelector('[data-stage-default="warn"]'), 70),
        alert: readPct(body.querySelector('[data-stage-default="alert"]'), 90),
        over: readPct(body.querySelector('[data-stage-default="over"]'), 100),
      };
      const basis = body.querySelector('[data-screen-field="basis"]')?.value || 'common';
      const categoryOverrides = {};
      if (basis === 'per_category') {
        body.querySelectorAll('[data-limit-category-id]').forEach(row => {
          const stages = {
            warn: readPct(row.querySelector('[data-stage-override="warn"]'), categoryDefault.warn),
            alert: readPct(row.querySelector('[data-stage-override="alert"]'), categoryDefault.alert),
            over: readPct(row.querySelector('[data-stage-override="over"]'), categoryDefault.over),
          };
          // 기본값과 같으면 저장하지 않는다(오버라이드만 기록).
          if (stages.warn !== categoryDefault.warn || stages.alert !== categoryDefault.alert || stages.over !== categoryDefault.over) {
            categoryOverrides[row.dataset.limitCategoryId] = stages;
          }
        });
      }
      try {
        const current = await getAppSettings();
        await saveAppSettings({
          budgetAlerts: { ...current.budgetAlerts, categoryDefault, basis, categoryOverrides },
        });
        clearDirty(body);
        showToast('지출 한도를 저장했어요.', 1400, 'success');
        ctx.close();
      } catch (err) {
        showToast(err.message || '한도 저장 실패', 2400, 'error');
      }
    });
  },
};
