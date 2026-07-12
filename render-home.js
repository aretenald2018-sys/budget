// ================================================================
// render-home.js — 홈
// 소비 페이스 리포트를 홈 화면으로 승격
// ================================================================

import { renderReport } from './render-report.js?v=20260712-report-features&data=20260712-domain-rules-r2';

export async function renderHome() {
  return renderReport({ rootSelector: '#tab-home', homeMode: true });
}

window.renderHome = renderHome;
