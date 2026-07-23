import { fmtMonthKey } from '../../utils/format.js';

export const transactionState = {
  monthKey: fmtMonthKey(new Date()),
  category: 'all',
  day: null,
  loading: false,
  cursor: null,
  exhausted: false,
  items: [],
  reviewItems: [],
  scrollBound: false,
};

export function resetTransactionViewState() {
  Object.assign(transactionState, {
    monthKey: fmtMonthKey(new Date()),
    category: 'all',
    day: null,
    cursor: null,
    exhausted: false,
    items: [],
    reviewItems: [],
  });
}
