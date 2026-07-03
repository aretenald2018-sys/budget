export function calendarCells(daily, reimbursementDaily, start, end, focusDay) {
  const blanks = Array.from({ length: start.getDay() }, () => '<div class="cal-day blank"></div>');
  const days = Array.from({ length: end.getDate() }, (_, idx) => {
    const day = idx + 1;
    const amount = daily[day] || 0;
    const reimbursementAmount = reimbursementDaily[day] || 0;
    return `<button type="button" class="cal-day ${day === focusDay ? 'active' : ''}" onclick="window.txSelectCalendarDay(${day})"><span>${day}</span>${amount ? `<em>-${amount.toLocaleString('ko-KR')}</em>` : ''}${reimbursementAmount ? `<small>(+${reimbursementAmount.toLocaleString('ko-KR')})</small>` : ''}</button>`;
  });
  return blanks.concat(days).join('');
}

export function dailyExpenseMap(txs) {
  const map = {};
  for (const tx of txs) {
    const day = dayOfMonth(tx.occurredAt);
    if (!day) continue;
    map[day] = (map[day] || 0) + (Number(tx.amount) || 0);
  }
  return map;
}

export function pickFocusDay(daily, now) {
  const entries = Object.entries(daily);
  if (entries.length === 0) return 0;
  const today = now.getDate();
  if (daily[today]) return today;
  return Number(entries.sort((a, b) => b[1] - a[1])[0][0]);
}

export function dayOfMonth(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getDate();
}
