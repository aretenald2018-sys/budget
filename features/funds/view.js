import { escHtml } from '../../utils/dom.js';
import { fmtKRW, fmtKRWShort } from '../../utils/format.js';

// ================================================================
// 홈 충당금 섹션 — 기본 컴팩트 1줄, 탭하면 펀드별 확장.
// 보상(포인트) 카드와 구분되는 중립 톤: 게이지/이모지 재사용하되 배지 없음.
// ================================================================
export function fundCardsHtml(models = [], { expanded = false } = {}) {
  const totalBalance = models.reduce((sum, model) => sum + model.balance, 0);
  const monthlyTotal = models.filter(model => model.active).reduce((sum, model) => sum + model.monthlyProvision, 0);
  const hasOverdrawn = models.some(model => model.overdrawn);
  if (!models.length) {
    return `
      <section class="home-responsive-section fund-cards-section">
        <div class="section-title home-section-title"><h3>충당금</h3><button type="button" class="more" data-report-action="switch-tab" data-tab="settings">만들기 ›</button></div>
        <button type="button" class="insight fund-empty-nudge" data-report-action="switch-tab" data-tab="settings">
          <div class="head">돌발 지출 대비 주머니가 아직 없어요</div>
          <div class="body">과태료·의류·등록비 같은 비정기 지출을 매달 미리 떼어두면, 갑자기 나가는 돈이 2주 예산을 깨지 않아요.</div>
        </button>
      </section>
    `;
  }
  const summaryText = [
    `잔액 ${fmtKRWShort(totalBalance)}`,
    monthlyTotal ? `매월 +${fmtKRWShort(monthlyTotal)}` : '',
    hasOverdrawn ? '⚠' : '',
  ].filter(Boolean).join(' · ');
  return `
    <section class="home-responsive-section fund-cards-section">
      <div class="section-title home-section-title">
        <h3>충당금</h3>
        <button type="button" class="more" data-fund-action="toggle-expand" aria-expanded="${expanded ? 'true' : 'false'}">${escHtml(summaryText)} ${expanded ? '▾' : '▸'}</button>
      </div>
      <div class="budget-gauge-panel fund-cards-panel" ${expanded ? '' : 'hidden'}>
        ${models.map(model => fundRow(model)).join('')}
      </div>
    </section>
  `;
}

function fundRow(model) {
  const balanceText = fmtKRW(model.balance).replace('원', '');
  const meta = model.overdrawn
    ? `초과 인출 ${fmtKRW(Math.abs(model.balance))} — 재배분으로 채워주세요`
    : [
        model.monthlyProvision ? `+월 ${fmtKRWShort(model.monthlyProvision)} 적립` : '적립 없음',
        model.drawn ? `인출 누계 ${fmtKRWShort(model.drawn)}` : '',
      ].filter(Boolean).join(' · ');
  const fillPct = model.accrued > 0 ? Math.min(100, Math.max(0, (model.balance / model.accrued) * 100)) : 0;
  return `
    <button type="button" class="cat-row variable budget-gauge-row actionable no-icon home-widget-row fund-card-row ${model.overdrawn ? 'overdrawn' : ''}" data-fund-action="open-fund" data-fund-id="${escHtml(model.id)}">
      <div class="home-widget-row-shell ${fillPct > 0 ? 'has-progress' : ''}" aria-label="${escHtml(model.name)} 잔액 ${escHtml(balanceText)}원">
        <span class="home-widget-fill gauge-fill ${model.overdrawn ? 'warning' : 'green'}" style="--fill-pct:${fillPct.toFixed(2)}%"></span>
        <span class="home-widget-mark" aria-hidden="true">${escHtml(model.emoji)}</span>
        <span class="home-widget-name">${escHtml(model.name)}</span>
        <strong class="home-widget-value" ${model.overdrawn ? 'style="color:#e5484d"' : ''}>${escHtml(balanceText)}</strong>
      </div>
      <div class="home-widget-row-meta gauge-meta compact">${escHtml(meta)}</div>
    </button>
  `;
}

// ================================================================
// 충당금 상세 모달
// ================================================================
export function fundDetailModalHtml(model, { draws = [] } = {}) {
  if (!model) return '<div class="empty-state">충당금을 찾을 수 없습니다.</div>';
  const drawRows = draws.length
    ? draws.map(tx => `
        <div class="item">
          <span class="name">${escHtml(tx.merchant || tx.counterparty || '지출')}${tx.memo ? ` · ${escHtml(String(tx.memo).slice(0, 20))}` : ''}</span>
          <span class="price">-${fmtKRW(Number(tx.amount) || 0)}</span>
        </div>
      `).join('')
    : '<div class="st3">아직 인출 내역이 없어요. 거래 상세에서 "충당금에서 차감"을 선택하면 여기에 쌓입니다.</div>';
  return `
    <div class="tds-modal-title">${escHtml(model.emoji)} ${escHtml(model.name)}</div>
    <div class="fixed-cost-summary" style="margin-bottom:12px">
      <strong ${model.overdrawn ? 'style="color:#e5484d"' : ''}>${fmtKRW(model.balance)}</strong>
      <span>적립 누계 ${fmtKRW(model.accrued)} · 인출 누계 ${fmtKRW(model.drawn)}</span>
    </div>
    ${model.overdrawn ? `
      <div class="tds-card st4" style="margin-bottom:12px">잔액이 마이너스예요. 다른 카테고리/충당금에서 가져와 채울 수 있어요.</div>
    ` : ''}
    <div class="flex gap-md" style="margin-bottom:16px">
      <button type="button" class="tds-btn sm tonal" data-fund-action="open-reallocation" data-target-kind="fund" data-target-id="${escHtml(model.id)}" data-target-label="${escHtml(model.name)}" data-suggest-amount="${model.overdrawn ? Math.abs(model.balance) : ''}">다른 곳에서 가져오기</button>
    </div>
    <form data-fund-deposit-form data-fund-id="${escHtml(model.id)}" data-fund-label="${escHtml(model.name)}">
      <div class="section-title"><h3>직접 채우기 (예산 외 입금)</h3></div>
      <div class="flex gap-md">
        <input class="tds-input" name="amount" inputmode="numeric" placeholder="금액(원)" required style="flex:1">
        <button type="submit" class="tds-btn sm">입금 기록</button>
      </div>
      <div class="st4" style="margin-top:6px">보너스 등 예산 밖의 돈으로 채울 때 사용해요. 예산 안에서 옮기려면 "다른 곳에서 가져오기".</div>
    </form>
    <div class="section-title" style="margin-top:16px"><h3>인출 내역</h3></div>
    <div class="receipt-items">${drawRows}</div>
    <div class="flex gap-md" style="margin-top:20px">
      <button type="button" class="tds-btn secondary" style="flex:1" data-fund-action="close-detail">닫기</button>
    </div>
  `;
}

// ================================================================
// 재배분 모달 — 초과지출을 "트레이드오프 결정"으로 기록
// ================================================================
export function reallocationModalHtml({ target, suggestedAmount = 0, sources = [] } = {}) {
  const sourceRows = sources.map((source, index) => `
    <label class="tx-receipt-row fund-source-option" style="justify-content:flex-start;gap:10px">
      <input type="radio" name="sourceKey" value="${escHtml(source.key)}" data-source-kind="${escHtml(source.kind)}" data-source-id="${escHtml(source.id || '')}" data-source-label="${escHtml(source.label)}" ${index === 0 ? 'checked' : ''}>
      <span style="flex:1">${escHtml(source.icon || '')} ${escHtml(source.label)}</span>
      <em class="st4">${source.kind === 'external' ? '예산 외' : `여유 ${fmtKRWShort(source.slack)}`}</em>
    </label>
  `).join('');
  return `
    <div class="tds-modal-title">예산 재배분</div>
    <div class="tds-card st3" style="margin-bottom:12px">
      <strong>${escHtml(target.label)}</strong>${suggestedAmount > 0 ? `이(가) ${fmtKRW(suggestedAmount)} 부족해요` : '(으)로 옮길 금액을 정하세요'}.
      초과는 실패가 아니라 결정이에요 — 어디서 가져올지 고르면 이력으로 남습니다.
    </div>
    <form data-fund-realloc-form data-target-kind="${escHtml(target.kind)}" data-target-id="${escHtml(target.id || '')}" data-target-label="${escHtml(target.label)}">
      <div class="section-title"><h3>가져올 곳</h3></div>
      ${sourceRows || '<div class="st3">가져올 수 있는 항목이 없어요. 예산 외 입금을 사용하세요.</div>'}
      <label class="tx-receipt-row" style="margin-top:12px">
        <span>금액</span>
        <input class="tds-input" name="amount" inputmode="numeric" value="${suggestedAmount > 0 ? suggestedAmount : ''}" placeholder="0" required>
      </label>
      <label class="tx-receipt-row">
        <span>메모</span>
        <input class="tds-input" name="note" placeholder="예: 헬스장 등록으로 이동">
      </label>
      <div class="st4" style="margin-top:6px">
        여유보다 큰 금액도 기록할 수 있어요 — 의식적인 결정이라면 괜찮아요.
        비정기 지출 때문이라면 해당 거래를 열어 "충당금에서 차감"이 더 적합해요.
      </div>
      <div class="flex gap-md" style="margin-top:20px">
        <button type="button" class="tds-btn secondary" data-fund-action="close-realloc">취소</button>
        <button type="submit" class="tds-btn" style="flex:1">재배분 기록</button>
      </div>
    </form>
  `;
}

export function reallocationPillHtml({ kind, id, label, overage }) {
  return `
    <button type="button" class="tds-btn sm tonal fund-realloc-pill" data-fund-action="open-reallocation" data-target-kind="${escHtml(kind)}" data-target-id="${escHtml(id || '')}" data-target-label="${escHtml(label)}" data-suggest-amount="${Math.max(0, Math.round(overage) || 0)}">재배분 ›</button>
  `;
}
