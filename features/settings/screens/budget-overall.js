// ================================================================
// 설정 01 예산 — 변동비 예산 하나를 정하고, 그 안에서 항목별 상한을 건다
//
// 이 화면이 예전에 헷갈렸던 이유는 세 가지였다.
//   1) 고정비(월세·통신비)가 변동비와 같은 목록에 섞여 있었다. 그런데 정작
//      '써도 되는 돈' 계산에서는 고정비가 빠지니, 목록의 합과 화면 맨 위 숫자가
//      아무리 봐도 이어지지 않았다.
//   2) '미배정' = 총액 − 카테고리 목표 합. 총액과 카테고리 목표가 서로 무슨
//      관계인지 말해주지 않은 채 그 차액만 보여주니 무슨 뜻인지 알 수 없었다.
//   3) '자동 배분'이 사용자가 직접 정해둔 상한을 최근 사용 비중으로 덮어썼다.
//      상한은 내가 정하는 것인데 앱이 다시 나눠주는 게 앞뒤가 맞지 않았다.
//
// 그래서 이렇게 정리했다.
//   · 예산은 변동비에만 건다. 금액 입력은 하나(한 달 또는 2주 단위).
//   · 고정비는 '예산 밖' 별도 구역에서 금액만 기록한다.
//   · 카테고리 상한은 선택. 합이 예산과 같을 필요 없고, 넘을 때만 알려준다.
//   · 자동 배분 제거. '최근 예산' 버튼도 제거(입력칸에 이미 같은 값이 있었다).
//
// 저장 규칙: 화면 전체가 명시 저장(저장하기 한 번). 카테고리 금액은 바뀐 행만 쓴다.
// ================================================================

import {
  getAppSettings, saveAppSettings, getCategories, getProvisionFunds,
  listTransactions, aggregateByCategory, saveCategoryMonthlyTarget,
} from '../../../data.js';
import { currentTarget } from '../budget-goals/index.js';
import { budgetModelDetailsHtml } from '../budget-explainer/view.js';
import {
  BUDGET_CYCLES,
  cycleAmountFromMonthly,
  cycleAmountLabel,
  monthlyFromCycleAmount,
  periodLabelForCycle,
  variableBudgetForPeriod,
} from '../../../domain/budget/model.js';
import { buildSafeToSpendSummary } from '../../../domain/funds/provision.js';
import { cycleRangeForDate } from '../../../utils/cycles.js';
import { fmtMonthKey, monthRange } from '../../../utils/format.js';
import { showToast } from '../../../utils/toast.js';
import {
  escHtml, fmtWon, progressHtml, sectionHtml,
  primaryButtonHtml, markDirtyOnChange, clearDirty, sortedExpenseCategories,
} from './shared.js';

const STAGES = [
  { key: 'warn', label: '주의', tone: 'warn', fallback: 70 },
  { key: 'alert', label: '경고', tone: 'alert', fallback: 90 },
  { key: 'over', label: '초과', tone: 'over', fallback: 100 },
];

function rhythmOf(category) {
  return category.budgetRhythm || 'spread';
}

function isFixed(category) {
  return rhythmOf(category) === 'fixed';
}

// 사용률이 어느 한도 단계에 걸렸는지. '한도 알림'의 %를 목록의 색으로 그대로
// 반영해, 같은 정보를 두 군데서 따로 읽지 않게 한다.
function limitToneFor(pct, stages) {
  if (pct >= (Number(stages.over) || 100)) return 'over';
  if (pct >= (Number(stages.alert) || 90)) return 'alert';
  if (pct >= (Number(stages.warn) || 70)) return 'warn';
  return 'ok';
}

// 홈 히어로와 같은 산식으로 이 화면의 숫자를 만든다(두 화면이 다른 값을 말하지 않게).
function breakdownFor(appSettings, variable, fixed, monthKey, monthTxs, cycleTxs) {
  const cycle = appSettings.budget.cycle;
  const mode = cycle === 'monthly' ? 'month' : 'cycle';
  const byCat = aggregateByCategory(mode === 'cycle' ? cycleTxs : monthTxs);
  const byCatMonth = aggregateByCategory(monthTxs);
  const usedOf = (cat, rows) => Number(rows.find(row => row.name === cat.name)?.expense) || 0;
  const periodTarget = cat => {
    const monthly = currentTarget(cat, monthKey);
    if (mode !== 'cycle') return monthly;
    return rhythmOf(cat) === 'front_loaded' ? monthly : Math.round(monthly / 2);
  };
  const budget = variableBudgetForPeriod({
    explicitMonthly: appSettings.budget.amount,
    fallbackPeriodTotal: variable.reduce((sum, cat) => sum + periodTarget(cat), 0),
    mode,
  });
  const spent = variable.reduce((sum, cat) => sum + usedOf(cat, byCat), 0);
  const sts = buildSafeToSpendSummary({
    budgetTotal: budget,
    spentTotal: spent,
    funds: getProvisionFunds(),
    adjustments: [],
    mode,
    monthKey,
    cycleRange: cycleRangeForDate(new Date(), appSettings.biweeklyStartDate),
    controlCategoryNames: variable.map(cat => cat.name),
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
    fixedMonthly: fixed.reduce((sum, cat) => sum + usedOf(cat, byCatMonth), 0),
    usedByName: Object.fromEntries(byCatMonth.map(row => [row.name, row.expense])),
  };
}

// 상한 합계와 예산의 관계를 '미배정' 같은 조어 없이 한 문장으로 말한다.
// 상한은 선택이므로 남는 금액은 문제가 아니다 — 넘을 때만 경고한다.
//
// 예산을 비워두면 상한 합계가 곧 예산이므로 '예산의 100%' 같은 자기 자신을
// 가리키는 말이 나온다. 그 상태는 비율 대신 그 사실을 그대로 적는다.
function capsLineHtml(explicitMonthly, capsTotal) {
  if (!capsTotal) {
    return '항목별 상한은 <b>선택</b>이에요. 비워두면 예산 안에서 자유롭게 씁니다.';
  }
  if (!explicitMonthly) {
    return `상한 합계 <b>${fmtWon(capsTotal)}</b> · 위 예산이 비어 있어 이 합계가 예산이 돼요.`;
  }
  if (capsTotal > explicitMonthly) {
    return `<span class="neg">상한 합계가 예산보다 <b>${fmtWon(capsTotal - explicitMonthly)}</b> 많아요.</span>`;
  }
  return `상한 합계 <b>${fmtWon(capsTotal)}</b> · 예산의 ${Math.round((capsTotal / explicitMonthly) * 100)}%`;
}

// 변동비 한 행: 이모지 · 이름 · 월 상한 · 이번 달 사용률. (개별 단계는 켰을 때만)
function variableRowHtml(cat, { monthKey, used, alerts, perCategory }) {
  const target = currentTarget(cat, monthKey);
  const pct = target > 0 ? Math.min(999, Math.round((used / target) * 100)) : 0;
  const stages = alerts.categoryOverrides[cat.id] || alerts.categoryDefault;
  return `
    <div class="settings-budget-row" data-budget-category-id="${escHtml(cat.id)}">
      <span class="settings-goal-emoji">${cat.emoji || '□'}</span>
      <strong class="settings-budget-name">${escHtml(cat.name)}</strong>
      <input class="tds-input settings-budget-amount" inputmode="numeric" data-goal-target
        value="${target ? Math.round(target) : ''}" placeholder="상한 없음" aria-label="${escHtml(cat.name)} 월 상한(원)">
      <button type="button" class="tds-icon-btn sm" data-category-edit="${escHtml(cat.id)}" aria-label="${escHtml(cat.name)} 카테고리 수정">✎</button>
      <small class="settings-budget-meta">
        <em>${fmtWon(used)} 씀</em>
        ${target ? `<b class="settings-usage-${limitToneFor(pct, stages)}" data-usage-pct>${pct}%</b>` : ''}
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

// 고정비 한 행: 예산 밖이므로 사용률·상한 색이 없다. 월 고정 금액만 기록한다.
function fixedRowHtml(cat, { monthKey, used }) {
  const target = currentTarget(cat, monthKey);
  return `
    <div class="settings-budget-row fixed" data-budget-category-id="${escHtml(cat.id)}">
      <span class="settings-goal-emoji">${cat.emoji || '□'}</span>
      <strong class="settings-budget-name">${escHtml(cat.name)}</strong>
      <input class="tds-input settings-budget-amount" inputmode="numeric" data-goal-target
        value="${target ? Math.round(target) : ''}" placeholder="0" aria-label="${escHtml(cat.name)} 월 고정 금액(원)">
      <button type="button" class="tds-icon-btn sm" data-category-edit="${escHtml(cat.id)}" aria-label="${escHtml(cat.name)} 카테고리 수정">✎</button>
      <small class="settings-budget-meta"><em>${fmtWon(used)} 씀</em></small>
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
    const variable = categories.filter(cat => !isFixed(cat));
    const fixed = categories.filter(isFixed);
    // 상한 합계는 변동비만 센다 — 고정비는 예산 밖이라 합계에 섞이면 안 된다.
    const capsTotal = variable.reduce((sum, cat) => sum + currentTarget(cat, monthKey), 0);
    const monthlyBudget = budget.amount || capsTotal;
    const bd = breakdownFor(appSettings, variable, fixed, monthKey, monthTxs, cycleTxs);
    const periodLabel = periodLabelForCycle(budget.cycle);
    const spentPct = bd.budget > 0 ? Math.round((bd.spent / bd.budget) * 100) : 0;
    // 입력은 사용자가 고른 주기 단위로 받는다. 저장은 언제나 월 기준.
    const cycleAmount = cycleAmountFromMonthly(monthlyBudget, budget.cycle);
    const capsPct = monthlyBudget > 0 ? Math.round((capsTotal / monthlyBudget) * 100) : 0;

    return `
      <div class="settings-screen-hero compact">
        <span>${escHtml(periodLabel)} 써도 되는 돈</span>
        <strong class="${bd.amount < 0 ? 'neg' : ''}">${fmtWon(bd.amount)}</strong>
        ${progressHtml(spentPct, spentPct >= 100 ? 'warning' : '')}
        <small>${spentPct}% 사용 · 남은 ${bd.daysRemaining}일 · 하루 ${fmtWon(bd.perDay)}</small>
      </div>

      ${budgetModelDetailsHtml({
        cycle: bd.cycle,
        budget: bd.budget,
        provisions: bd.provisions,
        adjustments: bd.adjustments,
        spent: bd.spent,
        fixedMonthly: bd.fixedMonthly,
      })}

      ${sectionHtml('변동비 예산', `
        <div class="settings-segmented" role="radiogroup" aria-label="예산 기간">
          ${BUDGET_CYCLES.map(item => `
            <label class="${budget.cycle === item.value ? 'active' : ''}">
              <input type="radio" name="cycle" value="${item.value}" data-screen-field="cycle" ${budget.cycle === item.value ? 'checked' : ''}>
              <span>${escHtml(item.label)}</span>
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
        <div class="settings-input-row">
          <span data-amount-label>${escHtml(cycleAmountLabel(budget.cycle))}</span>
          <input class="tds-input" inputmode="numeric" data-screen-field="amount"
            value="${budget.amount ? cycleAmount : ''}" placeholder="${cycleAmount || 0}" aria-label="변동비 예산(원)">
        </div>
        <small class="settings-screen-note">
          고정비를 뺀 <b>내가 조절할 수 있는 돈</b>만 적어요.<span data-amount-converted>${budget.amount && budget.cycle !== 'monthly' ? ` 월 환산 ${fmtWon(monthlyBudget)}.` : ''}</span>
        </small>
      `)}

      ${sectionHtml('항목별 상한 (선택)', `
        <div class="settings-caps-line">
          <div data-caps-bar ${budget.amount ? '' : 'hidden'}>${progressHtml(capsPct, capsTotal > monthlyBudget ? 'warning' : '')}</div>
          <span data-caps-line>${capsLineHtml(budget.amount, capsTotal)}</span>
        </div>
        <div class="settings-budget-list">
          ${variable.map(cat => variableRowHtml(cat, {
            monthKey,
            used: bd.usedByName[cat.name] || 0,
            alerts,
            perCategory,
          })).join('')}
        </div>
        <button type="button" class="tds-text-btn" data-screen-action="add-category">+ 카테고리 추가</button>
        <small class="settings-screen-note">금액은 <b>월 상한</b>이에요. 2주 예산이면 절반씩 나눠 봅니다.</small>
      `)}

      ${fixed.length ? sectionHtml('고정비 · 예산 밖', `
        <div class="settings-budget-list">
          ${fixed.map(cat => fixedRowHtml(cat, { monthKey, used: bd.usedByName[cat.name] || 0 })).join('')}
        </div>
        <small class="settings-screen-note">
          <b>이미 나갈 게 정해진 돈</b>이라 위 예산에 넣지 않아요. 이번 달 ${fmtWon(bd.fixedMonthly)} 나갔어요.
        </small>
      `) : ''}

      ${sectionHtml('한도 알림', `
        <div class="settings-stage-row">
          ${STAGES.map(stage => `
            <label class="settings-stage-chip settings-limit-${stage.tone}">
              <span>${stage.label}</span>
              <input class="settings-limit-input" inputmode="numeric"
                data-stage-default="${stage.key}" value="${alerts.categoryDefault[stage.key]}" aria-label="${stage.label} 단계(%)">
              <em>%</em>
            </label>
          `).join('')}
        </div>
        <select class="tds-select settings-limit-basis" data-screen-field="basis" aria-label="한도 기준">
          <option value="common" ${alerts.basis === 'common' ? 'selected' : ''}>모든 카테고리에 같은 단계 적용</option>
          <option value="per_category" ${perCategory ? 'selected' : ''}>카테고리별로 따로 정하기</option>
        </select>
        <small class="settings-screen-note">위 목록의 사용률 %가 이 단계에 따라 색으로 표시돼요.</small>
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

    // 상한 합계는 변동비 행만 센다. 고정비 행은 예산 밖이라 합계에 넣지 않는다.
    const capInputs = () => [...body.querySelectorAll('.settings-budget-row:not(.fixed) [data-goal-target]')];

    function syncBudgetLines() {
      const cycle = checkedCycle();
      const capsTotal = capInputs().reduce((sum, input) => sum + readAmount(input), 0);
      const explicitMonthly = monthlyFromCycleAmount(readAmount(field('amount')), cycle);
      const label = body.querySelector('[data-amount-label]');
      const converted = body.querySelector('[data-amount-converted]');
      const line = body.querySelector('[data-caps-line]');
      const barBox = body.querySelector('[data-caps-bar]');
      const bar = barBox?.querySelector('.tds-progress-fill');
      if (label) label.textContent = cycleAmountLabel(cycle);
      // 예산을 비워두면 '월 환산' 값이 바로 아래 상한 합계와 같은 숫자가 된다 — 그때는 안 적는다.
      if (converted) converted.textContent = explicitMonthly && cycle !== 'monthly' ? ` 월 환산 ${fmtWon(explicitMonthly)}.` : '';
      if (line) line.innerHTML = capsLineHtml(explicitMonthly, capsTotal);
      // 예산을 비워두면 비율이 항상 100% 라 막대가 의미를 잃는다 — 그때는 감춘다.
      if (barBox) barBox.hidden = !explicitMonthly;
      if (bar && explicitMonthly) {
        const pct = Math.min(100, Math.round((capsTotal / explicitMonthly) * 100));
        bar.style.transform = `scaleX(${(pct / 100).toFixed(3)})`;
        bar.classList.toggle('warning', capsTotal > explicitMonthly);
      }
    }

    body.querySelectorAll('[data-screen-field="cycle"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const cycle = checkedCycle();
        body.querySelectorAll('[data-cycle-detail]').forEach(el => {
          el.hidden = el.dataset.cycleDetail !== cycle;
        });
        body.querySelectorAll('.settings-segmented label').forEach(label => {
          label.classList.toggle('active', !!label.querySelector('input')?.checked);
        });
        syncBudgetLines();
      });
    });

    field('amount')?.addEventListener('input', syncBudgetLines);
    body.querySelectorAll('[data-goal-target]').forEach(input => {
      input.addEventListener('input', syncBudgetLines);
    });

    // 개별 단계 토글 — 변동비 행에만 단계 입력이 있다.
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

    body.querySelector('[data-screen-action="save"]')?.addEventListener('click', async () => {
      const button = body.querySelector('[data-screen-action="save"]');
      if (button.disabled) return;
      const cycle = checkedCycle();
      const readPct = (input, fallback) => {
        const n = Math.round(Number(String(input?.value || '').replace(/[^\d]/g, '')));
        return Number.isFinite(n) && n > 0 ? n : fallback;
      };
      const categoryDefault = Object.fromEntries(STAGES.map(stage => [
        stage.key,
        readPct(body.querySelector(`[data-stage-default="${stage.key}"]`), stage.fallback),
      ]));
      const basis = field('basis')?.value === 'per_category' ? 'per_category' : 'common';
      const categoryOverrides = {};
      if (basis === 'per_category') {
        body.querySelectorAll('.settings-budget-row:not(.fixed)').forEach(row => {
          const stages = Object.fromEntries(STAGES.map(stage => [
            stage.key,
            readPct(row.querySelector(`[data-stage-override="${stage.key}"]`), categoryDefault[stage.key]),
          ]));
          // 기본값과 같으면 저장하지 않는다(오버라이드만 기록).
          if (STAGES.some(stage => stages[stage.key] !== categoryDefault[stage.key])) {
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
        // 카테고리 금액(변동비 상한·고정비 월 금액)은 바뀐 행만 저장한다.
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
