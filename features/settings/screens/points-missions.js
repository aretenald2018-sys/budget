// ================================================================
// 설정 05 포인트 — 절약한 날마다 쌓이는 적립
//
// 규칙은 한 문장이다.
//   지난달 일 평균보다 적게 쓴 날 → 항목별 '목표 금액 × 하루 적립률'을 적립.
//
// 예전에는 이 화면이 두 가지를 섞어 놓고 있었다.
//   · 무지출 데이 / 카테고리 상한 / 예산 페이스 같은 주간 '미션'
//   · 아낀 금액에 비례해 쌓이던 포인트
// 미션은 위 규칙과 아무 관계가 없어 전부 걷어냈고, 포인트는 성공한 날 정액
// 적립으로 바꿨다. 이 화면에서는 하루 적립률과 목표 금액만 만지면 된다.
// ================================================================

import {
  getAppSettings, saveAppSettings, getCategories,
  listTransactions, listRewardPointEntries,
  displayCategoryName, isBudgetExcluded,
} from '../../../data.js';
import {
  buildRewardSavingsSummary, rewardTxWindowStart, MAX_DAILY_RATE,
} from '../../../utils/reward-savings.js';
import { showToast } from '../../../utils/toast.js';
import {
  escHtml, fmtWon, progressHtml, sectionHtml, primaryButtonHtml,
  markDirtyOnChange, clearDirty, sortedExpenseCategories,
} from './shared.js';

let showPointHistory = false;

async function loadSummary(appSettings) {
  const rewardSettings = appSettings.rewardSavings || {};
  const [txs, entries] = await Promise.all([
    listTransactions({ from: rewardTxWindowStart(new Date()), to: new Date(), max: 3000 }).catch(() => []),
    listRewardPointEntries({ max: 300 }).catch(() => []),
  ]);
  const summary = buildRewardSavingsSummary({
    transactions: txs.filter(tx => !isBudgetExcluded(tx)),
    pointEntries: entries,
    categoryNames: sortedExpenseCategories(getCategories()).map(cat => cat.name),
    getCategoryName: displayCategoryName,
    now: new Date(),
    ...rewardSettings,
  });
  return { summary, entries };
}

function ratePct(rate) {
  const pct = (Number(rate) || 0) * 100;
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 100) / 100);
}

function itemRowHtml(bucket) {
  return `
    <div class="settings-point-row" data-point-item-id="${escHtml(bucket.key)}">
      <strong class="settings-point-name">${escHtml(bucket.label)}</strong>
      <label class="settings-point-field">
        <span>하루 적립률 (%)</span>
        <input class="tds-input" inputmode="decimal" data-point-rate value="${ratePct(bucket.rate)}" aria-label="${escHtml(bucket.label)} 하루 적립률(%)">
      </label>
      <label class="settings-point-field">
        <span>목표 금액 (원)</span>
        <input class="tds-input" inputmode="numeric" data-point-target value="${Math.round(bucket.targetAmount) || ''}" placeholder="0" aria-label="${escHtml(bucket.label)} 목표 금액(원)">
      </label>
      <small class="settings-point-meta">
        성공한 날 <b data-point-daily>${bucket.dailyPoints.toLocaleString('ko-KR')}P</b>
        · 이번 달 ${bucket.earnedMonthPoints.toLocaleString('ko-KR')}P 적립
      </small>
    </div>
  `;
}

export const pointsMissionsScreen = {
  id: 'settings-screen-points',
  title: '포인트',

  async render() {
    const appSettings = await getAppSettings();
    const { summary, entries } = await loadSummary(appSettings);
    const buckets = (summary.pointBuckets || []).filter(bucket => !bucket.historyOnly);
    const balance = buckets.reduce((sum, b) => sum + (Number(b.monthPoints) || 0), 0);
    const earned = buckets.reduce((sum, b) => sum + Math.max(0, Number(b.earnedMonthPoints) || 0), 0);
    const spent = buckets.reduce((sum, b) => sum + Math.max(0, Number(b.spentMonthPoints) || 0), 0);
    const successPct = summary.elapsedDays > 0
      ? Math.round((summary.successDays / summary.elapsedDays) * 100)
      : 0;

    return `
      <div class="settings-screen-hero compact">
        <span>이번 달 포인트</span>
        <strong>${balance.toLocaleString('ko-KR')}P</strong>
        <div class="settings-screen-hero-sub">
          <span class="pos">+${earned.toLocaleString('ko-KR')}P 적립</span>
          <span>${spent.toLocaleString('ko-KR')}P 사용</span>
        </div>
      </div>

      ${sectionHtml('오늘', `
        ${summary.baselineReady ? `
          <div class="settings-point-today ${summary.todaySuccess ? 'ok' : ''}">
            <strong>${summary.todaySuccess ? '오늘은 적립돼요' : '오늘은 아직이에요'}</strong>
            <span>오늘 ${fmtWon(summary.todaySpend)} · 기준 ${fmtWon(summary.dailyBaseline)}</span>
          </div>
          ${progressHtml(successPct)}
          <small class="settings-screen-note">
            이번 달 <b>${summary.successDays}일</b> 적립 (${summary.elapsedDays}일 중 ${successPct}%).
            <b>지난달 일 평균</b>보다 적게 쓴 날마다 아래 금액이 쌓여요.
          </small>
        ` : `
          <div class="settings-screen-empty">지난달 지출 기록이 있어야 기준이 잡혀요.</div>
        `}
      `)}

      ${sectionHtml('적립 항목', `
        <div class="settings-point-list">
          ${buckets.map(itemRowHtml).join('') || '<div class="settings-screen-empty">적립 항목이 없어요.</div>'}
        </div>
        <small class="settings-screen-note">하루 적립률은 최대 ${ratePct(MAX_DAILY_RATE)}%까지예요.</small>
      `)}

      ${primaryButtonHtml('save', '저장하기')}

      <button type="button" class="tds-btn settings-screen-cta secondary" data-screen-action="toggle-history">포인트 사용 내역</button>
      <div class="settings-point-history" ${showPointHistory ? '' : 'hidden'}>
        ${entries.slice(0, 20).map(entry => `
          <div class="settings-row">
            <div class="l"><div><div class="name">${escHtml(entry.pointItemLabel || entry.pointItemId || '-')}</div><div class="desc">${escHtml(entry.note || '')}</div></div></div>
            <div class="r neg">-${Math.round(Number(entry.amount) || 0).toLocaleString('ko-KR')}P</div>
          </div>
        `).join('') || '<div class="settings-screen-empty">포인트 사용 내역이 없어요.</div>'}
      </div>
    `;
  },

  bind(body, ctx) {
    markDirtyOnChange(body);
    const readMoney = input => Math.max(0, Math.round(Number(String(input?.value || '').replace(/[^\d]/g, '')) || 0));
    const readRate = input => {
      const n = Number(String(input?.value || '').replace(/[^\d.]/g, ''));
      if (!Number.isFinite(n) || n < 0) return 0;
      return Math.min(MAX_DAILY_RATE, n / 100);
    };

    // 적립률·목표 금액을 만지면 '성공한 날 몇 P'가 바로 따라 움직인다.
    const syncDaily = row => {
      const points = Math.round(readMoney(row.querySelector('[data-point-target]')) * readRate(row.querySelector('[data-point-rate]')));
      const el = row.querySelector('[data-point-daily]');
      if (el) el.textContent = `${points.toLocaleString('ko-KR')}P`;
    };
    body.querySelectorAll('[data-point-item-id]').forEach(row => {
      row.querySelectorAll('[data-point-rate], [data-point-target]').forEach(input => {
        input.addEventListener('input', () => syncDaily(row));
      });
    });

    body.querySelector('[data-screen-action="toggle-history"]')?.addEventListener('click', () => {
      showPointHistory = !showPointHistory;
      const panel = body.querySelector('.settings-point-history');
      if (panel) panel.hidden = !showPointHistory;
    });

    body.querySelector('[data-screen-action="save"]')?.addEventListener('click', async () => {
      const button = body.querySelector('[data-screen-action="save"]');
      if (button.disabled) return;
      button.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = '저장 중…';
      try {
        const current = await getAppSettings();
        const byId = new Map((current.rewardSavings?.pointItems || []).map(item => [item.id, item]));
        const pointItems = [...body.querySelectorAll('[data-point-item-id]')].map((row, index) => {
          const id = row.dataset.pointItemId;
          const previous = byId.get(id) || {};
          return {
            ...previous,
            id,
            label: previous.label || id,
            rate: readRate(row.querySelector('[data-point-rate]')),
            targetAmount: readMoney(row.querySelector('[data-point-target]')),
            enabled: previous.enabled !== false,
            order: Number.isFinite(Number(previous.order)) ? Number(previous.order) : (index + 1) * 10,
          };
        });
        await saveAppSettings({ rewardSavings: { ...current.rewardSavings, pointItems } });
        clearDirty(body);
        showToast('포인트 설정을 저장했어요.', 1400, 'success');
        window.refreshCurrentTab?.();
        ctx.refresh();
      } catch (err) {
        showToast(err.message || '포인트 설정 저장 실패', 2400, 'error');
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  },
};
