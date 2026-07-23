import { escHtml } from '../../utils/dom.js';
import { fmtKRW, fmtKRWShort } from '../../utils/format.js';

// ================================================================
// 충당금 상세 모달 (hd-sheet 스킨, hd-m-* 컴포넌트)
// data 속성·form name 계약은 컨트롤러와 공유 — 변경 금지.
// ================================================================
export function fundDetailModalHtml(model, { draws = [], history = [] } = {}) {
  if (!model) return '<div class="hd-m-empty">충당금을 찾을 수 없습니다.</div>';
  const drawRows = draws.length
    ? draws.map(tx => `
        <div class="hd-m-row">
          <span class="name">${escHtml(tx.merchant || tx.counterparty || '지출')}${tx.memo ? `<span class="sub">${escHtml(String(tx.memo).slice(0, 24))}</span>` : ''}</span>
          <span class="amt neg">−${fmtKRW(Number(tx.amount) || 0)}</span>
        </div>
      `).join('')
    : '<div class="hd-m-empty">아직 인출 내역이 없어요. 거래 상세에서 "충당금에서 차감"을 선택하면 여기에 쌓입니다.</div>';
  return `
    <div class="hd-m-head">
      <div class="tds-modal-title">${escHtml(model.emoji)} ${escHtml(model.name)}</div>
      <button type="button" class="hd-m-close" data-fund-action="close-detail" aria-label="닫기">×</button>
    </div>
    <div class="hd-m-summary">
      <strong class="${model.overdrawn ? 'neg' : ''}">${fmtKRW(model.balance)}</strong>
      <span>적립 누계 ${fmtKRW(model.accrued)} · 인출 누계 ${fmtKRW(model.drawn)}</span>
    </div>
    ${model.overdrawn ? `
      <div class="hd-m-note warn">잔액이 마이너스예요. 다른 카테고리/충당금에서 가져와 채울 수 있어요.</div>
    ` : ''}
    <div class="hd-m-actions" style="margin-top:0;margin-bottom:14px">
      <button type="button" class="tds-btn tonal" style="flex:1" data-fund-action="open-reallocation" data-target-kind="fund" data-target-id="${escHtml(model.id)}" data-target-label="${escHtml(model.name)}" data-suggest-amount="${model.overdrawn ? Math.abs(model.balance) : ''}">다른 곳에서 가져오기</button>
    </div>
    <form data-fund-deposit-form data-fund-id="${escHtml(model.id)}" data-fund-label="${escHtml(model.name)}">
      <div class="section-title"><h3>직접 채우기 (예산 외 입금)</h3></div>
      <div class="hd-m-field" style="margin-top:6px">
        <input class="tds-input" name="amount" inputmode="numeric" placeholder="금액(원)" required style="flex:1">
        <button type="submit" class="tds-btn" style="height:44px;padding:0 16px">입금 기록</button>
      </div>
      <div class="st4" style="margin-top:6px">보너스 등 예산 밖의 돈으로 채울 때 사용해요. 예산 안에서 옮기려면 "다른 곳에서 가져오기".</div>
    </form>
    <div class="section-title" style="margin-top:16px"><h3>인출 내역</h3></div>
    <div class="hd-m-list">${drawRows}</div>
    ${historySectionHtml(history)}
  `;
}

// ================================================================
// 재배분 모달 — 초과지출을 "트레이드오프 결정"으로 기록
// ================================================================
export function reallocationModalHtml({ target, suggestedAmount = 0, sources = [], history = [] } = {}) {
  const sourceRows = sources.map((source, index) => `
    <label class="hd-m-source">
      <input type="radio" name="sourceKey" value="${escHtml(source.key)}" data-source-kind="${escHtml(source.kind)}" data-source-id="${escHtml(source.id || '')}" data-source-label="${escHtml(source.label)}" ${index === 0 ? 'checked' : ''}>
      <span class="src">${escHtml(source.icon || '')} ${escHtml(source.label)}</span>
      <em>${source.kind === 'external' ? '예산 외' : `여유 ${fmtKRWShort(source.slack)}`}</em>
    </label>
  `).join('');
  return `
    <div class="hd-m-head">
      <div class="tds-modal-title">예산 재배분</div>
      <button type="button" class="hd-m-close" data-fund-action="close-realloc" aria-label="닫기">×</button>
    </div>
    <div class="hd-m-note">
      <strong style="color:var(--hd-t1)">${escHtml(target.label)}</strong>${suggestedAmount > 0 ? `이(가) ${fmtKRW(suggestedAmount)} 부족해요` : '(으)로 옮길 금액을 정하세요'}.
      초과는 실패가 아니라 결정이에요 — 어디서 가져올지 고르면 이력으로 남습니다.
    </div>
    <form data-fund-realloc-form data-target-kind="${escHtml(target.kind)}" data-target-id="${escHtml(target.id || '')}" data-target-label="${escHtml(target.label)}">
      <div class="section-title"><h3>가져올 곳</h3></div>
      <div class="hd-m-list">
        ${sourceRows || '<div class="hd-m-empty">가져올 수 있는 항목이 없어요. 예산 외 입금을 사용하세요.</div>'}
      </div>
      <div class="hd-m-field">
        <span>금액</span>
        <input class="tds-input" name="amount" inputmode="numeric" value="${suggestedAmount > 0 ? suggestedAmount : ''}" placeholder="0" required>
      </div>
      <div class="hd-m-field">
        <span>메모</span>
        <input class="tds-input" name="note" placeholder="예: 헬스장 등록으로 이동">
      </div>
      <div class="st4" style="margin-top:8px">
        여유보다 큰 금액도 기록할 수 있어요 — 의식적인 결정이라면 괜찮아요.
        비정기 지출 때문이라면 해당 거래를 열어 "충당금에서 차감"이 더 적합해요.
      </div>
      <div class="hd-m-actions">
        <button type="button" class="tds-btn secondary" data-fund-action="close-realloc">취소</button>
        <button type="submit" class="tds-btn" style="flex:1">재배분 기록</button>
      </div>
    </form>
    ${historySectionHtml(history)}
  `;
}

// 이번 기간의 재배분 결정 이력 — C의 핵심 가치("결정은 기록으로 남는다")를 가시화.
function historySectionHtml(history = []) {
  if (!Array.isArray(history) || !history.length) return '';
  const rows = history.slice(0, 6).map(adj => {
    const from = adj?.from?.label || (adj?.from?.kind === 'external' ? '예산 외 입금' : '');
    const to = adj?.to?.label || '';
    const note = String(adj?.note || '').trim();
    return `
      <div class="hd-m-row">
        <span class="name">${escHtml(from)} → ${escHtml(to)}${note ? `<span class="sub">${escHtml(note.slice(0, 30))}</span>` : ''}</span>
        <span class="amt">${fmtKRW(Number(adj?.amount) || 0)}</span>
      </div>
    `;
  }).join('');
  return `
    <div class="section-title" style="margin-top:16px"><h3>이번 기간 결정</h3></div>
    <div class="hd-m-list">${rows}</div>
  `;
}

export function reallocationPillHtml({ kind, id, label, overage }) {
  return `
    <button type="button" class="tds-btn sm tonal fund-realloc-pill" data-fund-action="open-reallocation" data-target-kind="${escHtml(kind)}" data-target-id="${escHtml(id || '')}" data-target-label="${escHtml(label)}" data-suggest-amount="${Math.max(0, Math.round(overage) || 0)}">재배분 ›</button>
  `;
}
