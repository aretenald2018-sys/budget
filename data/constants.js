export const BUDGET_SCHEMA_VERSION = '2026-2q-v1';
export const BUDGET_MONTH_KEY = '2026-05';
export const BUDGET_START_DATE = new Date(2026, 4, 1, 0, 0, 0, 0);

export const UNCATEGORIZED_CATEGORY_NAME = '미분류';
export const REIMBURSEMENT_CATEGORY_NAME = '환급예정금액';

export const DEV_IDEA_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
});

export const DEFAULT_BUDGET_RHYTHMS = Object.freeze({
  '주거비용': 'fixed',
  '보험비용': 'fixed',
  '통신비용': 'fixed',
  '교통비용': 'fixed',
});
