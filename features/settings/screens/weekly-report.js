// ================================================================
// 설정 06 주간 리포트 — 조회 화면 (저장 없음)
// 집계는 domain/transactions/weekly.js 순수 함수.
// 공유: 이미지 = 캔버스 렌더 → Web Share/다운로드, PDF = 인쇄 다이얼로그.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-06
// ================================================================

import { getAppSettings, listTransactions } from '../../../data.js';
import { weekRange, buildWeeklyReport, weeklyBudgetFor } from '../../../domain/transactions/weekly.js';
import { showToast } from '../../../utils/toast.js';
import { escHtml, fmtWon, progressHtml, sectionHtml } from './shared.js';

const DONUT_COLORS = ['#5B8FFF', '#B277E6', '#F5C64A', '#F08A3C', '#FF5B6B', '#98A4BC', '#3BD68F'];

let weekOffset = 0;
let lastReport = null;
let lastLabel = '';

async function loadReport() {
  const appSettings = await getAppSettings();
  const range = weekRange(new Date(), { offsetWeeks: weekOffset });
  const prevRange = weekRange(new Date(), { offsetWeeks: weekOffset - 1 });
  const [txs, prevTxs] = await Promise.all([
    listTransactions({ from: range.start, to: range.end, max: 1000 }).catch(() => []),
    listTransactions({ from: prevRange.start, to: prevRange.end, max: 1000 }).catch(() => []),
  ]);
  const weeklyBudget = weeklyBudgetFor({
    budgetAmount: appSettings.budget.amount,
    cycle: appSettings.budget.cycle,
    range,
  });
  return { range, report: buildWeeklyReport({ txs, prevTxs, weeklyBudget, range }) };
}

function donutHtml(byCategory, total) {
  if (!byCategory.length) return '<div class="settings-screen-empty">이번 주 지출이 없어요.</div>';
  const R = 15.9155;
  const C = 2 * Math.PI * R;
  let offset = 25;
  const top = byCategory.slice(0, 6);
  const arcs = top.map((cat, i) => {
    const len = (cat.pct / 100) * C;
    const html = `<circle cx="21" cy="21" r="${R}" fill="none" stroke="${DONUT_COLORS[i % DONUT_COLORS.length]}" stroke-width="6.6" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="-${(C * (offset / 100)).toFixed(2)}"/>`;
    offset += cat.pct;
    return html;
  }).join('');
  return `
    <div class="settings-weekly-donut">
      <div class="settings-weekly-donut-chart">
        <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="${R}" fill="none" stroke="var(--border)" stroke-width="6.6"/>${arcs}</svg>
        <div class="settings-weekly-donut-center"><span>합계</span><strong>${fmtWon(total)}</strong></div>
      </div>
      <div class="settings-weekly-legend">
        ${top.map((cat, i) => `
          <div class="settings-weekly-legend-row">
            <span class="dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>
            <span class="name">${escHtml(cat.name)}</span>
            <span class="pct">${cat.pct}%</span>
            <span class="amt">${fmtWon(cat.amount)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export const weeklyReportScreen = {
  id: 'settings-screen-weekly',
  title: '주간 리포트',

  async render() {
    const { range, report } = await loadReport();
    lastReport = report;
    lastLabel = range.label;
    const deltaText = report.deltaPct == null
      ? '지난주 데이터 없음'
      : `전주 대비 ${report.delta >= 0 ? '+' : '−'}${Math.abs(report.delta).toLocaleString('ko-KR')}원 (${report.delta >= 0 ? '▲' : '▼'}${Math.abs(report.deltaPct)}%)`;
    const h = report.highlights;

    return `
      <div class="settings-weekly-nav">
        <button type="button" class="tds-icon-btn md" data-screen-action="prev-week" aria-label="이전 주">‹</button>
        <strong>${escHtml(range.label)}</strong>
        <button type="button" class="tds-icon-btn md" data-screen-action="next-week" ${weekOffset >= 0 ? 'disabled' : ''} aria-label="다음 주">›</button>
      </div>

      ${sectionHtml('이번 주 요약', `
        <div class="settings-screen-hero compact">
          <span>총 지출</span>
          <strong>${fmtWon(report.total)}</strong>
          <div class="settings-screen-hero-sub"><span class="${report.delta > 0 ? 'neg' : 'pos'}">${escHtml(deltaText)}</span></div>
        </div>
        <div class="settings-weekly-metrics">
          <div>
            <span>예산 대비</span>
            ${report.budgetProgress == null ? '<strong>예산 미설정</strong>' : `${progressHtml(report.budgetProgress, report.budgetProgress >= 100 ? 'warning' : '')}<strong>${report.budgetProgress}%</strong>`}
          </div>
          <div><span>무지출 일수</span><strong>${report.noSpendDays}일</strong></div>
        </div>
      `)}

      ${sectionHtml('카테고리 분석', donutHtml(report.byCategory, report.total))}

      ${sectionHtml('주간 하이라이트', `
        <div class="settings-toggle-list">
          <div class="settings-toggle-row"><span>가장 많이 증가한 지출</span><strong>${h.topIncrease ? `${escHtml(h.topIncrease.name)} +${h.topIncrease.delta.toLocaleString('ko-KR')}원` : '없음'}</strong></div>
          <div class="settings-toggle-row"><span>가장 많이 감소한 지출</span><strong class="pos">${h.topDecrease ? `${escHtml(h.topDecrease.name)} −${Math.abs(h.topDecrease.delta).toLocaleString('ko-KR')}원` : '없음'}</strong></div>
          <div class="settings-toggle-row"><span>반복 지출</span><strong>${h.recurringCount}건</strong></div>
        </div>
      `)}

      <div class="settings-screen-cta-row">
        <button type="button" class="tds-btn secondary" data-screen-action="share-image">이미지로 공유</button>
        <button type="button" class="tds-btn secondary" data-screen-action="save-pdf">PDF 저장</button>
      </div>
    `;
  },

  bind(body, ctx) {
    body.querySelector('[data-screen-action="prev-week"]')?.addEventListener('click', () => {
      weekOffset -= 1;
      ctx.refresh();
    });
    body.querySelector('[data-screen-action="next-week"]')?.addEventListener('click', () => {
      if (weekOffset >= 0) return;
      weekOffset += 1;
      ctx.refresh();
    });
    body.querySelector('[data-screen-action="share-image"]')?.addEventListener('click', () => shareAsImage());
    body.querySelector('[data-screen-action="save-pdf"]')?.addEventListener('click', () => saveAsPdf());
  },
};

// ── 이미지 공유: 캔버스에 요약 리포트를 직접 그린다 (외부 의존성 없음) ──
async function shareAsImage() {
  if (!lastReport) return;
  const r = lastReport;
  const scale = 2;
  const W = 420;
  const H = 300 + Math.min(6, r.byCategory.length) * 34;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const c = canvas.getContext('2d');
  c.scale(scale, scale);
  c.fillStyle = '#14151A';
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#9AA0AE';
  c.font = '13px sans-serif';
  c.fillText(`주간 리포트 · ${lastLabel}`, 24, 36);
  c.fillStyle = '#FFFFFF';
  c.font = 'bold 30px sans-serif';
  c.fillText(fmtWon(r.total), 24, 74);
  c.fillStyle = r.delta > 0 ? '#FF5B6B' : '#3BD68F';
  c.font = '13px sans-serif';
  const deltaText = r.deltaPct == null ? '' : `전주 대비 ${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta).toLocaleString('ko-KR')}원 (${Math.abs(r.deltaPct)}%)`;
  if (deltaText) c.fillText(deltaText, 24, 96);
  c.fillStyle = '#9AA0AE';
  c.fillText(`예산 대비 ${r.budgetProgress == null ? '-' : `${r.budgetProgress}%`} · 무지출 ${r.noSpendDays}일 · 반복 지출 ${r.highlights.recurringCount}건`, 24, 118);
  let y = 156;
  c.fillStyle = '#FFFFFF';
  c.font = 'bold 14px sans-serif';
  c.fillText('카테고리 분석', 24, y);
  y += 22;
  const top = r.byCategory.slice(0, 6);
  for (let i = 0; i < top.length; i++) {
    const cat = top[i];
    c.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
    c.beginPath();
    c.arc(30, y - 4, 5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#E7E9EF';
    c.font = '13px sans-serif';
    c.fillText(cat.name, 44, y);
    const right = `${cat.pct}% · ${fmtWon(cat.amount)}`;
    c.fillText(right, W - 24 - c.measureText(right).width, y);
    // 비중 바
    c.fillStyle = 'rgba(255,255,255,.08)';
    c.fillRect(44, y + 7, W - 92, 4);
    c.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
    c.fillRect(44, y + 7, (W - 92) * (cat.pct / 100), 4);
    y += 34;
  }
  canvas.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], `weekly-report-${lastLabel.replace(/\s/g, '')}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `주간 리포트 ${lastLabel}` });
        return;
      } catch { /* 사용자가 취소하면 다운로드로 대체 */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('이미지를 저장했어요.', 1400, 'success');
  }, 'image/png');
}

// ── PDF 저장: 인쇄 전용 창 → 브라우저 "PDF로 저장" ──
function saveAsPdf() {
  if (!lastReport) return;
  const r = lastReport;
  const h = r.highlights;
  const rows = r.byCategory.map(cat => `<tr><td>${escHtml(cat.name)}</td><td>${cat.pct}%</td><td>${fmtWon(cat.amount)}</td></tr>`).join('');
  const win = window.open('', '_blank');
  if (!win) {
    showToast('팝업이 차단됐어요. 팝업을 허용해주세요.', 2400, 'error');
    return;
  }
  win.document.write(`
    <html><head><meta charset="utf-8"><title>주간 리포트 ${escHtml(lastLabel)}</title>
    <style>
      body { font-family: sans-serif; padding: 32px; color: #111; }
      h1 { font-size: 20px; } h2 { font-size: 15px; margin-top: 24px; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #ccc; padding: 6px 10px; font-size: 13px; text-align: left; }
    </style></head><body>
    <h1>주간 리포트 · ${escHtml(lastLabel)}</h1>
    <p>총 지출 <strong>${fmtWon(r.total)}</strong>
      · 전주 대비 ${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta).toLocaleString('ko-KR')}원
      · 예산 대비 ${r.budgetProgress == null ? '-' : `${r.budgetProgress}%`}
      · 무지출 ${r.noSpendDays}일</p>
    <h2>카테고리 분석</h2>
    <table><tr><th>카테고리</th><th>비중</th><th>금액</th></tr>${rows}</table>
    <h2>주간 하이라이트</h2>
    <p>가장 많이 증가: ${h.topIncrease ? `${escHtml(h.topIncrease.name)} +${h.topIncrease.delta.toLocaleString('ko-KR')}원` : '없음'}<br>
       가장 많이 감소: ${h.topDecrease ? `${escHtml(h.topDecrease.name)} −${Math.abs(h.topDecrease.delta).toLocaleString('ko-KR')}원` : '없음'}<br>
       반복 지출: ${h.recurringCount}건</p>
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 200);
}
