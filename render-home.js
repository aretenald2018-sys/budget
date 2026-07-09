// ================================================================
// render-home.js — 홈
// 소비 페이스 리포트를 홈 화면으로 승격
// ================================================================

import { renderReport } from './render-report.js?v=20260709-reward-widget-refresh&data=20260710-gps-route-rewrite';

export async function renderHome() {
  return renderReport({ rootSelector: '#tab-home', homeMode: true });
}

window.renderHome = renderHome;
