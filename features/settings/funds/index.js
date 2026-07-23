import { escHtml } from '../../../utils/dom.js';
import { fmtKRW } from '../../../utils/format.js';
import { monthKeyOf } from '../../../domain/funds/provision.js';

// ================================================================
// 설정 > 충당금 섹션. 비정기 지출(과태료·의류·등록비 등)을 매달 미리 적립.
// ================================================================
export function fundSettingsSection(funds = []) {
  const activeFunds = funds.filter(fund => fund.active);
  const monthlyTotal = activeFunds.reduce((sum, fund) => sum + (Number(fund.monthlyProvision) || 0), 0);
  const thisMonth = monthKeyOf(new Date());
  return `
    <div class="settings-section">
      <div class="h">충당금 (비정기 지출 대비)</div>
      <div class="budget-settings-card">
        <div class="budget-settings-card-head">
          <div>
            <strong>비정기 지출 주머니</strong>
            <span>매달 반복되면 고정비, 가끔 목돈이면 충당금이 적합해요</span>
          </div>
          <button class="tds-text-btn" type="button" data-fund-settings-action="add">+ 추가</button>
        </div>
        <div class="budget-goal-list fund-settings-list">
          ${funds.length ? funds.map(fund => fundSettingsRow(fund)).join('') : '<div class="reward-point-empty">아직 충당금이 없어요. + 추가로 만들어보세요.</div>'}
        </div>
        <div class="budget-summary-metrics" aria-label="충당금 요약" style="margin-top:8px">
          <div><span>월 적립 합계</span><strong>${fmtKRW(monthlyTotal)}</strong></div>
          <div><span>2주 예산 차감</span><strong>${fmtKRW(Math.round(monthlyTotal / 2))}</strong></div>
        </div>
        <div class="st4" style="margin-top:6px">사라지는 게 아니라 대비로 옮겨둡니다. "지금 써도 되는 돈"에서 미리 빠져요. (기준월 ${escHtml(thisMonth)})</div>
      </div>
    </div>
  `;
}

function fundSettingsRow(fund) {
  const manwon = Math.round((Number(fund.monthlyProvision) || 0) / 10000);
  const startMonth = String(fund.startMonthKey || monthKeyOf(new Date()));
  const openingManwon = Math.round((Number(fund.openingBalance) || 0) / 10000);
  return `
    <div class="budget-goal-row rhythm editable fund-settings-row ${fund.active ? '' : 'inactive'}" data-fund-row-id="${escHtml(fund.id)}">
      <span class="budget-goal-label">
        <input class="tds-input fund-emoji-input" data-fund-field="emoji" data-fund-id="${escHtml(fund.id)}" value="${escHtml(fund.emoji || '🧰')}" maxlength="2" aria-label="이모지" style="width:44px">
        <input class="tds-input fund-name-input" data-fund-field="name" data-fund-id="${escHtml(fund.id)}" value="${escHtml(fund.name || '')}" aria-label="충당금 이름" placeholder="예: 돌발비용">
      </span>
      <span class="budget-goal-amount">
        <input class="tds-input budget-goal-input" data-fund-field="monthlyProvision" data-fund-id="${escHtml(fund.id)}" inputmode="numeric" aria-label="${escHtml(fund.name)} 월 적립액 (만원)" value="${manwon}">
        <small>만원</small>
      </span>
      <input class="tds-input fund-start-input" type="month" data-fund-field="startMonthKey" data-fund-id="${escHtml(fund.id)}" value="${escHtml(startMonth)}" aria-label="적립 시작월" style="width:130px">
      <label class="toggle-row" aria-label="사용 여부" title="개시 잔액 ${fmtKRW(Number(fund.openingBalance) || 0)}">
        <input type="checkbox" data-fund-field="active" data-fund-id="${escHtml(fund.id)}" ${fund.active ? 'checked' : ''}>
        <span>${fund.active ? '사용' : '보관'}</span>
      </label>
      <input type="hidden" data-fund-field="openingBalanceManwon" data-fund-id="${escHtml(fund.id)}" value="${openingManwon}">
    </div>
  `;
}
