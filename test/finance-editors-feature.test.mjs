import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actualSheet,
  annualVariableBudget,
  cashflowMath,
  scenarioEditorModal,
  scenarioManagerSummary,
} from '../features/finance/editors/index.js';

test('finance editor cashflow state preserves variable budget and target gap math', () => {
  const categories = [
    { kind: 'expense', budgetRhythm: 'fixed', target: 1000000 },
    { kind: 'expense', budgetRhythm: 'spread', target: 400000 },
    { kind: 'income', target: 5000000 },
  ];
  const variableAnnual = annualVariableBudget(categories);
  assert.equal(variableAnnual, 4800000);
  assert.deepEqual(cashflowMath({ inflow: 50000000, fixedOutflow: 12000000 }, variableAnnual, 20000000), {
    inflow: 50000000,
    fixed: 12000000,
    monthlyExpense: 0,
    variableAnnual: 4800000,
    budgetVariableAnnual: 4800000,
    variableSource: '예산 카테고리',
    afterFixed: 38000000,
    savable: 33200000,
    gap: 13200000,
  });
});

test('finance editor views keep scenario and actual sheet contracts', () => {
  const scenarios = [{ id: 'base', name: '기준 시나리오', startYear: 2026, periodYears: 20, annualRate: 8 }];
  assert.match(scenarioManagerSummary(scenarios, { heroBenchmarkId: 'base' }), /기준 시나리오 기준/);
  const scenarioModal = scenarioEditorModal(scenarios, { editScenarioId: 'base' });
  assert.match(scenarioModal, /id="finance-scenario-form"/);
  assert.match(scenarioModal, /finance-contribution-schedule/);

  const sheet = actualSheet([], null, [], {
    actualSheetOpen: true,
    editActualId: null,
    expandedActualId: null,
  });
  assert.match(sheet, /finance-sheet open/);
  assert.match(sheet, /새로 입력하기/);
});
