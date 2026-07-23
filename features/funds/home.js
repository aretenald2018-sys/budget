import { escHtml } from '../../utils/dom.js';
import { fmtKRW, fmtKRWShort } from '../../utils/format.js';
import { isFundCovered } from '../../domain/transactions/budget.js';

// 지금 써도 되는 돈 히어로 (홈 전용). 예산 − 충당금 − 지출을 하나의 가용액으로.
// modeControlHtml은 report 컨트롤러에서 렌더한 2주/월 토글을 주입받는다(순환 의존 방지).
export function safeToSpendHero(sts, { mode, monthKey, modeControlHtml = '' } = {}) {
  const periodLabel = mode === 'cycle' ? '이번 2주' : `${monthKey}`;
  const amountText = fmtKRW(sts.amount).replace('원', '');
  const perDayText = sts.perDay > 0 ? `하루 ${fmtKRW(sts.perDay).replace('원', '')}원` : '여유 없음';
  const breakdown = [
    `예산 ${fmtKRWShort(sts.available + sts.provisions)}`,
    sts.provisions ? `충당금 ${fmtKRWShort(sts.provisions)}` : '',
    `지출 ${fmtKRWShort(sts.spent)}`,
  ].filter(Boolean).join(' − ');
  return `
    <section class="hero report-hero-card home-hero-card sts-hero ${sts.negative ? 'over' : ''}">
      ${modeControlHtml}
      <div class="report-hero-head">
        <div>
          <div class="label">지금 써도 되는 돈</div>
          <div class="report-hero-period">${escHtml(periodLabel)} · 남은 ${sts.daysRemaining}일</div>
          <div class="amount ${sts.negative ? 'warn' : ''}">${amountText}<span class="unit">원</span></div>
          <div class="pace ${sts.negative ? 'warn' : ''}">● ${sts.negative ? '예산을 넘었어요' : perDayText}</div>
        </div>
      </div>
      <div class="report-hero-progress">
        <div class="tds-progress"><div class="tds-progress-fill ${sts.negative ? 'warning' : ''}" style="transform:scaleX(${Math.min(1, Math.max(0, sts.spentRatio))})"></div></div>
        <div class="report-hero-meta">
          <span>${escHtml(breakdown)}</span>
          <span>${sts.available > 0 ? `${Math.min(999, Math.round(sts.spentRatio * 100))}% 사용` : '가용 예산 없음'}</span>
        </div>
      </div>
    </section>
  `;
}

export function groupFundDrawTxs(txs = []) {
  const map = {};
  for (const tx of Array.isArray(txs) ? txs : []) {
    if (!isFundCovered(tx) || !tx.fundId) continue;
    (map[tx.fundId] = map[tx.fundId] || []).push(tx);
  }
  return map;
}

export function earliestFundStartDate(funds = []) {
  const keys = funds.map(fund => String(fund.startMonthKey || '')).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
  const earliest = keys[0];
  if (!earliest) {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d;
  }
  const [y, m] = earliest.split('-').map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}
