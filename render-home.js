// ================================================================
// render-home.js — 홈
// 소비 페이스 리포트를 홈 화면으로 승격
// ================================================================

import { renderReport } from './render-report.js?v=20260601-biweekly-start-modal';

export async function renderHome() {
  return renderReport({ rootSelector: '#tab-home', homeMode: true });
}

window.renderHome = renderHome;
