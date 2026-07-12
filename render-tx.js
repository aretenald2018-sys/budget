// ================================================================
// render-tx.js — 트랜잭션 리스트 (필터 칩 + 무한스크롤)
// ================================================================

import {
  listTransactions, getCategories, getAccountById,
  saveCategorySubcategory, deleteCategorySubcategory,
  displayCategoryName, isBudgetExcluded, isReimbursementExpected, REIMBURSEMENT_CATEGORY_NAME,
  needsPaymentRailReview,
} from './data.js?v=20260712-domain-rules-r2';
import { fmtKRW, fmtMonthKey, monthRange, relTime, fmtDate } from './utils/format.js';
import { $, escHtml } from './utils/dom.js';
import { calendarCells, dailyExpenseMap, pickFocusDay, dayOfMonth } from './utils/tx-calendar.js?v=20260703-android-local-notification';
import { openTxReviewGuide } from './features/transactions/review-guide/index.js?v=20260712-transaction-features';
import { bindTransactionEvents } from './features/transactions/events.js?v=20260712-event-css-ownership';

const STATE = {
  monthKey: fmtMonthKey(new Date()),
  type: 'all',     // all | card_payment | transfer | settlement | internal_transfer
  category: 'all', // all | <category name>
  day: null,
  loading: false,
  cursor: null,
  exhausted: false,
  items: [],
  reviewItems: [],
  typeCounts: {},
  categoryCounts: {},
};
let txScrollBound = false;

const TYPE_GROUPS = {
  all: null,
  card_payment: ['card_payment'],
  transfer: ['transfer_in', 'transfer_out'],
  settlement: ['settlement_in', 'settlement_out'],
  internal_transfer: ['internal_transfer'],
};

export async function renderTx(options = {}) {
  const root = $('#tab-tx');
  const shouldResetFilters = options?.source === 'switchTab';
  if (shouldResetFilters || !root.dataset.bound) {
    resetTxViewState();
    root.dataset.bound = '1';
  }
  bindTransactionEvents(root, {
    'shift-month': target => shiftTxMonth(Number(target.dataset.monthDelta) || 0),
    'clear-day': clearTxDay,
    'select-day': target => selectTxCalendarDay(Number(target.dataset.day) || 0),
    'select-reimbursement': selectReimbursementCategory,
    'open-review-guide': showTxReviewGuide,
    'open-detail': target => window.openTxEditModal?.(target.dataset.txId),
    add: () => window.openTxAddModal?.(),
  });

  // 빌드 (헤더 + 리스트 컨테이너)
  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <button class="tds-icon-btn md" type="button" data-tx-action="shift-month" data-month-delta="-1">‹</button>
      <button class="tx-month-title" type="button" data-tx-action="clear-day" id="tx-month-label">${monthLabel(STATE.monthKey)}</button>
      <button class="tds-icon-btn md" type="button" data-tx-action="shift-month" data-month-delta="1">›</button>
    </div>

    <section id="tx-hero-summary" class="hero tx-hero-card">
      <div class="label">${monthLabel(STATE.monthKey)} 지출 합계</div>
      <div class="amount">불러오는 중<span class="unit">...</span></div>
    </section>

    <div id="tx-calendar-summary" class="tx-calendar-card">
      <div class="empty-state compact"><div class="loading-spinner"></div></div>
    </div>
    <div id="tx-day-sheet"></div>

    <div id="tx-list"></div>
    <button class="fab tx-fab" type="button" data-tx-action="add" aria-label="거래 추가">+</button>
  `;

  // 스크롤 이벤트 (무한스크롤)
  if (!txScrollBound) {
    window.addEventListener('scroll', _onScroll);
    txScrollBound = true;
  }

  renderCalendarSummarySafe();
  await _resetAndLoad();
}

function resetTxViewState() {
  STATE.monthKey = fmtMonthKey(new Date());
  STATE.type = 'all';
  STATE.category = 'all';
  STATE.day = null;
  STATE.cursor = null;
  STATE.exhausted = false;
  STATE.items = [];
  STATE.reviewItems = [];
}

async function _resetAndLoad() {
  STATE.cursor = null;
  STATE.exhausted = false;
  STATE.items = [];
  $('#tx-list').innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  await _loadMore();
}

async function _loadMore() {
  if (STATE.loading || STATE.exhausted) return;
  STATE.loading = true;

  try {
    const { start, end } = monthRange(STATE.monthKey);
    const types = TYPE_GROUPS[STATE.type];

    const opts = { from: start, to: end, max: 30 };
    if (types) opts.types = types;
    if (STATE.cursor) opts.cursor = STATE.cursor;

    const batch = await listTransactions(opts);

    // 카테고리 필터는 클라이언트 사이드 (Firestore 한계)
    const filtered = STATE.category === 'all'
      ? batch
      : batch.filter(t => displayCategoryName(t) === STATE.category);
    const dayFiltered = STATE.day
      ? filtered.filter(t => dayOfMonth(t.occurredAt) === STATE.day)
      : filtered;

    STATE.items = STATE.items.concat(dayFiltered);
    if (batch.length < 30) STATE.exhausted = true;
    if (batch.length > 0) STATE.cursor = batch[batch.length - 1].occurredAt;

    _renderList();
  } finally {
    STATE.loading = false;
  }
}

function _renderList() {
  const list = $('#tx-list');
  if (STATE.items.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">💳</div><div>${STATE.day ? `${STATE.day}일 거래 없음` : '거래 없음'}</div></div>`;
    return;
  }
  // 날짜별 그룹
  const groups = {};
  for (const tx of STATE.items) {
    const d = fmtDate(tx.occurredAt);
    if (!groups[d]) groups[d] = [];
    groups[d].push(tx);
  }
  const html = Object.entries(groups)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => {
      const totals = dailyGroupTotals(items);
      return `
        <div class="tds-list-header tx-day-header">
          <span>${date}</span>
          <span class="tx-day-totals">
            ${totals.income ? `<em class="pos">+${fmtKRW(totals.income)}</em>` : ''}
            ${totals.expense ? `<em class="neg">-${fmtKRW(totals.expense)}</em>` : ''}
            ${totals.reimbursement ? `<em class="refund">환급 ${fmtKRW(totals.reimbursement)}</em>` : ''}
            ${!totals.income && !totals.expense && !totals.reimbursement ? '<em>0원</em>' : ''}
          </span>
        </div>
        ${items.map(tx => txRowHtml(tx)).join('')}
      `;
    }).join('');
  list.innerHTML = html + (STATE.exhausted ? '' : '<div class="st3" style="text-align:center;padding:16px">스크롤해서 더 보기…</div>');
}

function _onScroll() {
  if (window.getCurrentTab && window.getCurrentTab() !== 'tx') return;
  const rem = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
  if (rem < 200) _loadMore();
}

function txRowHtml(tx) {
  const isPos = tx.type === 'transfer_in' || tx.type === 'settlement_in';
  const isInternal = tx.type === 'internal_transfer';
  const cls = isInternal ? 'st3' : (isPos ? 'amount-pos' : 'amount-neg');
  const sign = isInternal ? '' : (isPos ? '+' : '-');
  const account = tx.accountId ? getAccountById(tx.accountId) : null;
  const meta = [
    [displayCategoryName(tx), tx.subcategory].filter(Boolean).join(' / '),
    account?.alias,
    relTime(tx.occurredAt),
  ].filter(Boolean).join(' · ');
  const reviewBadge = tx.needsReview ? '<span class="tds-badge review sm">리뷰</span>' : '';
  const railBadge = needsPaymentRailReview(tx) ? '<span class="tds-badge review sm">네이버페이 보완</span>' : '';
  const excludedBadge = isBudgetExcluded(tx) ? '<span class="tds-badge warning sm">환급예정</span>' : '';
  const pactBadge = tx.pactId ? `<span class="tds-badge pact sm" title="Pact 실현 거래">${escHtml(tx.pactTitle || '약속 실현')}</span>` : '';
  return `
    <button type="button" class="tx-row" data-tx-action="open-detail" data-tx-id="${escHtml(tx.id)}">
      <div class="tx-icon">${typeEmoji(tx.type)}</div>
      <div class="tx-body">
        <div class="tx-merchant">${escHtml(tx.merchant || tx.counterparty || '미분류')} ${reviewBadge} ${railBadge} ${excludedBadge} ${pactBadge}</div>
        <div class="tx-meta">${escHtml(meta)}</div>
      </div>
      <div class="tx-amount ${cls}">${sign}${fmtKRW(tx.amount)}</div>
    </button>
  `;
}

function typeEmoji(type) {
  return ({ card_payment: '💳', transfer_out: '↗️', transfer_in: '↙️', internal_transfer: '🔄', settlement_in: '💰', settlement_out: '💸' })[type] || '📦';
}

function shiftTxMonth(delta) {
  const [y, m] = STATE.monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  STATE.monthKey = fmtMonthKey(d);
  STATE.day = null;
  $('#tx-month-label').textContent = monthLabel(STATE.monthKey);
  renderCalendarSummarySafe();
  _resetAndLoad();
}

function selectTxCalendarDay(day) {
  STATE.day = STATE.day === day ? null : day;
  renderCalendarSummarySafe();
  _resetAndLoad();
}

function selectReimbursementCategory() {
  STATE.category = REIMBURSEMENT_CATEGORY_NAME;
  STATE.day = null;
  syncTxFilterChips();
  renderCalendarSummarySafe();
  _resetAndLoad();
}

function clearTxDay() {
  STATE.day = null;
  renderCalendarSummarySafe();
  _resetAndLoad();
}

function showTxReviewGuide() {
  openTxReviewGuide({
    reviewItems: STATE.reviewItems,
    monthKey: STATE.monthKey,
    dependencies: {
      displayCategoryName,
      getAccountById,
      needsPaymentRailReview,
    },
  });
}

function renderCalendarSummarySafe() {
  _renderCalendarSummary().catch(err => {
    console.error('[tx-calendar-summary]', err);
    const target = $('#tx-calendar-summary');
    if (target) {
      target.innerHTML = `
        <div class="empty-state compact">
          <div>월간 요약을 불러오지 못했습니다</div>
          <div class="st4">거래 목록은 계속 사용할 수 있습니다.</div>
        </div>
      `;
    }
  });
}

async function _renderCalendarSummary() {
  const target = $('#tx-calendar-summary');
  if (!target) return;
  const { start, end } = monthRange(STATE.monthKey);
  const txs = await listTransactions({ from: start, to: end, max: 1000 });
  const expenseTxs = txs
    .filter(t => t.type === 'card_payment' || t.type === 'transfer_out')
    .filter(t => !isBudgetExcluded(t));
  const reimbursementTxs = txs
    .filter(t => t.type === 'card_payment' || t.type === 'transfer_out')
    .filter(t => isReimbursementExpected(t));
  const daily = dailyExpenseMap(expenseTxs);
  const reimbursementDaily = dailyExpenseMap(reimbursementTxs);
  const total = expenseTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const income = txs
    .filter(t => t.type === 'transfer_in' || t.type === 'settlement_in')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const reviewItems = txs
    .filter(t => t.needsReview || needsPaymentRailReview(t))
    .sort((a, b) => dateMs(b.occurredAt) - dateMs(a.occurredAt));
  const reviewCount = reviewItems.length;
  STATE.reviewItems = reviewItems;
  const reimbursementTotal = reimbursementTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  updateTxFilterCounts(txs);
  const focusDay = STATE.day || pickFocusDay(daily, new Date());
  renderSelectedDaySheet(txs, daily, reimbursementDaily);
  const hero = $('#tx-hero-summary');
  if (hero) {
    hero.innerHTML = `
      <div class="label">${monthLabel(STATE.monthKey)} 지출 합계</div>
      <div class="amount">${fmtKRW(total).replace('원', '')}<span class="unit">원</span></div>
      <div class="sub">
        <span>건수 <b>${expenseTxs.length}</b></span>
        <span>수입 <b>+${fmtKRW(income).replace('원', '')}</b></span>
        <span>환급 <b>${fmtKRW(reimbursementTotal).replace('원', '')}</b></span>
      </div>
      ${reviewCount
        ? `<button type="button" class="pace warn tx-review-nudge" data-tx-action="open-review-guide" aria-haspopup="dialog">● 검토 ${reviewCount}건 필요</button>`
        : ''}
    `;
  }
  target.innerHTML = `
    <div class="tx-calendar-head">
      <div>
        <div class="tx-calendar-label">전체 소비금액</div>
        <button type="button" class="tx-calendar-total" data-tx-action="clear-day">${fmtKRW(total)}</button>
        ${reimbursementTotal ? `<button type="button" class="tx-calendar-refund" data-tx-action="select-reimbursement">환급예정 ${fmtKRW(reimbursementTotal)}</button>` : ''}
      </div>
      ${STATE.day ? `<div class="tx-calendar-hint">${STATE.day}일 내역만 보는 중</div>` : ''}
    </div>
    <div class="calendar-grid tx-calendar-grid">
      ${['일', '월', '화', '수', '목', '금', '토'].map(day => `<div class="cal-dow">${day}</div>`).join('')}
      ${calendarCells(daily, reimbursementDaily, start, end, focusDay)}
    </div>
  `;
}

function renderSelectedDaySheet(txs, daily, reimbursementDaily) {
  const target = $('#tx-day-sheet');
  if (!target) return;
  if (!STATE.day) {
    target.innerHTML = '';
    return;
  }
  const dayTxs = txs.filter(t => dayOfMonth(t.occurredAt) === STATE.day);
  const income = dayTxs
    .filter(t => t.type === 'transfer_in' || t.type === 'settlement_in')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const expense = daily[STATE.day] || 0;
  const refund = reimbursementDaily[STATE.day] || 0;
  target.innerHTML = `
    <div class="tx-day-sheet-card">
      <div>
        <strong>${STATE.day}일 내역</strong>
        <span>${dayTxs.length}건 · 지출 ${fmtKRW(expense)}${income ? ` · 수입 +${fmtKRW(income)}` : ''}${refund ? ` · 환급 ${fmtKRW(refund)}` : ''}</span>
      </div>
      <button type="button" class="tx-day-clear" data-tx-action="clear-day">전체</button>
    </div>
  `;
}

function dailyGroupTotals(items) {
  const income = items
    .filter(t => t.type === 'transfer_in' || t.type === 'settlement_in')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const expense = items
    .filter(t => t.type === 'card_payment' || t.type === 'transfer_out')
    .filter(t => !isBudgetExcluded(t))
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const reimbursement = items
    .filter(t => t.type === 'card_payment' || t.type === 'transfer_out')
    .filter(t => isReimbursementExpected(t))
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  return { income, expense, reimbursement };
}

function dateMs(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function syncTxFilterChips() {
  document.querySelectorAll('#tab-tx [data-type]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === STATE.type);
  });
  document.querySelectorAll('#tab-tx [data-cat]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === STATE.category);
  });
  updateTxCountBadges();
}

function updateTxFilterCounts(txs) {
  STATE.typeCounts = {
    all: txs.length,
    card_payment: txs.filter(t => t.type === 'card_payment').length,
    transfer: txs.filter(t => t.type === 'transfer_in' || t.type === 'transfer_out').length,
    settlement: txs.filter(t => t.type === 'settlement_in' || t.type === 'settlement_out').length,
    internal_transfer: txs.filter(t => t.type === 'internal_transfer').length,
  };
  const categoryCounts = { all: txs.length, [REIMBURSEMENT_CATEGORY_NAME]: 0 };
  for (const tx of txs) {
    const key = displayCategoryName(tx);
    categoryCounts[key] = (categoryCounts[key] || 0) + 1;
  }
  STATE.categoryCounts = categoryCounts;
  updateTxCountBadges();
}

function updateTxCountBadges() {
  document.querySelectorAll('#tab-tx [data-type-count]').forEach(el => {
    el.textContent = STATE.typeCounts?.[el.dataset.typeCount] || 0;
  });
  document.querySelectorAll('#tab-tx [data-cat-count]').forEach(el => {
    el.textContent = STATE.categoryCounts?.[el.dataset.catCount] || 0;
  });
}

function monthLabel(monthKey) {
  const [, month] = monthKey.split('-').map(Number);
  return `${month}월`;
}
