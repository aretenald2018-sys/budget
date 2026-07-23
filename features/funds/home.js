import { escHtml } from '../../utils/dom.js';
import { fmtKRW, fmtKRWShort } from '../../utils/format.js';
import { isFundCovered } from '../../domain/transactions/budget.js';

// 지금 써도 되는 돈 히어로 (홈 전용). 예산 − 충당금 − 지출을 하나의 가용액으로.
// modeControlHtml은 report 컨트롤러에서 렌더한 2주/월 토글을 주입받는다(순환 의존 방지).
export function groupFundDrawTxs(txs = []) {
  const map = {};
  for (const tx of Array.isArray(txs) ? txs : []) {
    if (!isFundCovered(tx) || !tx.fundId) continue;
    (map[tx.fundId] = map[tx.fundId] || []).push(tx);
  }
  return map;
}

// 종합 위젯 v3용 STS·충당금 페이로드.
export function widgetExtraFrom(sts, fundModels, { mode, monthKey } = {}) {
  return {
    safeToSpend: {
      amount: sts.amount,
      perDay: sts.perDay,
      daysRemaining: sts.daysRemaining,
      spentRatio: sts.spentRatio,
      negative: sts.negative,
      periodLabel: mode === 'cycle' ? '이번 2주' : String(monthKey),
    },
    funds: (fundModels || []).map(model => ({
      emoji: model.emoji,
      label: model.name,
      balance: model.balance,
      overdrawn: model.overdrawn,
    })),
  };
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
