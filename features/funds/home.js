import { isFundCovered } from '../../domain/transactions/budget.js';

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
