import { REIMBURSEMENT_CATEGORY_NAME } from '../../../data/constants.js';
import { escHtml } from '../../../utils/dom.js';
import { fmtKRW, fmtKRWShort } from '../../../utils/format.js';
import {
  effectiveTargetFor,
  progressPercentValue,
  ratio,
  targetFor,
  usedFor,
} from './state.js';
import { reallocationPillHtml } from '../../funds/view.js';

export function heroSecondaryProgress(label, used, target) {
  const pct = target ? Math.min(999, Math.round((used / target) * 100)) : 0;
  return `
    <div class="report-hero-progress secondary">
      <div class="report-hero-secondary-head">
        <span class="report-hero-secondary-label">${escHtml(label)}</span>
        <strong class="report-hero-secondary-value">
          <span>${fmtKRW(used)}</span>
          <span class="report-hero-secondary-separator">/</span>
          <span>${fmtKRW(target)}</span>
        </strong>
      </div>
      <div class="tds-progress"><div class="tds-progress-fill" style="transform:scaleX(${ratio(used, target)})"></div></div>
      <div class="report-hero-meta">
        <span>${target ? `${pct}% 사용` : '목표 미설정'}</span>
      </div>
    </div>
  `;
}

export function reimbursementGaugeGroup(summary, mode) {
  if (!summary.amount) return '';
  return `
    <div class="budget-gauge-group reimbursement">
      <div class="budget-gauge-parent">
        <strong>예산 제외</strong>
        <span>${summary.count}건</span>
      </div>
    <button type="button" class="budget-gauge-row actionable reimbursement" data-report-action="open-reimbursement" data-report-mode="${escHtml(mode)}">
        <div class="budget-gauge-head">
          <span>↩ ${REIMBURSEMENT_CATEGORY_NAME}</span>
          <strong>${fmtKRW(summary.amount)} ›</strong>
        </div>
        <div class="budget-gauge-meta">${mode === 'cycle' ? '이번 2주' : '이번 달'} · 조절비/월간 지출 합계 제외</div>
        <div class="tds-progress reimbursement"><div class="tds-progress-fill" style="transform:scaleX(1)"></div></div>
      </div>
    </button>
  `;
}

export function budgetGaugeGroups(categories, byCategory, monthKey, mode, options = {}) {
  if (categories.length === 0) return '<div class="empty-state compact"><div>표시할 예산 카테고리가 없습니다</div></div>';
  const homeWidgetRows = options.homeMode === true && options.showIcon === false;
  const groups = {};
  for (const category of categories) {
    const parent = category.parent || '기타';
    if (!groups[parent]) groups[parent] = [];
    groups[parent].push(category);
  }
  const adjustments = Array.isArray(options.adjustments) ? options.adjustments : [];
  return Object.entries(groups).map(([parent, rows]) => {
    const parentUsed = rows.reduce((sum, category) => sum + usedFor(category, byCategory), 0);
    const parentTarget = rows.reduce((sum, category) => sum + effectiveTargetFor(category, monthKey, mode, adjustments), 0);
    return `
      <div class="budget-gauge-group ${homeWidgetRows ? 'home-widget-gauge-group' : ''}">
        <div class="budget-gauge-parent">
          <strong>${escHtml(parent)}</strong>
          <span>${fmtKRWShort(parentUsed)} / ${fmtKRWShort(parentTarget)}</span>
        </div>
        ${rows.map(category => gaugeRow(category, byCategory, monthKey, mode, options)).join('')}
      </div>
    `;
  }).join('');
}

export function fixedCostRow(category, byCategory, monthKey) {
  const used = usedFor(category, byCategory);
  const target = targetFor(category, monthKey, 'month');
  const status = used <= 0 ? '예정' : used <= target ? '결제됨' : '초과';
  return `
    <button type="button" class="fixed-cost-row" data-report-action="open-category" data-category-name="${encodeURIComponent(category.name)}" data-report-mode="month">
      <span>${category.emoji || ''} ${escHtml(category.name)}</span>
      <strong>${fmtKRW(used)} / ${fmtKRW(target)}</strong>
      <em class="${status === '초과' ? 'over' : ''}">${status}</em>
    </button>
  `;
}

function gaugeRow(category, byCategory, monthKey, mode, options = {}) {
  const adjustments = Array.isArray(options.adjustments) ? options.adjustments : [];
  const used = usedFor(category, byCategory);
  const target = effectiveTargetFor(category, monthKey, mode, adjustments);
  const pct = target ? Math.min(100, Math.round((used / target) * 100)) : 0;
  const fillClass = target && used / target > 0.85 ? 'warning' : '';
  const gaugeClass = fillClass ? 'amber' : (pct < 55 ? 'green' : '');
  const overspent = target > 0 && used > target;
  const reallocPill = overspent ? reallocationPillHtml({ kind: 'category', id: category.id || null, label: category.name, overage: used - target }) : '';
  const showIcon = options.showIcon !== false;
  const compactHome = options.homeMode === true && options.showIcon === false;
  const compactMeta = target ? `${fmtKRW(used).replace('원', '')} / ${fmtKRW(target).replace('원', '')}` : `목표 미설정 · ${fmtKRW(used).replace('원', '')}`;
  if (compactHome) {
    const percentText = target ? `${pct}%` : '-';
    const progressFill = target ? progressPercentValue(used, target) : 0;
    const row = `
      <button type="button" class="cat-row variable budget-gauge-row actionable no-icon home-widget-row home-widget-gauge-row" data-report-action="open-category" data-category-name="${encodeURIComponent(category.name)}" data-report-mode="${escHtml(mode)}">
        <div class="home-widget-row-shell ${progressFill > 0 ? 'has-progress' : ''}" aria-label="${escHtml(category.name)} ${escHtml(percentText)}">
          <span class="home-widget-fill gauge-fill ${gaugeClass}" style="--fill-pct:${progressFill.toFixed(2)}%"></span>
          <span class="home-widget-mark" aria-hidden="true">${escHtml(homeWidgetCategoryMark(category))}</span>
          <span class="home-widget-name">${escHtml(category.name)}</span>
          <strong class="home-widget-value">${escHtml(percentText)}</strong>
        </div>
        <div class="home-widget-row-meta gauge-meta compact">${escHtml(compactMeta)}</div>
      </button>
    `;
    return reallocPill ? `<div class="budget-gauge-row-wrap overspent">${row}<div class="budget-gauge-row-realloc">${reallocPill}</div></div>` : row;
  }
  const row = `
    <button type="button" class="cat-row variable budget-gauge-row actionable ${showIcon ? '' : 'no-icon'}" data-report-action="open-category" data-category-name="${encodeURIComponent(category.name)}" data-report-mode="${escHtml(mode)}">
      ${showIcon ? `<div class="cat-icon">${category.emoji || '□'}</div>` : ''}
      <div class="cat-body">
        <div class="top">
          <span class="name">${escHtml(category.name)}</span>
          <span class="vals"><b>${fmtKRW(used)}</b> <em>/ ${fmtKRW(target)}</em></span>
        </div>
        <div class="gauges">
          <div>
            <div class="gauge-track"><span class="gauge-fill ${gaugeClass}" style="width:${pct}%"></span></div>
            <div class="gauge-meta">${target ? `${pct}%` : '목표 미설정'}</div>
          </div>
        </div>
      </div>
    </button>
  `;
  return reallocPill ? `<div class="budget-gauge-row-wrap overspent">${row}<div class="budget-gauge-row-realloc">${reallocPill}</div></div>` : row;
}

function homeWidgetCategoryMark(category) {
  const emoji = String(category?.emoji || '').trim();
  if (emoji && emoji !== '□') return emoji;
  return Array.from(String(category?.name || '').trim())[0] || '·';
}
