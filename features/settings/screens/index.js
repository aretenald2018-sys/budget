// ================================================================
// features/settings/screens/index.js — 설정 10화면 레지스트리
// modals.js 가 drill-in 열기 직전에 render()를 호출(lazy render)하고,
// 본문 삽입 후 bind()로 동작을 배선한다.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md
// ================================================================

import { budgetOverallScreen } from './budget-overall.js';
import { categoryGoalsScreen } from './category-goals.js';
import { spendingLimitsScreen } from './spending-limits.js';
import { goalEditScreen } from './goal-edit.js';
import { pointsMissionsScreen } from './points-missions.js';
import { weeklyReportScreen } from './weekly-report.js';
import { homeCardsScreen } from './home-cards.js';
import { autoClassifyScreen } from './auto-classify.js';
import { backupScreen } from './backup.js';
import { dataExportScreen } from './data-export.js';

export const SETTINGS_SCREEN_LIST = [
  budgetOverallScreen,
  categoryGoalsScreen,
  spendingLimitsScreen,
  goalEditScreen,
  pointsMissionsScreen,
  weeklyReportScreen,
  homeCardsScreen,
  autoClassifyScreen,
  backupScreen,
  dataExportScreen,
];

export const SETTINGS_SCREENS = Object.fromEntries(
  SETTINGS_SCREEN_LIST.map(screen => [screen.id, screen]),
);
