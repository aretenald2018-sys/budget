// ================================================================
// urge/render-mindbank.js — Mind Bank review screen
// ================================================================

import { deleteMindbankEntry, getCurrentUser, getUrge, listFinanceGoals, listMindbankEntries, listPacts } from '../data.js';
import { fmtKRW, fmtDateTime, relTime } from '../utils/format.js';
import { summarizeMindbank, weekdayPattern, normalizeDate } from '../utils/mindbank.js?v=20260502-urge-delay-good-choice';
import { formatManwonFromKRW } from '../utils/finance-goals.js';
import { $, escHtml } from '../utils/dom.js';
import { showToast } from '../utils/toast.js';
import { renderWineCellar } from './render-wine-cellar.js?v=20260504-mockup-complete';

const STATE = { range: '30d', entries: [], pacts: [], view: 'choices' };

export async function renderMindbank() {
  const root = $('#tab-mindbank');
  if (!getCurrentUser()) {
    root.innerHTML = '<div class="empty-state"><div class="icon">🔒</div><div>로그인 후 마인드 뱅크를 볼 수 있어요</div></div>';
    return;
  }
  if (STATE.view === 'wine') return renderWineCellar(root);
  root.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';

  const { from, to } = rangeDates(STATE.range);
  const [entries, pacts] = await Promise.all([
    listMindbankEntries({ from, to, max: 100 }),
    listPacts({ max: 120 }).catch(() => []),
  ]);
  STATE.entries = entries;
  STATE.pacts = pacts;
  const summary = summarizeMindbank(entries);
  const pattern = weekdayPattern(entries);

  const successRate = summary.urges ? Math.round((summary.goodChoices / summary.urges) * 100) : 0;
  const risky = pattern.slice().sort((a, b) => b.count - a.count)[0];
  root.innerHTML = `
    <div class="segmented sensory-tabs">
      <button type="button" class="segmented-item active">좋은 선택</button>
      <button type="button" class="segmented-item" onclick="window.openSensoryBank('wine')">와인 셀러</button>
    </div>

    <section class="hero good mb-hero">
      <div class="label">덜어낸 지출</div>
      <div class="amount">${fmtKRW(summary.total).replace('원', '')}<span class="unit">원</span></div>
      <div class="sub">
        <span>덜 먹은 열량 <b>${summary.totalKcalSaved ? `-${summary.totalKcalSaved.toLocaleString('ko-KR')}kcal` : '기록 전'}</b></span>
        <span>좋은 선택 <b>${summary.goodChoices}건</b></span>
      </div>
      <div class="pace">● ${summary.urges}건의 선택 · ${successRate}% 성공률</div>
    </section>

    <div class="segmented range-pill">
      ${['cycle', '30d', 'all'].map(key => `<button type="button" class="segmented-item range-p ${STATE.range === key ? 'active' : ''}" data-range="${key}">${rangeButton(key)}</button>`).join('')}
    </div>

    <div class="mb-stat-grid">
      <div class="mb-stat"><div class="l">절약 금액</div><div class="v pos">${fmtKRW(summary.total).replace('원', '')}</div><div class="sub">${rangeLabel(STATE.range)}</div></div>
      <div class="mb-stat"><div class="l">대체 성공</div><div class="v">${summary.goodChoices}<span style="font-size:13px;color:var(--text-secondary)">/${summary.urges || 0}</span></div><div class="sub">욕구 → 좋은 선택</div></div>
    </div>
    ${pactTrustWidget(pacts)}

    <div class="section-title"><h3>주간 충동 패턴</h3></div>
    <div class="bars">
      ${pattern.map(row => `<div class="bar ${row.count >= (risky?.count || 0) && row.count > 0 ? 'warn' : ''}"><div class="v" style="height:${Math.max(6, row.pct)}%"></div><span class="lbl">${escHtml(row.label.slice(0, 1))}</span></div>`).join('')}
    </div>

    <div class="insight" style="margin-top:24px">
      <span class="tag">패턴 발견</span>
      <div class="head">${risky?.count ? `${escHtml(risky.label)}에 충동이 가장 많아요` : '아직 뚜렷한 패턴은 없어요'}</div>
      <div class="body">${risky?.count ? `최근 기록에서 ${escHtml(risky.label)}에 ${risky.count}건이 몰렸어요. 그 시간대에 미리 대안을 하나 놓아두면 좋아요.` : '기록이 쌓이면 위험한 요일과 시간대를 자동으로 보여줄게요.'}</div>
    </div>

    <div class="section-title"><h3>최근 좋은 선택</h3><button type="button" class="more" onclick="window.startUrgeFlow?.()">추가 ›</button></div>
    ${entries.length
      ? entries.slice(0, 8).map(choiceCard).join('')
      : '<div class="empty-state"><div class="icon">◈</div><div>아직 쌓인 선택이 없습니다</div><div class="st4">홈에서 끌리는 것을 먼저 기록해보세요</div></div>'}
    ${recentPactHistory(pacts)}
  `;

  root.querySelectorAll('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.range = btn.dataset.range;
      renderMindbank();
    });
  });
}

function pactTrustWidget(pacts = []) {
  const fulfilled = pacts.filter(p => p.status === 'fulfilled').length;
  const broken = pacts.filter(p => p.status === 'broken').length;
  const active = pacts.filter(p => !['fulfilled', 'broken', 'archived'].includes(p.status)).length;
  const closed = fulfilled + broken;
  const rate = closed ? Math.round((fulfilled / closed) * 100) : 0;
  const tone = closed >= 3 && rate >= 80 ? 'gold' : closed >= 3 && rate < 55 ? 'warn' : '';
  return `
    <section class="mb-pact-widget ${tone}">
      <div class="mb-pact-copy">
        <span class="tag">약속 신뢰도</span>
        <strong>${closed ? `${rate}% · ${fulfilled}/${closed}개 지킴` : '아직 종료된 약속 없음'}</strong>
        <p>${closed ? `깨진 약속 ${broken}개는 성찰 데이터로 남깁니다. 진행 중인 약속은 ${active}개예요.` : `소계획이나 목표 탭에서 첫 약속을 만들면 이곳에 지킨/깬 기록이 쌓입니다.`}</p>
      </div>
      <button type="button" class="tds-btn sm ${tone === 'warn' ? 'secondary' : 'tonal'}" onclick="localStorage.setItem('budget.planSegment','do');switchTab('cart')">${active ? '약속 보기' : '첫 약속'}</button>
    </section>
  `;
}

function recentPactHistory(pacts = []) {
  const rows = pacts
    .filter(pact => ['fulfilled', 'broken'].includes(pact.status))
    .sort((a, b) => pactClosedAt(b) - pactClosedAt(a))
    .slice(0, 4);
  if (!rows.length) return '';
  return `
    <div class="section-title"><h3>최근 약속 기록</h3><button type="button" class="more" onclick="localStorage.setItem('budget.planSegment','do');switchTab('cart')">전체 ›</button></div>
    <div class="mindbank-pact-history">
      ${rows.map(pact => `
        <button type="button" class="choice choice-card pact-history-card ${pact.status}" onclick="localStorage.setItem('budget.planSegment','do');switchTab('cart')">
          <span class="em">${pact.status === 'fulfilled' ? '✓' : '↺'}</span>
          <span class="body">
            <span class="h">${escHtml(pact.what?.title || '약속')}</span>
            <span class="m">${pact.status === 'fulfilled' ? '지킨 약속' : '깨짐 회고'} · ${escHtml(pact.what?.cost ? fmtKRW(pact.what.cost) : '비용 없음')}</span>
          </span>
          <span class="saved">${pact.status === 'fulfilled' ? '실현' : '회고'}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function pactClosedAt(pact) {
  const value = pact.fulfilledAt || pact.brokenAt || pact.updatedAt || pact.createdAt;
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function openSensoryBank(view = 'choices') {
  STATE.view = view;
  renderMindbank();
}

function choiceCard(entry) {
  const saved = Number(entry.savedAmount) || 0;
  const savedKcal = Number(entry.savedKcal) || 0;
  const isScheduled = entry.choiceType === 'scheduled';
  const isPactFulfilled = entry.choiceType === 'pact_fulfilled';
  const isPactBroken = entry.choiceType === 'pact_broken';
  const neutralLabel = isPactFulfilled ? '약속' : isPactBroken ? '회고' : isScheduled ? '예약' : '기록';
  const delta = saved > 0
    ? `<span class="delta-amt">+${fmtKRW(saved).replace('원', '')}</span>`
    : `<span class="delta-amt neutral">${neutralLabel}</span>`;
  const kcal = savedKcal > 0 ? `<span class="delta-kcal">-${savedKcal.toLocaleString('ko-KR')} kcal</span>` : '';
  return `
    <button type="button" class="choice choice-card actionable" onclick="window.openMindbankEntryDetail('${entry.id}')">
      <span class="em">${isPactFulfilled ? '✓' : isPactBroken ? '↺' : '◈'}</span>
      <span class="body">
        <span class="h">${escHtml(entry.choiceTitle || entry.urgeWhat || '좋은 선택')}</span>
        <span class="m">${escHtml(entry.urgeWhat || '')} · ${relTime(normalizeDate(entry.occurredAt))}${kcal ? ` · ${kcal.replace(/<[^>]+>/g, '')}` : ''}</span>
      </span>
      <span class="saved">${saved > 0 ? `-${fmtKRW(saved).replace('원', '')}` : neutralLabel}</span>
    </button>
  `;
}

async function openEntryDetail(entryId) {
  const entry = STATE.entries.find(item => item.id === entryId) || null;
  if (!entry) {
    showToast('내역을 다시 불러와주세요.', 1800, 'warning');
    return;
  }
  const urge = entry.urgeId ? await getUrge(entry.urgeId) : null;
  const saved = Number(entry.savedAmount) || 0;
  const savedKcal = Number(entry.savedKcal) || 0;
  const isScheduled = entry.choiceType === 'scheduled';
  const isRecordOnly = !isScheduled && ((saved <= 0 && savedKcal <= 0) || entry.choiceType === 'savor');
  const price = Number(entry.urgePrice || urge?.estimatedPrice || 0);
  const goals = await listFinanceGoals({ max: 1 }).catch(() => []);
  const goal = goals[0] || null;
  const root = $('#tab-mindbank');
  root.innerHTML = `
    <div class="mindbank-detail">
      <div class="urge-topbar">
        <button type="button" class="urge-back" onclick="window.renderMindbank()">‹</button>
        <div>선택 상세</div>
        <span></span>
      </div>

      <div class="deposit-card">
        <div class="label">${isScheduled ? '감각뱅크 구매 지연' : (isRecordOnly ? '감각뱅크 향유 기록' : (saved > 0 ? '감각뱅크 입금' : '감각뱅크 기록'))}</div>
        ${saved <= 0 ? `
          <div class="record-row">욕구 기록</div>
        ` : `
          <div class="amount-row">
            <span class="plus">+</span>
            <span class="amt">${fmtKRW(saved).replace('원', '')}</span>
            <span class="won">원</span>
          </div>
        `}
        ${savedKcal > 0 ? `<div class="kcal-row"><span>-</span>${savedKcal.toLocaleString('ko-KR')}<em>kcal</em></div>` : ''}
        <div class="meta">${detailMeta(entry, isRecordOnly)}</div>
        <div class="badge-row">
          ${(entry.badges || []).map(badge => `<span class="badge"><span class="em">✦</span>${escHtml(badge)}</span>`).join('')}
        </div>
      </div>

      <div class="detail-card">
        <div class="detail-row"><span>끌렸던 것</span><strong>${escHtml(entry.urgeWhat || urge?.what || '-')}</strong></div>
        <div class="detail-row"><span>예상 금액</span><strong>${price ? fmtKRW(price) : '금액 없음'}</strong></div>
        ${goal && saved > 0 ? `<div class="detail-row"><span>장기 방향</span><strong>${formatManwonFromKRW(saved)}만큼 ${escHtml(goal.name || '장기 목표')}의 여력을 남긴 선택</strong></div>` : ''}
        ${savedKcal > 0 ? `<div class="detail-row"><span>가벼워진 열량</span><strong>-${savedKcal.toLocaleString('ko-KR')} kcal</strong></div>` : ''}
        <div class="detail-row"><span>선택한 대안</span><strong>${escHtml(entry.choiceTitle || '-')}</strong></div>
        ${entry.calorieMeta?.note ? `<div class="detail-note">${escHtml(calorieDetail(entry.calorieMeta))}</div>` : ''}
        ${entry.choiceDesc || entry.routineDesc ? `<div class="detail-note">${escHtml(entry.routineDesc || entry.choiceDesc)}</div>` : ''}
        <div class="detail-row"><span>카테고리</span><strong>${escHtml(entry.category || urge?.category || '-')}</strong></div>
        <div class="detail-row"><span>그때 기분</span><strong>${escHtml(entry.mood || urge?.mood || '-')}</strong></div>
        <div class="detail-row"><span>맥락</span><strong>${escHtml(urge?.context || '-')}</strong></div>
        <div class="detail-row"><span>기록 시간</span><strong>${fmtDateTime(entry.occurredAt)}</strong></div>
      </div>

      <button type="button" class="tds-btn danger full" onclick="window.deleteMindbankEntryFromDetail('${entry.id}')">이 선택 삭제</button>
    </div>
  `;
}

function calorieDetail(meta) {
  const before = meta.originalPortion ? `처음 ${meta.originalPortion}` : '처음 생각한 양';
  const after = meta.chosenPortion ? `선택 ${meta.chosenPortion}` : '선택한 양';
  const original = Number(meta.originalKcal) || 0;
  const chosen = Number(meta.chosenKcal) || 0;
  const density = Number(meta.kcalPer100g) || 0;
  const kcalText = original || chosen ? ` ${original.toLocaleString('ko-KR')}kcal에서 ${chosen.toLocaleString('ko-KR')}kcal로 계산했어요.` : ' 계산했어요.';
  const densityText = density ? ` 기준 열량은 약 ${density.toLocaleString('ko-KR')}kcal/100g입니다.` : '';
  const note = meta.note || '음식명과 양을 바탕으로 한 추정치입니다.';
  return `${before}에서 ${after} 기준으로${kcalText}${densityText} ${note}`;
}

function detailMeta(entry, isRecordOnly) {
  if (entry.choiceType === 'pact_fulfilled') {
    return `${escHtml(entry.pactTitle || entry.urgeWhat || '약속')}을 실현한 기록입니다. 필요하면 거래 내역에서 Pact 실현 거래 후보를 검토하세요.`;
  }
  if (entry.choiceType === 'pact_broken') {
    return `${escHtml(entry.pactTitle || entry.urgeWhat || '약속')}이 깨진 이유를 다음 조건 조정 데이터로 보관했어요.`;
  }
  if (entry.choiceType === 'scheduled') {
    return `${escHtml(entry.urgeWhat || '기록된 욕구')}을 바로 사지 않고 ${escHtml(entry.choiceTitle || '2주 뒤 다시 보기')}로 미뤘어요. 가용 예산을 더 적절한 시점까지 보류한 좋은 선택이에요.`;
  }
  if (isRecordOnly) {
    return `${escHtml(entry.urgeWhat || '기록된 욕구')}에 대한 끌림을 ${escHtml(entry.choiceTitle || '선택')}으로 남겼어요.`;
  }
  return `${escHtml(entry.urgeWhat || '기록된 충동')} 대신 ${escHtml(entry.choiceTitle || '다른 선택')}을 택했어요.`;
}

async function deleteEntry(entryId) {
  if (!confirm('이 마인드 뱅크 선택을 삭제할까요?')) return;
  try {
    await deleteMindbankEntry(entryId);
    showToast('삭제됨', 1400, 'success');
    await renderMindbank();
  } catch (err) {
    showToast(err.message, 2600, 'error');
  }
}

function rangeDates(range) {
  if (range === 'all') return {};
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (range === 'cycle' ? 14 : 30));
  return { from, to };
}

function rangeLabel(range) {
  return range === 'cycle' ? '이번 격주 감각뱅크' : range === 'all' ? '전체 감각뱅크' : '지난 30일 감각뱅크';
}

function rangeButton(range) {
  return range === 'cycle' ? '격주' : range === 'all' ? '전체' : '30일';
}

window.renderMindbank = () => {
  STATE.view = 'choices';
  return renderMindbank();
};
window.openSensoryBank = openSensoryBank;
window.openMindbankEntryDetail = openEntryDetail;
window.deleteMindbankEntryFromDetail = deleteEntry;
