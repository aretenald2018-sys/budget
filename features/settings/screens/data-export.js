// ================================================================
// 설정 10 데이터 내보내기 — 액션형 화면
// CSV/Excel(.xls)/PDF(요약본·인쇄) 생성은 domain/transactions/export.js.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-10
// ================================================================

import {
  getAppSettings, saveAppSettings, getCategories,
  listTransactions, listRewardPointEntries,
} from '../../../data.js';
import {
  buildTransactionRows, buildBudgetRows, buildPointRows, buildWeeklyReportRows,
  buildCsv, buildExcelHtml,
} from '../../../domain/transactions/export.js';
import { weekRange, buildWeeklyReport, weeklyBudgetFor } from '../../../domain/transactions/weekly.js';
import { fmtMonthKey, fmtMonthLabel, monthRange } from '../../../utils/format.js';
import { showToast } from '../../../utils/toast.js';
import { escHtml, radioHtml, switchHtml, sectionHtml, downloadBlob } from './shared.js';

function periodOptions() {
  const now = new Date();
  const options = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = fmtMonthKey(d);
    options.push({ value: key, label: `${fmtMonthLabel(key)}${i === 0 ? ' (이번 달)' : ''}` });
  }
  options.push({ value: 'last3', label: '최근 3개월' });
  return options;
}

function periodRange(value) {
  if (value === 'last3') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { start, end: now, label: '최근 3개월' };
  }
  const { start, end } = monthRange(value);
  return { start, end, label: fmtMonthLabel(value) };
}

function checkboxRow(name, label, checked) {
  return `
    <label class="settings-check-row">
      <input type="checkbox" data-export-data="${name}" ${checked ? 'checked' : ''}>
      <span>${escHtml(label)}</span>
    </label>
  `;
}

export const dataExportScreen = {
  id: 'settings-screen-export',
  title: '데이터 내보내기',

  async render() {
    const appSettings = await getAppSettings();
    const prefs = appSettings.exportPrefs;
    return `
      ${sectionHtml('기간 선택', `
        <select class="tds-select" data-screen-field="period" aria-label="내보낼 기간">
          ${periodOptions().map((opt, i) => `<option value="${opt.value}" ${i === 0 ? 'selected' : ''}>${escHtml(opt.label)}</option>`).join('')}
        </select>
      `)}

      ${sectionHtml('내보낼 데이터', `
        <div class="settings-check-list">
          ${checkboxRow('transactions', '거래 내역', true)}
          ${checkboxRow('budgets', '예산 및 목표', true)}
          ${checkboxRow('categoryGoals', '카테고리 목표', true)}
          ${checkboxRow('points', '포인트 내역', true)}
          ${checkboxRow('weekly', '주간 리포트', true)}
        </div>
      `)}

      ${sectionHtml('파일 형식', `
        <div class="settings-radio-group vertical">
          ${radioHtml('format', 'csv', 'CSV', prefs.format === 'csv')}
          ${radioHtml('format', 'excel', 'Excel', prefs.format === 'excel')}
          ${radioHtml('format', 'pdf', 'PDF (요약본)', prefs.format === 'pdf')}
        </div>
      `)}

      ${sectionHtml('세부 옵션', `
        <div class="settings-toggle-list">
          <div class="settings-toggle-row"><span>메모 포함</span>${switchHtml('includeMemo', prefs.includeMemo)}</div>
          <div class="settings-toggle-row"><span>결제 수단 포함</span>${switchHtml('includePayment', prefs.includePayment)}</div>
          <div class="settings-toggle-row"><span>취소 거래 포함</span>${switchHtml('includeCanceled', prefs.includeCanceled)}</div>
        </div>
      `)}

      <button type="button" class="tds-btn settings-screen-cta" data-screen-action="make-file">파일 만들기</button>
    `;
  },

  bind(body) {
    body.querySelector('[data-screen-action="make-file"]')?.addEventListener('click', async () => {
      const field = name => body.querySelector(`[data-screen-field="${name}"]`);
      const dataChecked = name => !!body.querySelector(`[data-export-data="${name}"]`)?.checked;
      const format = body.querySelector('[data-screen-field="format"]:checked')?.value || 'csv';
      const opts = {
        includeMemo: !!field('includeMemo')?.checked,
        includePayment: !!field('includePayment')?.checked,
        includeCanceled: !!field('includeCanceled')?.checked,
      };
      const periodValue = field('period')?.value || fmtMonthKey(new Date());
      const { start, end, label } = periodRange(periodValue);
      const btn = body.querySelector('[data-screen-action="make-file"]');
      btn.disabled = true;
      btn.textContent = '만드는 중…';
      try {
        const monthKey = fmtMonthKey(new Date());
        const appSettings = await getAppSettings();
        const sections = [];

        if (dataChecked('transactions')) {
          const txs = await listTransactions({ from: start, to: end, max: 3000 }).catch(() => []);
          sections.push({ title: `거래 내역 (${label})`, table: buildTransactionRows(txs, opts) });
        }
        if (dataChecked('budgets') || dataChecked('categoryGoals')) {
          sections.push({
            title: '예산 및 카테고리 목표',
            table: buildBudgetRows(getCategories(), monthKey, appSettings.budget.amount),
          });
        }
        if (dataChecked('points')) {
          const entries = await listRewardPointEntries({ from: start, to: end, max: 500 }).catch(() => []);
          sections.push({ title: '포인트 내역', table: buildPointRows(entries) });
        }
        if (dataChecked('weekly')) {
          const range = weekRange(new Date());
          const prevRange = weekRange(new Date(), { offsetWeeks: -1 });
          const [txs, prevTxs] = await Promise.all([
            listTransactions({ from: range.start, to: range.end, max: 1000 }).catch(() => []),
            listTransactions({ from: prevRange.start, to: prevRange.end, max: 1000 }).catch(() => []),
          ]);
          const weeklyBudget = weeklyBudgetFor({ budgetAmount: appSettings.budget.amount, cycle: appSettings.budget.cycle, range });
          const report = buildWeeklyReport({ txs, prevTxs, weeklyBudget, range });
          sections.push({ title: '주간 리포트', table: buildWeeklyReportRows(report, range.label) });
        }
        if (!sections.length) {
          showToast('내보낼 데이터를 선택해주세요.', 1800, 'info');
          return;
        }

        await saveAppSettings({ exportPrefs: { format, ...opts } });
        const stamp = new Date().toISOString().slice(0, 10);

        if (format === 'csv') {
          const blob = downloadBlob(buildCsv(sections), `budget-export-${stamp}.csv`, 'text/csv;charset=utf-8');
          await shareFileIfPossible(blob, `budget-export-${stamp}.csv`, 'text/csv');
        } else if (format === 'excel') {
          const blob = downloadBlob(buildExcelHtml(sections, `가계부 내보내기 ${label}`), `budget-export-${stamp}.xls`, 'application/vnd.ms-excel');
          await shareFileIfPossible(blob, `budget-export-${stamp}.xls`, 'application/vnd.ms-excel');
        } else {
          printSummaryPdf(sections, label);
        }
        showToast('파일을 만들었어요.', 1600, 'success');
      } catch (err) {
        showToast(err.message || '파일 생성 실패', 2600, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '파일 만들기';
      }
    });
  },
};

// 파일 생성 완료 → 시스템 공유 시트 (지원 시). 다운로드는 이미 완료된 상태.
async function shareFileIfPossible(blob, filename, type) {
  const file = new File([blob], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
    } catch { /* 공유 취소는 무시 (다운로드는 완료됨) */ }
  }
}

function printSummaryPdf(sections, label) {
  const win = window.open('', '_blank');
  if (!win) {
    showToast('팝업이 차단됐어요. 팝업을 허용해주세요.', 2400, 'error');
    return;
  }
  const body = sections.map(section => `
    <h2>${escHtml(section.title)}</h2>
    <table><tr>${section.table.header.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr>
    ${section.table.rows.slice(0, 200).map(row => `<tr>${row.map(cell => `<td>${escHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>
    ${section.table.rows.length > 200 ? `<p>… 외 ${section.table.rows.length - 200}행 (전체는 CSV로 내보내세요)</p>` : ''}
  `).join('');
  win.document.write(`
    <html><head><meta charset="utf-8"><title>가계부 내보내기 ${escHtml(label)}</title>
    <style>
      body { font-family: sans-serif; padding: 32px; color: #111; }
      h1 { font-size: 20px; } h2 { font-size: 15px; margin-top: 24px; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #ccc; padding: 4px 8px; font-size: 11px; text-align: left; }
    </style></head><body><h1>가계부 내보내기 · ${escHtml(label)}</h1>${body}</body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 200);
}
