import { fmtMonthKey } from '../../utils/format.js';

export const transactionState = {
  monthKey: fmtMonthKey(new Date()),
  type: 'all',
  category: 'all',
  day: null,
  loading: false,
  cursor: null,
  exhausted: false,
  items: [],
  reviewItems: [],
  typeCounts: {},
  categoryCounts: {},
  scrollBound: false,
};

export function resetTransactionViewState() {
  Object.assign(transactionState, {
    monthKey: fmtMonthKey(new Date()),
    type: 'all',
    category: 'all',
    day: null,
    cursor: null,
    exhausted: false,
    items: [],
    reviewItems: [],
  });
}
