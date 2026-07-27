// ================================================================
// 설정 01 예산 — 기간·총액·카테고리 배정·한도를 한 화면에서 관리
//
// 예전에는 세 화면으로 쪼개져 있었고 서로 겹쳤다.
//   01 전체 예산      전체 금액 + 주기
//   02 카테고리 목표  전체 예산/배정 합계/미배정 + 카테고리별 금액
//   03 지출 한도      경고 % + 같은 카테고리 목록을 한 번 더(금액은 읽기 전용)
// 카테고리 목록이 두 번 나오고 '전체 예산'이 두 화면에 걸쳐 있어, 어디서 무엇을
// 고쳐야 하는지 알 수 없었다. 하나로 합치고 각 값은 한 곳에서만 편집한다.
//
// 저장 규칙: 화면 전체가 명시 저장(저장하기 한 번). 카테고리 목표는 바뀐 행만 쓴다.
// ================================================================

import {
  getAppSettings, saveAppSettings, getCategories, getProvisionFunds,
  listTransactions, aggregateByCategory, saveCategoryMonthlyTarget,
} from '../../../data.js';
import { summarizeBudget, currentTarget } from '../budget-goals/index.js';
import { budgetModelDetailsHtml } from '../budget-explainer/view.js';
import {
  BUDGET_CYCLES,
  cycleAmountFromMonthly,
  cycleAmountLabel,
  monthlyFromCycleAmount,
  periodLabelForCycle,
} from '../../../domain/budget/model.js';
import { buildSafeToSpendSummary } from '../../../domain/funds/provision.js';
import { allocateBudget } from '../../../domain/transactions/allocate.js';
import { cycleRangeForDate } from '../../../utils/cycles.js';
import { fmtMonthKey, fmtMonthLabel, monthRange } from '../../../utils/format.js';
import { showToast } from '../../../utils/toast.js';
import {
  escHtml, fmtWon, radioHtml, progressHtml, sectionHtml,
  primaryButtonHtml, markDirtyOnChange, clearDirty, sortedExpenseCategories,
} from './shared.js';

const STAGES = [
  { key: 'warn', label: '주의', tone: 'warn' },
  { key: 'alert', label: '경고', tone: 'alert' },
  { key: 'over', label: '초과', tone: 'over' },
];

const RHYTHM_BADGE = {
  fixed: { label: '고정비', tone: 'fixed' },
  front_loaded: { label: '월초', tone: 'front' },
  spread: { label: '변동비', tone: 'spread' },
};

function rhythmOf(category) {
  return category.budgetRhythm || 'spread';
}

// 사용률이 어느 한도 단계에 걸렸는지. '한도 알림 기준' 섹션의 %를 목록의 색으로
// 그대로 반영해, 같은 정보를 두 군데서 따로 읽지 않게 한다.
function limitToneFor(pct, stages) {
  if (pct >= (Number(stages.over) || 100)) return 'over';
  if (pct >= (Number(stages.alert) || 90)) return 'alert';
  if (pct >= (Number(stages.warn) || 70)) return 'warn';
  return '';
}

// 홈 히어로와 같은 산식으로 이 화면의 숫자를 만든다(두 화면이 다른 값을 말하지 않게).
function breakdownFor(appSettings, categories, monthTxs, cycleTxs) {
  const monthKey = fmtMonthKey(new Date());
  const cycle = appSettings.budget.cycle;
  const mode = cycle === 'monthly' ? 'month' : 'cycle';
  const control = categories.filter(cat => rhythmOf(cat) !== 'fixed');
  const fixed = categories.filter(cat => rhythmOf(cat) === 'fixed');
  const byCat = aggregateByCategory(mode === 'cycle' ? cycleTxs : monthTxs);
  const byCatMonth = aggregateByCategory(monthTxs);
  const usedOf = (cat, rows) => Number(rows.find(row => row.name === cat.name)?.expense) || 0;
  const periodTarget = cat => {
    const monthly = currentTarget(cat, monthKey);
    if (mode !== 'cycle') return monthly;
    return rhythmOf(cat) === 'front_loaded' ? monthly : Math.round(monthly / 2);
  };
  const budget = control.reduce((sum, cat) => sum + periodTarget(cat), 0);
  const spent = control.reduce((sum, cat) => sum + usedOf(cat, byCat), 0);
  const sts = buildSafeToSpendSummary({
    budgetTotal: budget,
    spentTotal: spent,
    funds: getProvisionFunds(),
    adjustments: [],
    mode,
    monthKey,
    cycleRange: cycleRangeForDate(new Date(), appSettings.biweeklyStartDate),
    controlCategoryNames: control.map(cat => cat.name),
    now: new Date(),
  });
  return {
    cycle,
    mode,
    budget,
    spent,
    provisions: sts.provisions,
    adjustments: sts.adjustments,
    amount: sts.amount,
    daysRemaining: sts.daysRemaining,
    perDay: sts.perDay,
    spentRatio: sts.spentRatio,
    fixedMonthly: fixed.reduce((sum, cat) => sum + usedOf(cat, byCatMonth), 0),
    usedByName: Object.fromEntries(byCatMonth.map(row => [row.name, row.expense])),
  };
}

// 총액을 따로 정하지 않으면 카테고리 목표의 합이 곧 총액이다. 이때 '배정 합계'를
// 또 적으면 바로 위 입력칸과 같은 숫자가 두 번 나온다 — 그 상태를 말로 알린다.
function assignLineHtml(explicitTotal, assigned, unassigned) {
  if (!explicitTotal) {
    return '총액을 비워두면 <b>카테고리 목표의 합</b>이 그대로 총액이 돼요.';
  }
  return `카테고리 배정 <b data-assigned>${fmtWon(assigned)}</b> · 미배정 <b class="${unassigned < 0 ? 'neg' : unassigned ? 'pos' : ''}" data-unassigned>${fmtWon(unassigned)}</b>`;
}

function limitRingHtml(stage, value) {
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
        <input class="settings-limit-input" inputmode="numeric" data-stage-default="${stage.key}" value="${pct}" aria-label="${stage.label} 단계(%)">
        <em>%</em>
      </div>
      <span>${stage.label}</span>
    </div>
  `;
}

// 카테고리 한 행에서 금액·성격·사용률·개별 한도를 모두 본다(예전엔 두 화면에 나뉘어 있었다).
function categoryRowHtml(cat, { monthKey, used, alerts, perCategory }) {
  const target = currentTarget(cat, monthKey);
  const pct = target > 0 ? Math.min(999, Math.round((used / target) * 100)) : 0;
  const badge = RHYTHM_BADGE[rhythmOf(cat)] || RHYTHM_BADGE.spread;
  const stages = alerts.categoryOverrides[cat.id] || alerts.categoryDefault;
  return `
    <div class="settings-budget-row" data-budget-category-id="${escHtml(cat.id)}">
      <span class="settings-goal-emoji">${cat.emoji || '□'}</span>
      <strong class="settings-budget-name">${escHtml(cat.name)}</strong>
      <input class="tds-input settings-budget-amount" inputmode="numeric" data-goal-target
        value="${target ? Math.round(target) : ''}" placeholder="0" aria-label="${escHtml(cat.name)} 월 목표(원)">
      <button type="button" class="tds-icon-btn sm" data-category-edit="${escHtml(cat.id)}" aria-label="${escHtml(cat.name)} 카테고리 수정">✎</button>
      <small class="settings-budget-meta">
        <span class="settings-rhythm-badge settings-rhythm-${badge.tone}">${badge.label}</span>
        <em>사용 ${fmtWon(used)}</em>
        ${target ? `<b class="settings-usage-${limitToneFor(pct, stages) || 'ok'}" data-usage-pct>${pct}%</b>` : ''}
      </small>
      <div class="settings-budget-stages" ${perCategory ? '' : 'hidden'}>
        ${STAGES.map(stage => `
          <label>
            <span>${stage.label}</span>
            <input class="settings-limit-input sm" inputmode="numeric"
              data-stage-override="${stage.key}" value="${stages[stage.key]}"
              aria-label="${escHtml(cat.name)} ${stage.label}(%)">
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

export const budgetOverallScreen = {
  id: 'settings-screen-budget',
  title: '예산',

  async render() {
    const monthKey = fmtMonthKey(new Date());
    const { start, end } = monthRange(monthKey);
    const appSettings = await getAppSettings();
    const cycleRange = cycleRangeForDate(new Date(), appSettings.biweeklyStartDate);
    const [monthTxs, cycleTxs] = await Promise.all([
      listTransactions({ from: start, to: end, max: 1000 }).catch(() => []),
      listTransactions({ from: cycleRange.start, to: cycleRange.end, max: 1000 }).catch(() => []),
    ]);
    const budget = appSettings.budget;
    const alerts = appSettings.budgetAlerts;
    const perCategory = alerts.basis === 'per_category';
    const categories = sortedExpenseCategories(getCategories());
    const targetsTotal = summarizeBudget(categories, monthKey).total;
    const monthlyBudget = budget.amount || targetsTotal;
    const bd = breakdownFor(appSettings, categories, monthTxs, cycleTxs);
    const periodLabel = periodLabelForCycle(budget.cycle);
    const spentPct = bd.budget > 0 ? Math.round((bd.spent / bd.budget) * 100) : 0;
    // 입력은 사용자가 고른 주기 단위로 받는다. 저장은 언제나 월 기준.
    const cycleAmount = cycleAmountFromMonthly(monthlyBudget, budget.cycle);
    const unassigned = monthlyBudget - targetsTotal;

    return `
      <div class="settings-screen-hero">
        <span>${escHtml(periodLabel)} 써도 되는 돈 · ${escHtml(fmtMonthLabel(monthKey))}</span>
        <strong class="${bd.amount < 0 ? 'neg' : ''}">${fmtWon(bd.amount)}</strong>
        ${progressHtml(spentPct, spentPct >= 100 ? 'warning' : '')}
        <small>${spentPct}% 사용 · 남은 ${bd.daysRemaining}일 · 하루 ${fmtWon(bd.perDay)} · 홈과 같은 숫자예요</small>
      </div>

      ${budgetModelDetailsHtml({
        cycle: bd.cycle,
        budget: bd.budget,
        provisions: bd.provisions,
        adjustments: bd.adjustments,
        spent: bd.spent,
        fixedMonthly: bd.fixedMonthly,
      })}

      ${sectionHtml('예산 기간', `
        <div class="settings-radio-group vertical">
          ${BUDGET_CYCLES.map(item => `
            <label class="settings-cycle-option ${budget.cycle === item.value ? 'active' : ''}">
              ${radioHtml('cycle', item.value, item.label, budget.cycle === item.value)}
              <small>${escHtml(item.hint)}</small>
            </label>
          `).join('')}
        </div>
        <div class="settings-input-row" data-cycle-detail="monthly" ${budget.cycle !== 'monthly' ? 'hidden' : ''}>
          <span>시작일</span>
          <select class="tds-select" data-screen-field="startDay" aria-label="매월 시작일">
            ${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${budget.startDay === i + 1 ? 'selected' : ''}>매월 ${i + 1}일</option>`).join('')}
          </select>
        </div>
        <div class="settings-input-row" data-cycle-detail="biweekly" ${budget.cycle === 'monthly' ? 'hidden' : ''}>
          <span>시작일</span>
          <input class="tds-input" type="date" data-screen-field="biweeklyStartDate" value="${escHtml(appSettings.biweeklyStartDate)}" aria-label="2주 사이클 시작일">
        </div>
        <small class="settings-screen-note">
          여기서 고른 주기가 <b>홈 화면의 기본 보기</b>이자 위젯이 쓰는 기간이에요.
          2주 시작일은 홈 상단의 기간 버튼과 같은 값입니다.
        </small>
      `)}

      ${sectionHtml('예산 총액과 배정', `
        <div class="settings-input-row">
          <input class="tds-input" inputmode="numeric" data-screen-field="amount"
            value="${budget.amount ? cycleAmount : ''}" placeholder="${cycleAmount || 0}" aria-label="예산 금액(원)">
          <span data-amount-unit>원 / ${escHtml(budget.cycle === 'monthly' ? '월' : '2주')}</span>
        </div>
        <div class="settings-budget-assign">
          <span><b data-amount-label>${escHtml(cycleAmountLabel(budget.cycle))}</b><em data-amount-converted>${budget.cycle === 'monthly' ? '' : ` · 월 환산 ${fmtWon(monthlyBudget)}`}</em></span>
          <span data-assign-line>${assignLineHtml(budget.amount, targetsTotal, unassigned)}</span>
        </div>
        <div class="settings-budget-list">
          ${categories.map(cat => categoryRowHtml(cat, {
            monthKey,
            used: bd.usedByName[cat.name] || 0,
            alerts,
            perCategory,
          })).join('')}
        </div>
        <div class="settings-budget-actions">
          <button type="button" class="tds-text-btn" data-screen-action="add-category">+ 카테고리 추가</button>
          <button type="button" class="tds-text-btn" data-screen-action="auto-allocate">자동 배분</button>
          <button type="button" class="tds-text-btn" data-screen-action="load-recent">↺ 최근 예산</button>
        </div>
        <small class="settings-screen-note">카테고리 금액은 <b>월 목표</b>예요. 성격(고정비/변동비/월초)은 ✎ 에서 바꿉니다.</small>
      `)}

      ${sectionHtml('한도 알림 기준', `
        <div class="settings-limit-rings">
          ${STAGES.map(stage => limitRingHtml(stage, alerts.categoryDefault[stage.key])).join('')}
        </div>
        <select class="tds-select settings-limit-basis" data-screen-field="basis" aria-label="한도 기준">
          <option value="common" ${alerts.basis === 'common' ? 'selected' : ''}>모든 카테고리에 기본 단계 사용</option>
          <option value="per_category" ${perCategory ? 'selected' : ''}>카테고리별 개별 단계 사용</option>
        </select>
        <small class="settings-screen-note">위 목록의 사용률 %가 이 단계에 따라 색으로 표시돼요. 개별 단계를 켜면 각 행에서 바로 조정합니다.</small>
      `)}

      ${primaryButtonHtml('save', '저장하기')}
    `;
  },

  bind(body, ctx) {
    markDirtyOnChange(body);
    const monthKey = fmtMonthKey(new Date());
    const field = name => body.querySelector(`[data-screen-field="${name}"]`);
    const checkedCycle = () => (body.querySelector('[data-screen-field="cycle"]:checked')?.value === 'monthly' ? 'monthly' : 'biweekly');
    const readAmount = input => Math.max(0, Math.round(Number(String(input?.value || '').replace(/[^\d]/g, '')) || 0));

    // 주기를 바꾸면 금액 입력의 단위 표기와 월 환산 안내도 함께 바뀐다.
    function syncAmountUnit() {
      const cycle = checkedCycle();
      const monthly = monthlyFromCycleAmount(readAmount(field('amount')), cycle);
      const unit = body.querySelector('[data-amount-unit]');
      const label = body.querySelector('[data-amount-label]');
      const converted = body.querySelector('[data-amount-converted]');
      if (unit) unit.textContent = `원 / ${cycle === 'monthly' ? '월' : '2주'}`;
      if (label) label.textContent = cycleAmountLabel(cycle);
      if (converted) converted.textContent = cycle === 'monthly' ? '' : ` · 월 환산 ${fmtWon(monthly)}`;
    }

    function syncTotals() {
      const typed = readAmount(field('amount'));
      const monthly = monthlyFromCycleAmount(typed, checkedCycle());
      const assigned = [...body.querySelectorAll('[data-goal-target]')]
        .reduce((sum, input) => sum + readAmount(input), 0);
      const line = body.querySelector('[data-assign-line]');
      if (line) line.innerHTML = assignLineHtml(typed, assigned, monthly - assigned);
    }

    body.querySelectorAll('[data-screen-field="cycle"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const cycle = checkedCycle();
        body.querySelectorAll('[data-cycle-detail]').forEach(el => {
          el.hidden = el.dataset.cycleDetail !== cycle;
        });
        body.querySelectorAll('.settings-cycle-option').forEach(label => {
          label.classList.toggle('active', !!label.querySelector('input')?.checked);
        });
        syncAmountUnit();
        syncTotals();
      });
    });

    field('amount')?.addEventListener('input', () => {
      syncAmountUnit();
      syncTotals();
    });

    body.querySelectorAll('[data-goal-target]').forEach(input => {
      input.addEventListener('input', syncTotals);
    });

    // 개별 단계 토글 — 카테고리 목록을 한 벌만 두고 여기서 열고 닫는다.
    field('basis')?.addEventListener('change', event => {
      const perCategory = event.target.value === 'per_category';
      body.querySelectorAll('.settings-budget-stages').forEach(el => { el.hidden = !perCategory; });
    });

    body.querySelectorAll('[data-category-edit]').forEach(btn => {
      btn.addEventListener('click', () => window.openCategoryModal?.(btn.dataset.categoryEdit));
    });

    body.querySelector('[data-screen-action="add-category"]')?.addEventListener('click', () => {
      window.openCategoryModal?.();
    });

    body.querySelector('[data-screen-action="load-recent"]')?.addEventListener('click', async () => {
      const appSettings = await getAppSettings();
      const previous = appSettings.budget.amount
        || summarizeBudget(sortedExpenseCategories(getCategories()), monthKey).total;
      if (!previous) {
        showToast('불러올 최근 예산이 없어요.', 1600, 'info');
        return;
      }
      const input = field('amount');
      input.value = cycleAmountFromMonthly(previous, checkedCycle());
      input.dispatchEvent(new Event('input', { bubbles: true }));
      showToast('최근 예산을 불러왔어요.', 1400, 'success');
    });

    body.querySelector('[data-screen-action="auto-allocate"]')?.addEventListener('click', async () => {
      const managed = sortedExpenseCategories(getCategories()).filter(cat => cat.autoManaged !== false);
      const totalBudget = monthlyFromCycleAmount(readAmount(field('amount')), checkedCycle())
        || summarizeBudget(managed, monthKey).total;
      if (!totalBudget) {
        showToast('먼저 예산 총액을 입력해주세요.', 2000, 'info');
        return;
      }
      const { start, end } = monthRange(monthKey);
      const monthTxs = await listTransactions({ from: start, to: end, max: 1000 }).catch(() => []);
      const usedByName = Object.fromEntries(aggregateByCategory(monthTxs).map(row => [row.name, row.expense]));
      const weights = managed.map(cat => ({
        id: cat.id,
        weight: usedByName[cat.name] || currentTarget(cat, monthKey) || 1,
      }));
      const allocation = allocateBudget(totalBudget, weights);
      if (!window.confirm(`예산 ${fmtWon(totalBudget)}을 자동 관리 카테고리 ${managed.length}개에 최근 사용 비중대로 배분할까요? 입력한 목표가 대체됩니다.`)) return;
      // 바로 저장하지 않고 입력값만 채운다 — 확인 후 '저장하기'로 확정.
      for (const cat of managed) {
        const input = body.querySelector(`[data-budget-category-id="${cat.id}"] [data-goal-target]`);
        if (input && allocation[cat.id] != null) input.value = Math.round(allocation[cat.id]);
      }
      syncTotals();
      showToast('자동 배분을 채웠어요. 저장하기를 눌러 확정하세요.', 2600, 'info');
    });

    body.querySelector('[data-screen-action="save"]')?.addEventListener('click', async () => {
      const button = body.querySelector('[data-screen-action="save"]');
      if (button.disabled) return;
      const cycle = checkedCycle();
      const readPct = (input, fallback) => {
        const n = Math.round(Number(String(input?.value || '').replace(/[^\d]/g, '')));
        return Number.isFinite(n) && n > 0 ? n : fallback;
      };
      const categoryDefault = {
        warn: readPct(body.querySelector('[data-stage-default="warn"]'), 70),
        alert: readPct(body.querySelector('[data-stage-default="alert"]'), 90),
        over: readPct(body.querySelector('[data-stage-default="over"]'), 100),
      };
      const basis = field('basis')?.value === 'per_category' ? 'per_category' : 'common';
      const categoryOverrides = {};
      if (basis === 'per_category') {
        body.querySelectorAll('[data-budget-category-id]').forEach(row => {
          const stages = {
            warn: readPct(row.querySelector('[data-stage-override="warn"]'), categoryDefault.warn),
            alert: readPct(row.querySelector('[data-stage-override="alert"]'), categoryDefault.alert),
            over: readPct(row.querySelector('[data-stage-override="over"]'), categoryDefault.over),
          };
          // 기본값과 같으면 저장하지 않는다(오버라이드만 기록).
          if (stages.warn !== categoryDefault.warn || stages.alert !== categoryDefault.alert || stages.over !== categoryDefault.over) {
            categoryOverrides[row.dataset.budgetCategoryId] = stages;
          }
        });
      }
      button.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = '저장 중…';
      try {
        const current = await getAppSettings();
        await saveAppSettings({
          budget: {
            amount: monthlyFromCycleAmount(readAmount(field('amount')), cycle),
            cycle,
            startDay: Number(field('startDay')?.value) || 1,
            customStartDate: '',
          },
          ...(cycle === 'biweekly' ? { biweeklyStartDate: String(field('biweeklyStartDate')?.value || '').trim() } : {}),
          budgetAlerts: { ...current.budgetAlerts, categoryDefault, basis, categoryOverrides },
        });
        // 카테고리 목표는 바뀐 행만 저장한다.
        for (const cat of sortedExpenseCategories(getCategories())) {
          const input = body.querySelector(`[data-budget-category-id="${cat.id}"] [data-goal-target]`);
          if (!input) continue;
          const next = readAmount(input);
          if (next === Math.round(currentTarget(cat, monthKey))) continue;
          await saveCategoryMonthlyTarget(cat.id, monthKey, next);
        }
        clearDirty(body);
        showToast('예산을 저장했어요.', 1400, 'success');
        window.refreshCurrentTab?.();
        ctx.close();
      } catch (err) {
        showToast(err.message || '예산 저장 실패', 2400, 'error');
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  },
};
