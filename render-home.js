// ================================================================
// render-home.js — 홈
// 소비 페이스 리포트를 홈 화면으로 승격
// ================================================================

import { renderReport } from './render-report.js';
import { renderWineHomeCard } from './features/wine/index.js';

export async function renderHome() {
  await renderReport({ rootSelector: '#tab-home', homeMode: true });
  await renderWineHomeCard(document.getElementById('tab-home'));
}
