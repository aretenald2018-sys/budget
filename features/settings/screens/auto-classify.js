// ================================================================
// 설정 08 자동 분류 — 즉시 반영 화면
// 규칙 목록 순서 = 우선순위(위가 먼저 매칭). 평가는 domain/transactions/classify.js.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-08
// ================================================================

import { getAppSettings, saveAppSettings, getCategories, listTransactions } from '../../../data.js';
import { ruleSummary } from '../../../domain/transactions/classify.js';
import { showToast } from '../../../utils/toast.js';
import { escHtml, switchHtml, sectionHtml, sortedExpenseCategories } from './shared.js';

let editingRuleId = null; // null = 폼 닫힘, '' = 새 규칙, 'rule_x' = 해당 규칙 편집

// 규칙이 하나도 없으면 카테고리 autoMatch 키워드에서 시드 후보를 만든다(저장 전 표시용).
function seedRulesFromCategories(categories) {
  const rules = [];
  for (const cat of categories) {
    const keyword = Array.isArray(cat.autoMatch) ? cat.autoMatch[0] : '';
    if (!keyword) continue;
    rules.push({
      id: `seed_${cat.id}`,
      type: 'keyword',
      keyword,
      minAmount: 0,
      maxAmount: 0,
      categoryName: cat.name,
      subcategory: '',
    });
    if (rules.length >= 5) break;
  }
  return rules;
}

function ruleFormHtml(rule, categories) {
  const isKeyword = !rule || rule.type !== 'amount';
  return `
    <div class="settings-rule-form" data-rule-form>
      <div class="settings-input-row">
        <select class="tds-select" data-rule-field="type" aria-label="규칙 종류">
          <option value="keyword" ${isKeyword ? 'selected' : ''}>거래명 키워드</option>
          <option value="amount" ${!isKeyword ? 'selected' : ''}>금액 조건</option>
        </select>
        <select class="tds-select" data-rule-field="categoryName" aria-label="분류할 카테고리">
          ${categories.map(cat => `<option value="${escHtml(cat.name)}" ${rule?.categoryName === cat.name ? 'selected' : ''}>${cat.emoji || ''} ${escHtml(cat.name)}</option>`).join('')}
        </select>
      </div>
      <div class="settings-input-row" data-rule-detail="keyword" ${isKeyword ? '' : 'hidden'}>
        <input class="tds-input" data-rule-field="keyword" value="${escHtml(rule?.keyword || '')}" placeholder="예: 스타벅스" aria-label="키워드">
      </div>
      <div class="settings-input-row" data-rule-detail="amount" ${isKeyword ? 'hidden' : ''}>
        <input class="tds-input" inputmode="numeric" data-rule-field="minAmount" value="${rule?.minAmount || ''}" placeholder="최소(원)" aria-label="최소 금액">
        <span>~</span>
        <input class="tds-input" inputmode="numeric" data-rule-field="maxAmount" value="${rule?.maxAmount || ''}" placeholder="최대 미만(원)" aria-label="최대 금액">
      </div>
      <div class="settings-screen-cta-row">
        <button type="button" class="tds-btn sm" data-screen-action="save-rule">저장</button>
        <button type="button" class="tds-btn sm secondary" data-screen-action="cancel-rule">취소</button>
      </div>
    </div>
  `;
}

export const autoClassifyScreen = {
  id: 'settings-screen-classify',
  title: '자동 분류',

  async render() {
    const appSettings = await getAppSettings();
    const autoClassify = appSettings.autoClassify;
    const categories = sortedExpenseCategories(getCategories());
    const rules = autoClassify.rules.length ? autoClassify.rules : seedRulesFromCategories(categories);
    const seeded = !autoClassify.rules.length && rules.length > 0;
    const reviewTxs = await listTransactions({ needsReview: true, max: 100 }).catch(() => []);
    const editingRule = editingRuleId ? rules.find(rule => rule.id === editingRuleId) : null;

    return `
      ${sectionHtml('자동 분류 사용', `
        <div class="settings-toggle-list">
          <div class="settings-toggle-row"><span>자동 분류 사용</span>${switchHtml('enabled', autoClassify.enabled)}</div>
          <div class="settings-toggle-row"><span>분류 방식</span>
            <select class="tds-select" data-screen-field="method" aria-label="분류 방식">
              <option value="all" ${autoClassify.method === 'all' ? 'selected' : ''}>모든 거래 자동 분류</option>
              <option value="high_confidence" ${autoClassify.method === 'high_confidence' ? 'selected' : ''}>높은 확률 거래만 자동 분류</option>
            </select>
          </div>
          <div class="settings-toggle-row"><span>확신도 기준</span>
            <select class="tds-select" data-screen-field="confidence" aria-label="확신도 기준">
              <option value="strict" ${autoClassify.confidence === 'strict' ? 'selected' : ''}>엄격</option>
              <option value="balanced" ${autoClassify.confidence === 'balanced' ? 'selected' : ''}>균형</option>
              <option value="loose" ${autoClassify.confidence === 'loose' ? 'selected' : ''}>느슨</option>
            </select>
          </div>
        </div>
      `)}

      ${sectionHtml('사용자 규칙', `
        ${seeded ? '<small class="settings-screen-note">카테고리 키워드에서 추천 규칙을 만들었어요. 저장하면 내 규칙이 됩니다.</small>' : ''}
        <div class="settings-goal-list" data-rule-list>
          ${rules.map((rule, index) => `
            <div class="settings-goal-row" data-rule-row="${escHtml(rule.id)}">
              <span class="settings-order-btns">
                <button type="button" class="tds-icon-btn sm" data-rule-move="up" data-rule-id="${escHtml(rule.id)}" ${index === 0 ? 'disabled' : ''} aria-label="규칙 위로">▲</button>
                <button type="button" class="tds-icon-btn sm" data-rule-move="down" data-rule-id="${escHtml(rule.id)}" ${index === rules.length - 1 ? 'disabled' : ''} aria-label="규칙 아래로">▼</button>
              </span>
              <div class="settings-goal-main">
                <strong>${escHtml(ruleSummary(rule))}</strong>
                <small>→ ${escHtml(rule.categoryName)}${rule.subcategory ? ` · ${escHtml(rule.subcategory)}` : ''}</small>
              </div>
              <button type="button" class="tds-icon-btn sm" data-rule-edit="${escHtml(rule.id)}" aria-label="규칙 수정">✎</button>
              <button type="button" class="tds-icon-btn sm" data-rule-delete="${escHtml(rule.id)}" aria-label="규칙 삭제">✕</button>
            </div>
          `).join('') || '<div class="settings-screen-empty">규칙이 없어요. 규칙을 추가하면 거래가 자동 분류돼요.</div>'}
        </div>
        ${editingRuleId != null ? ruleFormHtml(editingRule, categories) : '<button type="button" class="tds-text-btn" data-screen-action="add-rule">+ 규칙 추가</button>'}
        <small class="settings-screen-note">위에 있는 규칙이 먼저 적용돼요(순서 = 우선순위).</small>
      `)}

      ${sectionHtml('검토 필요 거래', `
        <div class="settings-row">
          <div class="l"><div><div class="name">낮은 확신도로 분류된 거래</div><div class="desc">직접 확인하면 분류가 더 정확해져요</div></div></div>
          <div class="r">${reviewTxs.length}건</div>
        </div>
      `)}

      <button type="button" class="tds-btn settings-screen-cta" data-settings-action="navigate" data-tab="review">검토하기</button>
    `;
  },

  bind(body, ctx) {
    const saveSettings = async patch => {
      const current = await getAppSettings();
      await saveAppSettings({ autoClassify: { ...current.autoClassify, ...patch } });
    };

    body.querySelector('[data-screen-field="enabled"]')?.addEventListener('change', async event => {
      await saveSettings({ enabled: event.target.checked });
      showToast(event.target.checked ? '자동 분류를 켰어요.' : '자동 분류를 껐어요.', 1000, 'success');
    });
    body.querySelector('[data-screen-field="method"]')?.addEventListener('change', async event => {
      await saveSettings({ method: event.target.value });
      showToast('분류 방식을 저장했어요.', 1000, 'success');
    });
    body.querySelector('[data-screen-field="confidence"]')?.addEventListener('change', async event => {
      await saveSettings({ confidence: event.target.value });
      showToast('확신도 기준을 저장했어요.', 1000, 'success');
    });

    const currentRules = async () => {
      const current = await getAppSettings();
      if (current.autoClassify.rules.length) return current.autoClassify.rules;
      return seedRulesFromCategories(sortedExpenseCategories(getCategories()));
    };

    body.querySelector('[data-screen-action="add-rule"]')?.addEventListener('click', () => {
      editingRuleId = '';
      ctx.refresh();
    });
    body.querySelectorAll('[data-rule-edit]').forEach(btn => {
      btn.addEventListener('click', () => {
        editingRuleId = btn.dataset.ruleEdit;
        ctx.refresh();
      });
    });
    body.querySelector('[data-screen-action="cancel-rule"]')?.addEventListener('click', () => {
      editingRuleId = null;
      ctx.refresh();
    });

    body.querySelector('[data-rule-form] [data-rule-field="type"]')?.addEventListener('change', event => {
      const isKeyword = event.target.value === 'keyword';
      body.querySelector('[data-rule-detail="keyword"]')?.toggleAttribute('hidden', !isKeyword);
      body.querySelector('[data-rule-detail="amount"]')?.toggleAttribute('hidden', isKeyword);
    });

    body.querySelector('[data-screen-action="save-rule"]')?.addEventListener('click', async () => {
      const form = body.querySelector('[data-rule-form]');
      const field = name => form?.querySelector(`[data-rule-field="${name}"]`)?.value || '';
      const type = field('type') === 'amount' ? 'amount' : 'keyword';
      const rule = {
        id: editingRuleId || `rule_${Math.random().toString(36).slice(2, 8)}`,
        type,
        keyword: field('keyword').trim(),
        minAmount: Math.max(0, Math.round(Number(String(field('minAmount')).replace(/[^\d]/g, '')) || 0)),
        maxAmount: Math.max(0, Math.round(Number(String(field('maxAmount')).replace(/[^\d]/g, '')) || 0)),
        categoryName: field('categoryName'),
        subcategory: '',
      };
      if (type === 'keyword' && !rule.keyword) {
        showToast('키워드를 입력해주세요.', 1800, 'error');
        return;
      }
      if (type === 'amount' && !rule.minAmount && !rule.maxAmount) {
        showToast('금액 조건을 입력해주세요.', 1800, 'error');
        return;
      }
      const rules = await currentRules();
      const index = rules.findIndex(r => r.id === rule.id);
      const next = index >= 0 ? rules.map(r => (r.id === rule.id ? rule : r)) : [...rules, rule];
      try {
        await saveSettings({ rules: next });
        editingRuleId = null;
        showToast('규칙을 저장했어요.', 1200, 'success');
        ctx.refresh();
      } catch (err) {
        showToast(err.message || '규칙 저장 실패', 2400, 'error');
      }
    });

    body.querySelectorAll('[data-rule-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rules = await currentRules();
        try {
          await saveSettings({ rules: rules.filter(rule => rule.id !== btn.dataset.ruleDelete) });
          showToast('규칙을 삭제했어요.', 1200, 'success');
          ctx.refresh();
        } catch (err) {
          showToast(err.message || '규칙 삭제 실패', 2400, 'error');
        }
      });
    });

    body.querySelectorAll('[data-rule-move]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const rules = await currentRules();
        const index = rules.findIndex(rule => rule.id === btn.dataset.ruleId);
        const target = btn.dataset.ruleMove === 'up' ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= rules.length) return;
        const next = rules.slice();
        [next[index], next[target]] = [next[target], next[index]];
        try {
          await saveSettings({ rules: next });
          ctx.refresh();
        } catch (err) {
          showToast(err.message || '순서 변경 실패', 2400, 'error');
        }
      });
    });
  },
};
