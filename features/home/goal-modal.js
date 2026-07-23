import { escHtml } from '../../utils/dom.js';
import { fmtKRW } from '../../utils/format.js';

// ================================================================
// 목표 상세 모달 — 부모 그룹의 하위 카테고리별 사용/목표 게이지.
// 초과 항목엔 재배분 칩(실제 카테고리 id) → funds 컨트롤러가 처리.
// hd-sheet 스킨. 순수 빌더 + 얇은 open 헬퍼.
// ================================================================

export function goalDetailModalHtml(goal) {
  if (!goal) return '<div class="hd-m-empty">목표 정보를 찾을 수 없습니다.</div>';
  const children = Array.isArray(goal.children) ? goal.children : [];
  const rows = children.length
    ? children.map(child => goalChildRow(child)).join('')
    : '<div class="hd-m-empty">이 그룹에 연결된 카테고리가 없어요.</div>';
  const pctText = Number.isFinite(Number(goal.percent)) ? `${Math.round(Number(goal.percent))}% 사용` : '목표 미설정';
  return `
    <div class="hd-m-head">
      <div class="tds-modal-title">${escHtml(goal.name)}</div>
      <button type="button" class="hd-m-close" data-goal-modal-close aria-label="닫기">×</button>
    </div>
    <div class="hd-m-summary">
      <strong class="${Number(goal.percent) > 100 ? 'neg' : ''}">${escHtml(goal.fraction)}</strong>
      <span>${escHtml(pctText)} · 초과한 항목은 재배분으로 다른 곳의 여유를 가져올 수 있어요</span>
    </div>
    <div class="hd-m-list">${rows}</div>
  `;
}

function goalChildRow(child) {
  const target = Math.max(0, Number(child.target) || 0);
  const used = Math.max(0, Number(child.used) || 0);
  const over = target > 0 && used > target;
  const pct = target > 0 ? Math.min(100, Math.round(used / target * 100)) : 0;
  const meta = target > 0
    ? `${fmtKRW(used)} / ${fmtKRW(target)}`
    : `${fmtKRW(used)} · 목표 없음`;
  return `
    <div class="hd-m-row" style="flex-direction:column;align-items:stretch;gap:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="name">${escHtml(child.label)}<span class="sub">${escHtml(meta)}</span></span>
        ${over
          ? `<button type="button" class="hd-goal-realloc" data-fund-action="open-reallocation" data-target-kind="category" data-target-id="${escHtml(child.id || '')}" data-target-label="${escHtml(child.label)}" data-suggest-amount="${Math.max(0, Math.round(child.over) || 0)}">재배분</button>`
          : `<span class="amt ${target > 0 ? '' : 'sub'}">${target > 0 ? `${pct}%` : ''}</span>`}
      </div>
      ${target > 0 ? `
        <div class="hd-m-bar"><span style="width:${pct}%;background:${over ? 'var(--hd-danger)' : 'linear-gradient(90deg,var(--hd-brand),#A78BFA)'}"></span></div>
      ` : ''}
    </div>
  `;
}

export function openGoalDetail(goal) {
  const body = ensureGoalModal();
  if (!body) return;
  body.innerHTML = goalDetailModalHtml(goal);
  window.openModal?.('home-goal-modal');
}

function ensureGoalModal() {
  let modal = document.getElementById('home-goal-modal');
  if (!modal) {
    const container = document.getElementById('modals-container') || document.body;
    container.insertAdjacentHTML('beforeend', `
      <div class="tds-modal-overlay hd-sheet" id="home-goal-modal" role="dialog" aria-modal="true">
        <div class="tds-modal-sheet">
          <div class="tds-modal-handle"></div>
          <div class="tds-modal-content" style="text-align:left" id="home-goal-modal-body"></div>
        </div>
      </div>
    `);
    modal = document.getElementById('home-goal-modal');
    modal?.addEventListener('click', event => {
      if (event.target === modal || event.target?.closest?.('[data-goal-modal-close]')) {
        window.closeModal?.('home-goal-modal');
        return;
      }
      // 재배분 칩은 문서 레벨 funds 컨트롤러가 처리 — 재배분 모달로 넘어가며 이 모달은 닫는다.
      if (event.target?.closest?.('[data-fund-action="open-reallocation"]')) {
        window.closeModal?.('home-goal-modal');
      }
    });
  }
  return document.getElementById('home-goal-modal-body');
}
