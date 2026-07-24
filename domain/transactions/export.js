// ================================================================
// domain/transactions/export.js — 데이터 내보내기 (순수 함수)
// 설정 10 데이터 내보내기 화면. CSV/Excel(.xls)/PDF 요약 데이터 구성.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-10
// ================================================================

import { isBudgetExcluded, displayCategoryName } from './budget.js';

const TX_TYPE_LABELS = {
  card_payment: '카드 결제',
  transfer_out: '출금',
  transfer_in: '입금',
  internal_transfer: '내부 이체',
  settlement_in: '정산 입금',
  settlement_out: '정산 출금',
};

function txDate(tx) {
  const raw = tx?.occurredAt;
  if (!raw) return null;
  const date = raw.toDate ? raw.toDate() : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDateTime(date) {
  if (!date) return '';
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

// 거래 내역 → 표 행. opts: { includeMemo, includePayment, includeCanceled }
export function buildTransactionRows(txs = [], opts = {}) {
  const header = ['일시', '구분', '카테고리', '거래처', '금액(원)'];
  if (opts.includePayment !== false) header.push('결제 수단');
  if (opts.includeMemo !== false) header.push('메모');
  header.push('예산 제외');
  const rows = (Array.isArray(txs) ? txs : [])
    .filter(tx => opts.includeCanceled === true || !tx.canceled)
    .map(tx => {
      const row = [
        isoDateTime(txDate(tx)),
        TX_TYPE_LABELS[tx.type] || String(tx.type || ''),
        displayCategoryName(tx),
        String(tx.merchant || tx.counterparty || ''),
        String(Math.round(Number(tx.amount) || 0)),
      ];
      if (opts.includePayment !== false) row.push(String(tx.accountName || tx.paymentMethod || ''));
      if (opts.includeMemo !== false) row.push(String(tx.memo || ''));
      row.push(isBudgetExcluded(tx) ? 'Y' : '');
      return row;
    });
  return { header, rows };
}

// 예산·카테고리 목표 → 표 행
export function buildBudgetRows(categories = [], monthKey = '', budgetAmount = 0) {
  const header = ['항목', '월 목표(원)'];
  const rows = [['전체 예산', String(Math.round(Number(budgetAmount) || 0))]];
  for (const cat of Array.isArray(categories) ? categories : []) {
    if (cat.kind !== 'expense') continue;
    const target = Number(cat.monthlyTargets?.[monthKey] ?? cat.target ?? 0) || 0;
    rows.push([String(cat.name || ''), String(Math.round(target))]);
  }
  return { header, rows };
}

// 포인트 내역 → 표 행
export function buildPointRows(entries = []) {
  const header = ['일시', '포인트 항목', '사용(P)', '메모'];
  const rows = (Array.isArray(entries) ? entries : []).map(entry => [
    isoDateTime(txDate({ occurredAt: entry.usedAt })),
    String(entry.pointItemLabel || entry.pointItemId || ''),
    String(Math.round(Number(entry.amount) || 0)),
    String(entry.note || ''),
  ]);
  return { header, rows };
}

// 주간 리포트 요약 → 표 행 (domain/transactions/weekly.js buildWeeklyReport 결과)
export function buildWeeklyReportRows(report = {}, label = '') {
  const header = ['지표', '값'];
  const rows = [
    ['기간', label],
    ['총 지출(원)', String(Math.round(Number(report.total) || 0))],
    ['전주 대비(원)', String(Math.round(Number(report.delta) || 0))],
    ['예산 대비(%)', report.budgetProgress == null ? '-' : String(report.budgetProgress)],
    ['무지출 일수', String(Math.round(Number(report.noSpendDays) || 0))],
  ];
  for (const cat of report.byCategory || []) {
    rows.push([`카테고리 · ${cat.name}`, `${cat.amount} (${cat.pct}%)`]);
  }
  return { header, rows };
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// sections: [{ title, table: { header, rows } }] → BOM 포함 CSV 문자열
export function buildCsv(sections = []) {
  const lines = [];
  for (const section of sections) {
    if (!section?.table) continue;
    if (lines.length) lines.push('');
    if (section.title) lines.push(csvCell(`[${section.title}]`));
    lines.push(section.table.header.map(csvCell).join(','));
    for (const row of section.table.rows) lines.push(row.map(csvCell).join(','));
  }
  return `﻿${lines.join('\r\n')}`;
}

function escXml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Excel이 여는 HTML 테이블 기반 .xls 문서 (의존성 없음)
export function buildExcelHtml(sections = [], title = '내보내기') {
  const body = sections.map(section => `
    <h2>${escXml(section.title || '')}</h2>
    <table border="1">
      <tr>${section.table.header.map(h => `<th>${escXml(h)}</th>`).join('')}</tr>
      ${section.table.rows.map(row => `<tr>${row.map(cell => `<td>${escXml(cell)}</td>`).join('')}</tr>`).join('\n')}
    </table>
  `).join('\n');
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><title>${escXml(title)}</title></head><body>${body}</body></html>`;
}
