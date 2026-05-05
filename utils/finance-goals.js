// ================================================================
// utils/finance-goals.js — long-term direction math
// Amounts are stored in KRW.
// ================================================================

export function compoundProjection({
  startAmount = 0,
  monthlyContribution = 0,
  annualContribution = null,
  contributionSchedule = [],
  contributionTiming = 'monthly',
  annualRate = 0,
  startYear,
  targetYear,
}) {
  const fromYear = Number(startYear) || new Date().getFullYear();
  const toYear = Math.max(fromYear, Number(targetYear) || fromYear);
  const yearlyRate = Math.max(-0.99, Number(annualRate) || 0) / 100;
  const monthlyRate = yearlyRate / 12;
  const schedule = normalizeContributionSchedule(contributionSchedule);
  const useYearEndContribution = contributionTiming === 'yearEnd' || schedule.length > 0;
  const rows = [];
  let balance = Math.max(0, Math.round(Number(startAmount) || 0));
  for (let year = fromYear; year <= toYear; year += 1) {
    if (useYearEndContribution) {
      balance = Math.round(balance * (1 + yearlyRate));
      balance += contributionForYear({
        year,
        schedule,
        fallbackAnnualContribution: annualContribution ?? (Number(monthlyContribution) || 0) * 12,
      });
    } else {
      for (let m = 0; m < 12; m += 1) {
        balance = Math.round(balance * (1 + monthlyRate) + Math.max(0, Number(monthlyContribution) || 0));
      }
    }
    rows.push({ year, balance });
  }
  return rows;
}

export function buildGoalImpact(goal, { monthUsed = 0, monthTarget = 0, mindbankTotal = 0 } = {}) {
  if (!goal) return null;
  const now = new Date();
  const targetAmount = Number(goal.targetAmount) || 0;
  const monthlyBase = Number(goal.monthlyContributionTarget) || 0;
  const budgetDelta = Math.round((Number(monthTarget) || 0) - (Number(monthUsed) || 0));
  const estimatedContribution = Math.max(0, monthlyBase + budgetDelta);
  const baseline = lastBalance(compoundProjection({
    startAmount: goal.startAmount,
    monthlyContribution: monthlyBase,
    annualRate: goal.annualRate,
    startYear: now.getFullYear(),
    targetYear: goal.targetYear,
  }));
  const adjusted = lastBalance(compoundProjection({
    startAmount: goal.startAmount,
    monthlyContribution: estimatedContribution,
    annualRate: goal.annualRate,
    startYear: now.getFullYear(),
    targetYear: goal.targetYear,
  }));
  const progress = targetAmount ? Math.max(0, Math.min(1, (Number(goal.startAmount) || 0) / targetAmount)) : 0;
  const directionDelta = adjusted - baseline;
  const targetGap = targetAmount ? adjusted - targetAmount : 0;
  return {
    goal,
    progress,
    budgetDelta,
    estimatedContribution,
    monthlyBase,
    baseline,
    adjusted,
    directionDelta,
    targetGap,
    mindbankTotal: Math.max(0, Math.round(Number(mindbankTotal) || 0)),
  };
}

export function formatManwonFromKRW(value) {
  const n = Math.round((Number(value) || 0) / 10000);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 10000) {
    const eok = abs / 10000;
    return `${sign}${Number.isInteger(eok) ? eok : eok.toFixed(1)}억원`;
  }
  return `${sign}${abs.toLocaleString('ko-KR')}만원`;
}

function lastBalance(rows) {
  return rows.length ? rows[rows.length - 1].balance : 0;
}

function normalizeContributionSchedule(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map(entry => {
      const startYear = Math.round(Number(entry.startYear) || 0);
      const endYearRaw = Number(entry.endYear);
      const endYear = endYearRaw ? Math.max(startYear, Math.round(endYearRaw)) : null;
      const amount = Math.max(0, Math.round(Number(entry.annualContribution ?? entry.amount) || 0));
      return { startYear, endYear, annualContribution: amount };
    })
    .filter(entry => entry.startYear && entry.annualContribution)
    .sort((a, b) => a.startYear - b.startYear);
}

function contributionForYear({ year, schedule, fallbackAnnualContribution = 0 }) {
  const matched = schedule.find(entry => {
    const start = Number(entry.startYear) || 0;
    const end = entry.endYear == null ? Infinity : Number(entry.endYear);
    return year >= start && year <= end;
  });
  return Math.max(0, Math.round(Number(matched?.annualContribution ?? fallbackAnnualContribution) || 0));
}
