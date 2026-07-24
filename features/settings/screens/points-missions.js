// ================================================================
// 설정 05 포인트/미션 — 즉시 반영 화면
// 포인트는 기존 rewardSavings·reward_point_entries 데이터를 재사용하고,
// 미션만 신규 개념(설정에 정의 저장, 진행률은 거래에서 계산)이다.
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-05
// ================================================================

import {
  getAppSettings, saveAppSettings, getCategories,
  listTransactions, listRewardPointEntries, aggregateByCategory,
  displayCategoryName, isBudgetExcluded,
} from '../../../data.js';
import { buildRewardSavingsSummary } from '../../../utils/reward-savings.js';
import { buildMissionProgress, buildDefaultMissions } from '../../../domain/rewards/missions.js';
import { weekRange, weeklyBudgetFor } from '../../../domain/transactions/weekly.js';
import { fmtMonthKey, monthRange } from '../../../utils/format.js';
import { showToast } from '../../../utils/toast.js';
import { escHtml, switchHtml, progressHtml, sectionHtml, sortedExpenseCategories } from './shared.js';

let showAllMissions = false;
let showPointHistory = false;

async function loadPointSummary(appSettings) {
  const rewardSettings = appSettings.rewardSavings || {};
  const lookbackDays = Math.max(30, Math.round(Number(rewardSettings.lookbackDays) || 180));
  const from = new Date();
  from.setDate(from.getDate() - lookbackDays - 10);
  from.setHours(0, 0, 0, 0);
  const [txs, entries] = await Promise.all([
    listTransactions({ from, to: new Date(), max: 3000 }).catch(() => []),
    listRewardPointEntries({ max: 300 }).catch(() => []),
  ]);
  const controlNames = sortedExpenseCategories(getCategories()).map(cat => cat.name);
  const summary = buildRewardSavingsSummary({
    transactions: txs.filter(tx => !isBudgetExcluded(tx)),
    pointEntries: entries,
    categoryNames: controlNames,
    getCategoryName: displayCategoryName,
    now: new Date(),
    ...rewardSettings,
  });
  const buckets = Array.isArray(summary?.pointBuckets) ? summary.pointBuckets : [];
  return {
    entries,
    balance: buckets.reduce((sum, b) => sum + (Number(b.monthPoints) || 0), 0),
    earned: buckets.reduce((sum, b) => sum + Math.max(0, Number(b.earnedMonthPoints) || 0), 0),
    spent: buckets.reduce((sum, b) => sum + Math.max(0, Number(b.spentMonthPoints) || 0), 0),
  };
}

// 자동 참여: 미션이 없거나 전부 지난 주 것이면 이번 주 기본 미션을 시드한다.
async function ensureMissions(appSettings) {
  const missions = appSettings.missions;
  if (!missions.autoJoin) return missions.items;
  const thisWeek = weekRange(new Date());
  const startISO = thisWeek.start.toISOString().slice(0, 10);
  const hasCurrent = missions.items.some(item => item.period?.start >= startISO);
  if (hasCurrent) return missions.items;

  const monthKey = fmtMonthKey(new Date());
  const { start, end } = monthRange(monthKey);
  const monthTxs = await listTransactions({ from: start, to: end, max: 1000 }).catch(() => []);
  const topCategoryName = aggregateByCategory(monthTxs)[0]?.name || '';
  const weeklyBudget = weeklyBudgetFor({
    budgetAmount: appSettings.budget.amount,
    cycle: appSettings.budget.cycle,
    range: thisWeek,
  });
  const seeded = buildDefaultMissions(new Date(), {
    difficulty: missions.difficulty,
    weeklyBudget,
    topCategoryName,
  });
  const items = [...missions.items.filter(item => !item.completedAt), ...seeded].slice(-20);
  await saveAppSettings({ missions: { ...missions, items } });
  return items;
}

export const pointsMissionsScreen = {
  id: 'settings-screen-points',
  title: '포인트 / 미션',

  async render() {
    const appSettings = await getAppSettings();
    const [points, missionItems] = await Promise.all([
      loadPointSummary(appSettings),
      ensureMissions(appSettings).catch(() => appSettings.missions.items),
    ]);

    const missionRangeStart = missionItems
      .map(item => item.period?.start).filter(Boolean).sort()[0];
    const missionTxs = missionRangeStart
      ? await listTransactions({ from: new Date(missionRangeStart), to: new Date(), max: 1000 }).catch(() => [])
      : [];
    const active = missionItems.filter(item => item.active !== false && !item.completedAt);
    const shown = showAllMissions ? active : active.slice(0, 3);

    return `
      <div class="settings-screen-hero">
        <span>내 포인트</span>
        <strong>${points.balance.toLocaleString('ko-KR')}P</strong>
        <div class="settings-screen-hero-sub">
          <span class="pos">이번 달 +${points.earned.toLocaleString('ko-KR')}P 획득</span>
          <span>사용 ${points.spent.toLocaleString('ko-KR')}P</span>
        </div>
      </div>

      ${sectionHtml('진행 중 미션', `
        <div class="settings-mission-list">
          ${shown.length ? shown.map(mission => {
            const progress = buildMissionProgress(mission, missionTxs, new Date());
            return `
              <div class="settings-mission-row ${progress.failed ? 'failed' : ''}">
                <div class="settings-mission-head">
                  <strong>${escHtml(mission.title)}</strong>
                  <span class="settings-mission-reward">+${mission.rewardPoints}P</span>
                </div>
                ${progressHtml(progress.pct, progress.failed ? 'warning' : '')}
                <div class="settings-mission-meta">
                  <span>${escHtml(progress.currentText)}</span>
                  <span>${progress.failed ? '기준 초과' : progress.done ? '달성!' : progress.daysLeft != null ? `${progress.daysLeft}일 남음` : ''}</span>
                </div>
              </div>
            `;
          }).join('') : '<div class="settings-screen-empty">진행 중인 미션이 없어요. 자동 참여를 켜면 매주 미션이 만들어져요.</div>'}
        </div>
        ${active.length > 3 ? `<button type="button" class="tds-text-btn" data-screen-action="toggle-all-missions">${showAllMissions ? '접기' : `모든 미션 보기 (${active.length})`}</button>` : ''}
      `)}

      ${sectionHtml('미션 설정', `
        <div class="settings-toggle-list">
          <div class="settings-toggle-row"><span>신규 미션 자동 참여</span>${switchHtml('autoJoin', appSettings.missions.autoJoin)}</div>
          <div class="settings-toggle-row"><span>난이도</span>
            <select class="tds-select" data-screen-field="difficulty" aria-label="미션 난이도">
              <option value="normal" ${appSettings.missions.difficulty === 'normal' ? 'selected' : ''}>보통</option>
              <option value="high" ${appSettings.missions.difficulty === 'high' ? 'selected' : ''}>높음</option>
            </select>
          </div>
        </div>
      `)}

      <button type="button" class="tds-btn settings-screen-cta secondary" data-screen-action="toggle-history">포인트 내역 보기</button>
      <div class="settings-point-history" ${showPointHistory ? '' : 'hidden'}>
        ${points.entries.slice(0, 20).map(entry => `
          <div class="settings-row">
            <div class="l"><div><div class="name">${escHtml(entry.pointItemLabel || entry.pointItemId || '-')}</div><div class="desc">${escHtml(entry.note || '')}</div></div></div>
            <div class="r neg">-${Math.round(Number(entry.amount) || 0).toLocaleString('ko-KR')}P</div>
          </div>
        `).join('') || '<div class="settings-screen-empty">포인트 사용 내역이 없어요.</div>'}
      </div>
    `;
  },

  bind(body, ctx) {
    body.querySelector('[data-screen-action="toggle-all-missions"]')?.addEventListener('click', () => {
      showAllMissions = !showAllMissions;
      ctx.refresh();
    });
    body.querySelector('[data-screen-action="toggle-history"]')?.addEventListener('click', () => {
      showPointHistory = !showPointHistory;
      const panel = body.querySelector('.settings-point-history');
      if (panel) panel.hidden = !showPointHistory;
    });

    const saveMissionSettings = async () => {
      const autoJoin = !!body.querySelector('[data-screen-field="autoJoin"]')?.checked;
      const difficulty = body.querySelector('[data-screen-field="difficulty"]')?.value || 'normal';
      try {
        const current = await getAppSettings();
        await saveAppSettings({ missions: { ...current.missions, autoJoin, difficulty } });
        showToast('미션 설정을 저장했어요.', 1000, 'success');
      } catch (err) {
        showToast(err.message || '미션 설정 저장 실패', 2400, 'error');
      }
    };
    body.querySelector('[data-screen-field="autoJoin"]')?.addEventListener('change', saveMissionSettings);
    body.querySelector('[data-screen-field="difficulty"]')?.addEventListener('change', saveMissionSettings);
  },
};
