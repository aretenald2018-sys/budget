// ================================================================
// render-settle.js — 카카오페이 정산 (더치페이) 뷰
// 절대규칙: 카카오페이 송수금은 무조건 settlement. 일반 통계 제외.
// ================================================================

import { listTransactions } from './data.js?v=20260712-domain-rules-r2';
import { fmtKRW, fmtKRWShort, fmtMonthKey, monthRange, fmtDateTime } from './utils/format.js';
import { $, escHtml } from './utils/dom.js';

const STATE = { mode: 'in' };

export async function renderSettle() {
  const root = $('#tab-settle');
  root.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';

  const monthKey = fmtMonthKey(new Date());
  const { start, end } = monthRange(monthKey);

  // 이번달 정산 + 누적 (최근 6개월)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recent = await listTransactions({
    from: sixMonthsAgo,
    max: 500,
  });
  const all = recent.filter(tx => ['settlement_in', 'settlement_out'].includes(tx.type));

  const monthly = all.filter(t => {
    const d = t.occurredAt.toDate ? t.occurredAt.toDate() : new Date(t.occurredAt);
    return d >= start && d <= end;
  });

  const monthIn = monthly.filter(t => t.type === 'settlement_in').reduce((s, t) => s + t.amount, 0);
  const monthOut = monthly.filter(t => t.type === 'settlement_out').reduce((s, t) => s + t.amount, 0);

  // 상대별 누적 (counterparty 기준)
  const byParty = {};
  for (const tx of all) {
    const key = tx.counterparty || tx.merchant || '알 수 없음';
    if (!byParty[key]) byParty[key] = { name: key, in: 0, out: 0, count: 0, lastAt: null };
    if (tx.type === 'settlement_in') byParty[key].in += tx.amount;
    else byParty[key].out += tx.amount;
    byParty[key].count += 1;
    const d = tx.occurredAt.toDate ? tx.occurredAt.toDate() : new Date(tx.occurredAt);
    if (!byParty[key].lastAt || d > byParty[key].lastAt) byParty[key].lastAt = d;
  }
  const parties = Object.values(byParty).sort((a, b) => Math.abs(b.in - b.out) - Math.abs(a.in - a.out));
  const events = settlementEventGroups(all);

  const net = monthIn - monthOut;
  const filteredMonthly = STATE.mode === 'in'
    ? monthly.filter(t => t.type === 'settlement_in')
    : STATE.mode === 'out'
      ? monthly.filter(t => t.type === 'settlement_out')
      : monthly;

  root.innerHTML = `
    <section class="hero good settle-hero">
      <div class="label">이번달 정산 순액</div>
      <div class="amount">${net >= 0 ? '+' : '-'}${fmtKRW(Math.abs(net)).replace('원', '')}<span class="unit">원</span></div>
      <div class="sub">
        <span>받음 <b>+${fmtKRWShort(monthIn)}</b></span>
        <span>보냄 <b>-${fmtKRWShort(monthOut)}</b></span>
        <span>최근 6개월 <b>${all.length}건</b></span>
      </div>
      <div class="pace">● 정산은 생활비 합계에서 분리되어 표시됩니다</div>
    </section>

    <div class="segmented settle-segment">
      ${settleModeButton('in', '받을 돈', monthIn)}
      ${settleModeButton('out', '줄 돈', monthOut)}
      ${settleModeButton('all', '전체', monthIn + monthOut)}
    </div>

    <div class="section-title"><h3>이벤트 묶음</h3><span>여행·회식·상대 기준</span></div>
    ${events.length === 0
      ? '<div class="empty-state compact"><div>묶을 정산 이벤트가 없습니다</div></div>'
      : events.slice(0, 6).map(settlementEventCard).join('')
    }

    <div class="section-title"><h3>상대별 누적</h3><span>최근 6개월</span></div>
    ${parties.length === 0
      ? '<div class="empty-state"><div class="icon">🔁</div><div>정산 내역 없음</div></div>'
      : parties.map(p => `
          <div class="settle-row settle-card">
            <div>
              <div class="name">${escHtml(p.name)}</div>
              <div class="st4">${p.count}건 · 받음 ${fmtKRWShort(p.in)} · 보냄 ${fmtKRWShort(p.out)}${p.lastAt ? ` · ${fmtDateTime(p.lastAt)}` : ''}</div>
            </div>
            <div class="net ${p.in - p.out >= 0 ? 'amount-pos' : 'amount-neg'}">
              ${p.in - p.out >= 0 ? '+' : ''}${fmtKRWShort(p.in - p.out)}
            </div>
          </div>
        `).join('')
    }

    <div class="section-title" style="margin-top:24px"><h3>최근 정산</h3><span>${filteredMonthly.length}건</span></div>
    ${filteredMonthly.length === 0
      ? '<div class="empty-state"><div>이번달 정산 없음</div></div>'
      : filteredMonthly.slice(0, 20).map(tx => {
          const isIn = tx.type === 'settlement_in';
          return `
            <button type="button" class="tx-row settle-recent-row" data-settle-action="open-transaction" data-id="${escHtml(tx.id)}">
              <div class="tx-icon">${isIn ? '💰' : '💸'}</div>
              <div class="tx-body">
                <div class="tx-merchant">${escHtml(tx.counterparty || tx.merchant || '알 수 없음')}</div>
                <div class="tx-meta">${fmtDateTime(tx.occurredAt)}${settlementEventName(tx) ? ` · ${escHtml(settlementEventName(tx))}` : ''}</div>
              </div>
              <div class="tx-amount ${isIn ? 'amount-pos' : 'amount-neg'}">${isIn ? '+' : '-'}${fmtKRW(tx.amount)}</div>
            </button>
          `;
        }).join('')
    }
  `;
  bindSettleEvents(root);
}

function bindSettleEvents(root) {
  if (root.dataset.settleEventsBound === 'true') return;
  root.dataset.settleEventsBound = 'true';
  root.addEventListener('click', event => {
    const target = event.target?.closest?.('[data-settle-action]');
    if (!target || !root.contains(target)) return;
    if (target.dataset.settleAction === 'select-mode') {
      STATE.mode = ['in', 'out', 'all'].includes(target.dataset.mode) ? target.dataset.mode : 'in';
      renderSettle();
      return;
    }
    if (target.dataset.settleAction === 'open-transaction') {
      window.openTxEditModal?.(target.dataset.id);
    }
  });
}

function settlementEventGroups(txs) {
  const map = {};
  for (const tx of txs) {
    const key = settlementEventKey(tx);
    const name = settlementEventName(tx) || tx.counterparty || tx.merchant || '정산 이벤트';
    if (!map[key]) {
      map[key] = {
        id: key,
        name,
        in: 0,
        out: 0,
        inCount: 0,
        outCount: 0,
        count: 0,
        lastAt: null,
        parties: new Set(),
      };
    }
    const row = map[key];
    if (tx.type === 'settlement_in') {
      row.in += Number(tx.amount) || 0;
      row.inCount += 1;
    } else {
      row.out += Number(tx.amount) || 0;
      row.outCount += 1;
    }
    row.count += 1;
    if (tx.counterparty || tx.merchant) row.parties.add(tx.counterparty || tx.merchant);
    const d = tx.occurredAt?.toDate ? tx.occurredAt.toDate() : new Date(tx.occurredAt);
    if (!Number.isNaN(d.getTime()) && (!row.lastAt || d > row.lastAt)) row.lastAt = d;
  }
  return Object.values(map)
    .sort((a, b) => (b.lastAt?.getTime?.() || 0) - (a.lastAt?.getTime?.() || 0));
}

function settlementEventKey(tx) {
  return tx.eventId || tx.settlementEventId || normalizeEventName(settlementEventName(tx)) || `party:${normalizeEventName(tx.counterparty || tx.merchant || 'unknown')}`;
}

function settlementEventName(tx) {
  return tx.eventName || tx.settlementEventName || tx.groupName || tx.sharedPayment?.eventName || '';
}

function normalizeEventName(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

function settlementEventCard(event) {
  const totalCount = Math.max(1, event.count);
  const inPct = Math.round((event.inCount / totalCount) * 100);
  const outPct = Math.round((event.outCount / totalCount) * 100);
  const net = event.in - event.out;
  return `
    <article class="settle-event-card">
      <div class="settle-event-head">
        <div>
          <strong>${escHtml(event.name)}</strong>
          <span>${event.parties.size}명 · ${event.count}건${event.lastAt ? ` · ${fmtDateTime(event.lastAt)}` : ''}</span>
        </div>
        <b class="${net >= 0 ? 'amount-pos' : 'amount-neg'}">${net >= 0 ? '+' : ''}${fmtKRWShort(net)}</b>
      </div>
      <div class="settle-progress">
        <div class="settle-progress-row"><span>받음 ${event.inCount}건</span><i><b class="pos" style="width:${inPct}%"></b></i><em>+${fmtKRWShort(event.in)}</em></div>
        <div class="settle-progress-row"><span>보냄 ${event.outCount}건</span><i><b class="neg" style="width:${outPct}%"></b></i><em>-${fmtKRWShort(event.out)}</em></div>
      </div>
    </article>
  `;
}

function settleModeButton(mode, label, amount) {
  return `
    <button type="button" class="segmented-item ${STATE.mode === mode ? 'active' : ''}" data-settle-action="select-mode" data-mode="${mode}">
      ${label} <em>${fmtKRWShort(amount)}</em>
    </button>
  `;
}
