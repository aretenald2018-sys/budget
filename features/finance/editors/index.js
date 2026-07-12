import { formatManwonFromKRW } from '../../../utils/finance-goals.js';
import { escHtml } from '../../../utils/dom.js';
import { fmtMonthKey } from '../../../utils/format.js';
import {
  contributionForScenarioYear,
  normalizeContributionSchedule,
  realRowsForSeries,
} from '../projection/index.js';

export function contributionScheduleText(series) {
  const schedule = normalizeContributionSchedule(series?.contributionSchedule);
  if (!schedule.length) return `연 ${formatManwonFromKRW(series?.annualContribution || 0)} 불입`;
  return schedule
    .map(entry => `${entry.startYear}${entry.endYear ? `~${entry.endYear}` : '~'} ${formatManwonFromKRW(entry.annualContribution)}`)
    .join(' · ');
}

export function latestCashflowActual(actuals) {
  return actuals
    .filter(item => Number(item.inflow) || Number(item.fixedOutflow) || Number(item.monthlyExpense))
    .slice()
    .sort((a, b) => (a.year || 0) - (b.year || 0))
    .at(-1) || null;
}

export function latestActualRecord(actuals) {
  return actuals
    .slice()
    .sort((a, b) => (a.year || 0) - (b.year || 0))
    .at(-1) || null;
}

export function cashflowMath(actual, variableAnnual, targetAnnual) {
  const inflow = Number(actual.inflow) || 0;
  const fixed = Number(actual.fixedOutflow) || 0;
  const monthlyExpense = Number(actual.monthlyExpense) || 0;
  const effectiveVariableAnnual = monthlyExpense > 0 ? monthlyExpense * 12 : variableAnnual;
  const afterFixed = inflow - fixed;
  const savable = afterFixed - effectiveVariableAnnual;
  const gap = targetAnnual ? savable - targetAnnual : null;
  return {
    inflow,
    fixed,
    monthlyExpense,
    variableAnnual: effectiveVariableAnnual,
    budgetVariableAnnual: variableAnnual,
    variableSource: monthlyExpense > 0 ? '실적 입력 월 지출' : '예산 카테고리',
    afterFixed,
    savable,
    gap,
  };
}

export function annualVariableBudget(categories) {
  const monthKey = fmtMonthKey(new Date());
  return (categories || [])
    .filter(cat => cat.kind === 'expense' && (cat.budgetRhythm || 'spread') !== 'fixed')
    .reduce((sum, cat) => sum + (Number(cat.monthlyTargets?.[monthKey] ?? cat.target ?? 0) || 0), 0) * 12;
}

export function cashflowEquation(latest, variableAnnual, targetAnnual) {
  const flow = cashflowMath(latest, variableAnnual, targetAnnual);
  return `
    <div class="finance-cashflow-equation">
      <div class="finance-cashflow-help">계산 기준: 연간 순수입에서 고정비와 생활/감각 지출을 뺀 뒤, 목표 시나리오의 연간 저축액과 비교합니다. 생활/감각 지출은 ${escHtml(flow.variableSource)} 기준입니다.</div>
      ${equationRow('연간 순수입', flow.inflow, 'base')}
      ${equationRow('연간 고정비', -flow.fixed)}
      ${equationRow('생활/감각 지출', -flow.variableAnnual)}
      ${equationRow('저축 가능 예상액', flow.savable, 'result')}
      ${targetAnnual ? equationRow('시나리오 필요 저축액', -targetAnnual) : ''}
      ${targetAnnual ? equationRow('남거나 부족한 돈', flow.gap, 'final') : ''}
    </div>
  `;
}

export function equationRow(label, amount, tone = '') {
  const sign = amount < 0 ? '-' : tone === 'base' ? '' : amount > 0 ? '+' : '';
  return `
    <div class="finance-equation-row ${tone}">
      <span>${label}</span>
      <strong>${sign}${formatManwonFromKRW(Math.abs(amount))}</strong>
    </div>
  `;
}

export function cashflowHistory(rows, variableAnnual, targetAnnual) {
  const recent = rows.slice(-4).reverse();
  return `
    <div class="finance-cashflow-history" aria-label="최근 현실 여력">
      ${recent.map(item => {
        const flow = cashflowMath(item, variableAnnual, targetAnnual);
        return `
          <div class="finance-cashflow-year">
            <div class="finance-cashflow-year-head">
              <span>${item.year}</span>
              <strong>${formatManwonFromKRW(flow.savable)}</strong>
              <button type="button" data-finance-action="edit" data-type="actual" data-id="${escHtml(item.id)}">수정</button>
            </div>
            <em>순수입 ${formatManwonFromKRW(flow.inflow)} - 고정비 ${formatManwonFromKRW(flow.fixed)} - 생활/감각 지출 ${formatManwonFromKRW(flow.variableAnnual)}</em>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function scenarioManagerSummary(items, goal) {
  const target = items.find(item => item.id === goal?.heroBenchmarkId);
  return `
    <div class="finance-scenario-summary">
      <span>${items.length ? `${items.length}개 시뮬레이션` : '아직 시뮬레이션 없음'}</span>
      <strong>${target ? `${escHtml(target.name || '목표 시뮬레이션')} 기준` : '목표 미설정'}</strong>
    </div>
  `;
}

export function scenarioManagerBody(items, goal, viewState) {
  return `
    <div class="finance-scenario-manager-body">
      <button type="button" class="scenario-add-button" data-finance-action="new-scenario">시뮬레이션 추가</button>
      ${scenarioManagerSummary(items, goal)}
      ${scenarioManagerList(items, goal, viewState)}
    </div>
  `;
}

export function scenarioManagerList(items, goal, viewState) {
  if (!items.length) return '<div class="empty-state compact"><div>아직 시뮬레이션이 없습니다</div></div>';
  return `
    <div class="scenario-manager-list">
      ${items.map(item => scenarioManagerRow(item, goal, viewState)).join('')}
    </div>
  `;
}

export function scenarioManagerRow(item, goal, viewState) {
  const isTarget = goal?.heroBenchmarkId === item.id;
  const isPreviewing = viewState.compareScenarioId === item.id;
  const title = item.name || '시뮬레이션';
  const meta = `${item.startYear}년부터 ${item.periodYears}년 · ${contributionScheduleText(item)} · ${item.annualRate}%`;
  return `
    <article class="scenario-manager-row ${isTarget ? 'target' : ''}">
      <div>
        <strong>${escHtml(title)}${isTarget ? '<small class="target-badge">기준</small>' : ''}</strong>
        <span>${escHtml(meta)}</span>
      </div>
      <div class="scenario-manager-actions">
        ${!isTarget ? `<button type="button" class="primary" data-finance-action="set-target-scenario" data-id="${escHtml(item.id)}">기준</button>` : ''}
        ${!isTarget ? `<button type="button" class="${isPreviewing ? 'active' : ''}" data-scenario-preview="${escHtml(item.id)}">${isPreviewing ? '해제' : '비교'}</button>` : ''}
        <button type="button" data-finance-action="edit" data-type="scenario" data-id="${escHtml(item.id)}">수정</button>
        <button type="button" class="danger" data-finance-action="delete" data-type="scenario" data-id="${escHtml(item.id)}">삭제</button>
      </div>
    </article>
  `;
}

export function scenarioEditorModal(items, viewState) {
  if (!viewState.editScenarioId) return '';
  const item = items.find(x => x.id === viewState.editScenarioId) || {};
  return `
    <div class="finance-sheet finance-scenario-editor-sheet open" role="dialog" aria-modal="true" data-finance-action="close-scenario-editor" data-finance-backdrop>
      <div class="finance-sheet-panel">
        <div class="finance-sheet-handle"></div>
        <div class="finance-sheet-head">
          <div>
            <strong>${item.id ? '시뮬레이션 수정' : '시뮬레이션 추가'}</strong>
            <span>수익률, 기간, 불입 스케줄을 조정합니다.</span>
          </div>
          <button type="button" data-finance-action="close-scenario-editor">닫기</button>
        </div>
        ${scenarioEditor(items, viewState)}
      </div>
    </div>
  `;
}

export function scenarioRow(item, targetAmount, targetId, chartTargetId, viewState) {
  const last = item.rows.at(-1)?.balance || 0;
  const realLast = item.target ? realRowsForSeries(item).at(-1)?.balance : null;
  const gap = last - targetAmount;
  const isTarget = item.id === targetId;
  const canPreview = item.id && item.id !== chartTargetId;
  const isPreviewing = viewState.compareScenarioId === item.id;
  return `
    <div class="scenario-row ${isTarget ? 'selected' : ''}">
      <span class="dot" style="background:${item.color}"></span>
      <span class="name">${escHtml(item.label)}${isTarget ? '<small>목표</small>' : ''}</span>
      <strong>${formatManwonFromKRW(last)}${realLast ? `<small>실질 ${formatManwonFromKRW(realLast)}</small>` : ''}</strong>
      <span class="scenario-row-tail">
        <em class="${gap >= 0 ? 'positive' : 'negative'}">${targetAmount ? `${gap >= 0 ? '+' : '-'}${formatManwonFromKRW(Math.abs(gap))}` : '-'}</em>
        ${canPreview ? `<button type="button" class="${isPreviewing ? 'active' : ''}" data-scenario-preview="${escHtml(item.id)}">${isPreviewing ? '보기 해제' : '그래프에서 보기'}</button>` : ''}
      </span>
    </div>
  `;
}

export function scenarioEditor(items, viewState) {
  const item = items.find(x => x.id === viewState.editScenarioId) || {};
  return `
    <form id="finance-scenario-form" class="finance-inline-form">
      <input type="hidden" name="id" value="${escHtml(item.id || '')}">
      <div class="finance-goal-grid">
        ${inputField('이름', 'name', item.name || '', '예: 안정형 5%')}
        ${inputField('시작연도', 'startYear', item.startYear || new Date().getFullYear())}
        ${inputField('기간', 'periodYears', item.periodYears || 10)}
        ${inputField('연 수익률', 'annualRate', item.annualRate ?? 5)}
        ${inputField('물가상승률', 'inflationRate', item.inflationRate ?? 2.5)}
        ${inputField('초기 원금', 'initialPrincipal', krwToManwon(item.initialPrincipal))}
        ${inputField('기본 연간 불입금', 'annualContribution', krwToManwon(item.annualContribution), '스케줄을 비우면 이 금액을 매월 분산')}
      </div>
      ${contributionScheduleEditor(item)}
      <button class="tds-btn full" type="submit">${item.id ? '시뮬레이션 수정' : '시뮬레이션 추가'}</button>
    </form>
  `;
}

export function contributionScheduleEditor(item) {
  const schedule = normalizeContributionSchedule(item.contributionSchedule);
  const rows = schedule.length ? schedule : [{ startYear: item.startYear || new Date().getFullYear(), endYear: '', annualContribution: '' }];
  return `
    <div class="finance-contribution-schedule">
      <div class="finance-contribution-head">
        <div>
          <strong>연도별 불입 스케줄</strong>
          <span>입력하면 해당 구간의 연간 불입금이 기말에 반영됩니다. 종료연도를 비우면 계속 적용됩니다.</span>
        </div>
        <button type="button" data-add-contribution-row>구간 추가</button>
      </div>
      <div class="finance-contribution-rows" id="finance-contribution-rows">
        ${rows.map(entry => contributionScheduleRow(entry)).join('')}
      </div>
    </div>
  `;
}

export function contributionScheduleRow(entry = {}) {
  return `
    <div class="finance-contribution-row">
      <label>
        <span>시작</span>
        <input class="tds-input" name="scheduleStartYear" value="${escHtml(String(entry.startYear || ''))}" inputmode="numeric" placeholder="2026">
      </label>
      <label>
        <span>종료</span>
        <input class="tds-input" name="scheduleEndYear" value="${escHtml(String(entry.endYear || ''))}" inputmode="numeric" placeholder="비우면 계속">
      </label>
      <label>
        <span>연 불입(만원)</span>
        <input class="tds-input" name="scheduleContribution" value="${escHtml(String(entry.annualContribution ? krwToManwon(entry.annualContribution) : ''))}" inputmode="decimal" placeholder="2000">
      </label>
      <button type="button" data-remove-contribution-row>삭제</button>
    </div>
  `;
}

export function actualEditor(items, heroSeries, categories, viewState) {
  const item = items.find(x => x.id === viewState.editActualId) || {};
  const variableAnnual = annualVariableBudget(categories);
  const targetAnnual = heroSeries ? contributionForScenarioYear(heroSeries, Number(item.year) || new Date().getFullYear()) : 0;
  return `
    <form id="finance-actual-form" class="finance-inline-form">
      <input type="hidden" name="id" value="${escHtml(item.id || '')}">
      <div class="finance-form-section-title">자산 실적</div>
      <div class="finance-goal-grid">
        ${inputField('연도', 'year', item.year || new Date().getFullYear())}
        ${inputField('누적 저축/투자', 'cumulativeSaved', krwToManwon(item.cumulativeSaved))}
        ${inputField('순자산', 'netWorth', krwToManwon(item.netWorth))}
        ${inputField('비상금', 'emergencyFund', krwToManwon(item.emergencyFund))}
      </div>
      <div class="finance-form-section-title">저축 가능액 계산</div>
      <div class="finance-goal-grid">
        ${inputField('연간 순수입', 'inflow', krwToManwon(item.inflow))}
        ${inputField('연간 고정지출', 'fixedOutflow', krwToManwon(item.fixedOutflow))}
        ${inputField('월 생활/감각 지출', 'monthlyExpense', krwToManwon(item.monthlyExpense), '비우면 예산 카테고리 기준')}
      </div>
      ${actualEditorPreview(item, variableAnnual, targetAnnual)}
      <button class="tds-btn full" type="submit">${item.id ? '실적 수정' : '실적 추가'}</button>
    </form>
  `;
}

export function actualEditorPreview(item, variableAnnual, targetAnnual) {
  const hasInputs = Number(item.inflow) || Number(item.fixedOutflow) || Number(item.monthlyExpense);
  if (!hasInputs) {
    return `
      <div class="finance-actual-preview empty">
        <span>저축 가능액 미리보기</span>
        <strong>순수입·고정지출·월 생활/감각 지출을 입력하면 저장 후 계산됩니다.</strong>
      </div>
    `;
  }
  const flow = cashflowMath(item, variableAnnual, targetAnnual);
  return `
    <div class="finance-actual-preview">
      <span>${item.year || new Date().getFullYear()}년 저축 가능액 · ${escHtml(flow.variableSource)} 기준</span>
      <strong>${formatManwonFromKRW(flow.savable)}</strong>
      <em>${targetAnnual ? flow.gap >= 0 ? `목표 저축 후 ${formatManwonFromKRW(flow.gap)} 여유` : `목표 저축까지 ${formatManwonFromKRW(Math.abs(flow.gap))} 부족` : '목표 시나리오를 정하면 차이를 비교합니다'}</em>
    </div>
  `;
}

export function actualNewEntryCard(actuals, heroSeries, categories, viewState) {
  if (viewState.editActualId === '__new__') {
    return `
      <div class="finance-actual-new open">
        <div class="finance-actual-new-head">
          <div>
            <strong>새 실적 입력</strong>
            <span>자산 그래프와 저축 가능액 기준에 반영할 연도별 실적을 추가합니다.</span>
          </div>
          <button type="button" data-finance-action="cancel-actual-edit">닫기</button>
        </div>
        ${actualEditor(actuals, heroSeries, categories, viewState)}
      </div>
    `;
  }
  return `
    <button type="button" class="finance-actual-new" data-finance-action="new-actual">
      <span class="mark">+</span>
      <span class="body">
        <strong>새로 입력하기</strong>
        <em>연간 순수입, 고정비, 자산 실적을 한 번에 추가합니다.</em>
      </span>
      <span class="arrow">열기</span>
    </button>
  `;
}

export function actualYearList(actuals, heroSeries, categories, viewState) {
  const rows = actuals
    .slice()
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  if (!rows.length) {
    return '<div class="empty-state compact"><div>아직 실적이 없습니다</div></div>';
  }
  return `<div class="finance-actual-list">${rows.map(item => actualYearCard(item, heroSeries, categories, viewState)).join('')}</div>`;
}

export function actualYearCard(item, heroSeries, categories, viewState) {
  const year = Number(item.year) || new Date().getFullYear();
  const variableAnnual = annualVariableBudget(categories);
  const targetAnnual = heroSeries ? contributionForScenarioYear(heroSeries, year) : 0;
  const flow = cashflowMath(item, variableAnnual, targetAnnual);
  const isOpen = viewState.expandedActualId === item.id;
  const isEditing = viewState.editActualId === item.id;
  const flowTone = flow.gap == null || flow.gap >= 0 ? 'positive' : 'negative';
  const flowLabel = flow.gap == null
    ? formatManwonFromKRW(flow.savable)
    : flow.gap >= 0
      ? `목표 후 ${formatManwonFromKRW(flow.gap)}`
      : `${formatManwonFromKRW(Math.abs(flow.gap))} 부족`;
  return `
    <div class="finance-actual-year ${isOpen ? 'open' : ''}" data-actual-id="${escHtml(item.id || '')}">
      <button type="button" class="finance-actual-year-head" aria-expanded="${isOpen ? 'true' : 'false'}" data-finance-action="toggle-actual-year" data-id="${escHtml(item.id || '')}">
        <span>
          <strong>${year}년 실적</strong>
          <em>순자산 ${formatManwonFromKRW(item.netWorth || 0)} · 누적 저축/투자 ${formatManwonFromKRW(item.cumulativeSaved || 0)}</em>
        </span>
        <b class="${flowTone}">${flowLabel}</b>
      </button>
      ${actualYearDetail(item, flow, variableAnnual, targetAnnual, heroSeries, categories, isEditing, viewState)}
    </div>
  `;
}

export function actualYearDetail(item, flow, variableAnnual, targetAnnual, heroSeries, categories, isEditing, viewState) {
  if (isEditing) {
    return `
      <div class="finance-actual-year-detail editing">
        ${actualEditor([item], heroSeries, categories, viewState)}
      </div>
    `;
  }
  return `
    <div class="finance-actual-year-detail">
      <div class="finance-actual-metrics">
        ${actualMetric('순자산', item.netWorth)}
        ${actualMetric('누적 저축/투자', item.cumulativeSaved)}
        ${actualMetric('비상금', item.emergencyFund)}
        ${actualMetric(flow.variableSource, flow.variableAnnual)}
      </div>
      ${cashflowEquation(item, variableAnnual, targetAnnual)}
      <div class="finance-row-actions actual-actions">
        <button type="button" data-finance-action="edit-actual" data-id="${escHtml(item.id || '')}">수정</button>
        <button type="button" class="danger" data-finance-action="delete" data-type="actual" data-id="${escHtml(item.id || '')}">삭제</button>
      </div>
    </div>
  `;
}

export function actualMetric(label, amount) {
  return `
    <div class="finance-actual-metric">
      <span>${escHtml(label)}</span>
      <strong>${formatManwonFromKRW(amount || 0)}</strong>
    </div>
  `;
}

export function actualSheet(actuals, heroSeries, categories, viewState) {
  return `
    <div class="finance-sheet ${viewState.actualSheetOpen ? 'open' : ''}" id="finance-actual-sheet" data-finance-action="close-actual-sheet" data-finance-backdrop>
      <div class="finance-sheet-panel">
        <div class="finance-sheet-handle"></div>
        <div class="finance-card-head">
          <div>
            <div class="h">실제 실적 업데이트</div>
            <div class="sub">자산 그래프와 저축 가능액을 한 곳에서 관리합니다.</div>
          </div>
          <button type="button" class="tds-icon-btn sm" data-finance-action="close-actual-sheet">×</button>
        </div>
        ${actualNewEntryCard(actuals, heroSeries, categories, viewState)}
        ${actualYearList(actuals, heroSeries, categories, viewState)}
      </div>
    </div>
  `;
}

export function actualSheetCashflowSummary(latest, variableAnnual, targetAnnual) {
  if (!latest) {
    return `
      <div class="finance-sheet-summary empty">
        <strong>저축 가능액 기준 없음</strong>
        <span>연간 순수입, 고정지출, 월 생활/감각 지출을 넣으면 목표 저축액과 바로 비교됩니다.</span>
      </div>
    `;
  }
  const flow = cashflowMath(latest, variableAnnual, targetAnnual);
  return `
    <div class="finance-sheet-summary">
      <div class="finance-sheet-summary-head">
        <div>
          <strong>최근 실적 기준 저축 가능액</strong>
          <span>${latest.year}년 · ${escHtml(flow.variableSource)} 기준</span>
        </div>
        <b class="${flow.gap == null || flow.gap >= 0 ? 'positive' : 'negative'}">${flow.gap == null ? formatManwonFromKRW(flow.savable) : flow.gap >= 0 ? `목표 후 ${formatManwonFromKRW(flow.gap)}` : `${formatManwonFromKRW(Math.abs(flow.gap))} 부족`}</b>
      </div>
      ${cashflowEquation(latest, variableAnnual, targetAnnual)}
    </div>
  `;
}

export function inputField(label, name, value, placeholder = '') {
  const textNames = ['name', 'role', 'desc', 'symbol', 'market', 'purchaseDate', 'broker'];
  const type = name === 'purchaseDate' ? 'date' : 'text';
  return `
    <label>
      <span>${label}</span>
      <input class="tds-input" type="${type}" name="${name}" value="${escHtml(String(value ?? ''))}" placeholder="${escHtml(String(placeholder))}" inputmode="${textNames.includes(name) ? 'text' : 'decimal'}">
    </label>
  `;
}


function krwToManwon(value) {
  return Math.round((Number(value) || 0) / 10000);
}
