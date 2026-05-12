// ================================================================
// render-report.js — 소비 페이스 리포트
// 기준 전환: 이번 2주 조절비 / 이번 달 전체
// ================================================================

import {
  listTransactions, getCategories, aggregateByCategory, listMindbankEntries, listFinanceGoals, updateTransaction,
  displayCategoryName, isBudgetExcluded, isReimbursementExpected, REIMBURSEMENT_CATEGORY_NAME,
  listDevIdeas, saveDevIdea, updateDevIdea, deleteDevIdea,
  listPacts, getAppSettings,
} from './data.js';
import { fmtKRW, fmtKRWShort, fmtMonthKey, monthRange, fmtDateTime } from './utils/format.js';
import { cycleKey, cycleLabel, cycleRange } from './utils/cycles.js';
import { summarizeMindbank } from './utils/mindbank.js';
import { buildGoalImpact, formatManwonFromKRW } from './utils/finance-goals.js';
import { $, escHtml } from './utils/dom.js';
import { showToast } from './utils/toast.js';

const STATE = {
  monthKey: fmtMonthKey(new Date()),
  viewMode: 'cycle',
  monthTxs: [],
  cycleTxs: [],
  categories: [],
  rootSelector: '#tab-report',
  homeMode: false,
  activeDrill: null,
};

export async function renderReport(options = {}) {
  STATE.rootSelector = options.rootSelector || STATE.rootSelector || '#tab-report';
  STATE.homeMode = !!options.homeMode;
  const root = $(STATE.rootSelector);
  const monthKey = STATE.monthKey;
  const { start: monthStart, end: monthEnd } = monthRange(monthKey);
  const activeCycleKey = cycleKey(new Date());
  const { start: cycleStart, end: cycleEnd } = cycleRange(activeCycleKey);

  root.innerHTML = `
    <div class="report-month-nav ${STATE.homeMode ? 'home-cycle-nav' : ''}">
      <button class="tds-icon-btn md" onclick="window.reportMonthShift(-1)">‹</button>
      <div class="t6">${STATE.homeMode ? cycleStatusLabel(cycleStart, cycleEnd) : monthKey}</div>
      <button class="tds-icon-btn md" onclick="window.reportMonthShift(1)">›</button>
    </div>
    <div id="report-body"><div class="empty-state"><div class="loading-spinner"></div></div></div>
  `;

  const [monthTxs, cycleTxs, mindbankEntries, financeGoals, devIdeas, pacts, appSettings] = await Promise.all([
    listTransactions({ from: monthStart, to: monthEnd, max: 1000 }),
    listTransactions({ from: cycleStart, to: cycleEnd, max: 1000 }),
    STATE.homeMode ? listMindbankEntries({ max: 200 }) : Promise.resolve([]),
    listFinanceGoals({ max: 10 }).catch(() => []),
    STATE.homeMode ? listDevIdeas({ max: 20 }).catch(() => []) : Promise.resolve([]),
    STATE.homeMode ? listPacts({ max: 20 }).catch(() => []) : Promise.resolve([]),
    STATE.homeMode ? getAppSettings().catch(() => ({})) : Promise.resolve({}),
  ]);
  STATE.monthTxs = monthTxs;
  STATE.cycleTxs = cycleTxs;

  const categories = getCategories();
  STATE.categories = categories;
  const budgetCategories = categories
    .filter(c => c.kind === 'expense')
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
  const controlCategories = budgetCategories.filter(isControlCategory);
  const fixedCategories = budgetCategories.filter(cat => currentRhythm(cat) === 'fixed');

  const byCatMonth = aggregateByCategory(monthTxs);
  const byCatCycle = aggregateByCategory(cycleTxs);
  const mode = STATE.viewMode;
  const gaugeCategories = mode === 'cycle' ? controlCategories : budgetCategories;
  const byCat = mode === 'cycle' ? byCatCycle : byCatMonth;

  const currentUsed = gaugeCategories.reduce((sum, cat) => sum + usedFor(cat, byCat), 0);
  const currentTarget = gaugeCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, mode), 0);
  const currentIncome = incomeFor(mode === 'cycle' ? cycleTxs : monthTxs);
  const currentSettlement = settlementFor(mode === 'cycle' ? cycleTxs : monthTxs);
  const fixedUsed = fixedCategories.reduce((sum, cat) => sum + usedFor(cat, byCatMonth), 0);
  const fixedTarget = fixedCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, 'month'), 0);
  const controlMonthUsed = controlCategories.reduce((sum, cat) => sum + usedFor(cat, byCatMonth), 0);
  const controlMonthTarget = controlCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, 'month'), 0);
  const reimbursement = reimbursementSummary(mode === 'cycle' ? cycleTxs : monthTxs);
  const reviewCount = (mode === 'cycle' ? cycleTxs : monthTxs).filter(tx => tx.needsReview).length;
  const mindbank = summarizeMindbank(mindbankEntries);
  const monthUsedAll = budgetCategories.reduce((sum, cat) => sum + usedFor(cat, byCatMonth), 0);
  const monthTargetAll = budgetCategories.reduce((sum, cat) => sum + targetFor(cat, monthKey, 'month'), 0);
  const goalImpact = buildGoalImpact(financeGoals.find(goal => goal.active !== false) || financeGoals[0] || null, {
    monthUsed: monthUsedAll,
    monthTarget: monthTargetAll,
    mindbankTotal: mindbank.total,
  });
  const homeManagedIds = new Set(Array.isArray(appSettings.homeManagedCategoryIds) ? appSettings.homeManagedCategoryIds : []);
  const homeManagedCategories = STATE.homeMode ? controlCategories.filter(cat => homeManagedIds.has(cat.id)) : [];
  const homeRestVariableCategories = STATE.homeMode ? controlCategories.filter(cat => !homeManagedIds.has(cat.id)) : [];

  $('#report-body').innerHTML = `
    <section class="hero report-hero-card ${STATE.homeMode ? 'home-hero-card' : ''} ${mode === 'month' ? 'monthly' : ''}">
      <div class="report-mode-tabs">
        <button type="button" class="${mode === 'cycle' ? 'active' : ''}" onclick="window.reportViewMode('cycle')">이번 2주</button>
        <button type="button" class="${mode === 'month' ? 'active' : ''}" onclick="window.reportViewMode('month')">이번 달</button>
      </div>

      <div class="report-hero-head">
        <div>
          <div class="label">${mode === 'cycle' ? '이번 격주 지출' : `${monthKey} 지출 합계`}</div>
          <div class="report-hero-period">${heroPeriodLabel(mode, monthKey, activeCycleKey, cycleStart, cycleEnd)}</div>
          <div class="amount">${fmtKRW(currentUsed).replace('원', '')}<span class="unit">원</span></div>
          ${STATE.homeMode ? '' : `
            <div class="sub">
              <span>수입 <b>+${fmtKRW(currentIncome).replace('원', '')}</b></span>
              <span>정산 <b>+${fmtKRW(currentSettlement).replace('원', '')}</b></span>
            </div>
            <div class="pace ${currentTarget && currentUsed > currentTarget ? 'warn' : ''}">● ${paceText(currentUsed, currentTarget)}</div>
          `}
        </div>
      </div>

      <div class="report-hero-progress">
        <div class="tds-progress"><div class="tds-progress-fill ${currentUsed > currentTarget && currentTarget ? 'warning' : ''}" style="transform:scaleX(${ratio(currentUsed, currentTarget)})"></div></div>
        <div class="report-hero-meta">
          <span>${fmtKRW(currentTarget)} 기준</span>
          <span>${currentTarget ? `${Math.min(999, Math.round((currentUsed / currentTarget) * 100))}% 사용` : '목표 미설정'}</span>
        </div>
      </div>
      ${mode === 'month' ? heroSecondaryProgress('고정비 제외 조절비', controlMonthUsed, controlMonthTarget) : ''}
    </section>

    ${STATE.homeMode ? homePactCarousel(pacts) : ''}
    ${STATE.homeMode ? '' : financeDirectionCard(goalImpact)}

    ${STATE.homeMode ? `
      ${reviewNudgeCard(reviewCount)}
      <section class="home-responsive-section home-managed-section">
        <div class="section-title home-section-title"><h3>관리 카테고리</h3><button type="button" class="more" onclick="switchTab('settings')">설정 ›</button></div>
        <div class="budget-gauge-panel home-managed-panel">
          ${homeManagedCategoryCards(homeManagedCategories, byCat, monthKey, mode)}
        </div>
      </section>

      <section class="home-responsive-section home-variable-section">
        <div class="section-title home-section-title"><h3>${mode === 'cycle' ? '이번 2주 변동비' : '이번 달 변동비'}</h3><button type="button" class="more" onclick="switchTab('report')">전체 ›</button></div>
        <div class="budget-gauge-panel home-variable-panel">
          ${budgetGaugeGroups(homeRestVariableCategories, byCat, monthKey, mode, { showIcon: false })}
        </div>
      </section>
    ` : `
      <div class="section-title"><h3>${mode === 'cycle' ? '균형 카테고리' : '월 MAX 게이지'}</h3><button type="button" class="more" onclick="switchTab('settings')">관리 ›</button></div>
      <div class="budget-gauge-panel">
        ${budgetGaugeGroups(gaugeCategories, byCat, monthKey, mode)}
        ${reimbursementGaugeGroup(reimbursement, mode)}
      </div>
    `}

    <div class="section-title"><h3>이번 달 고정비</h3></div>
    <div class="fixed-cost-panel">
      <div class="fixed-cost-summary">
        <strong>${fmtKRW(fixedUsed)}</strong>
        <span>${fmtKRW(fixedTarget)} 예정</span>
      </div>
      ${fixedCategories.map(cat => fixedCostRow(cat, byCatMonth, monthKey)).join('')}
    </div>
    ${STATE.homeMode ? devIdeasCard(devIdeas) : ''}
  `;
}

function cycleStatusLabel(start, end) {
  const today = new Date();
  const elapsed = Math.max(1, Math.floor((today - start) / 86400000) + 1);
  const remaining = Math.max(0, Math.ceil((end - today) / 86400000));
  return `${elapsed}일째 · 남은 ${remaining}일`;
}

function heroPeriodLabel(mode, monthKey, activeCycleKey, start, end) {
  if (mode === 'cycle') return `${cycleLabel(activeCycleKey)} · ${elapsedDayLabel(start, end)}`;
  return `${monthKey} · ${elapsedMonthDayLabel(monthKey)}`;
}

function elapsedDayLabel(start, end) {
  const today = new Date();
  const total = Math.max(1, Math.ceil((end - start) / 86400000) + 1);
  const elapsed = Math.max(1, Math.min(total, Math.floor((today - start) / 86400000) + 1));
  return `${elapsed}일째`;
}

function elapsedMonthDayLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number);
  const today = new Date();
  if (today.getFullYear() !== year || today.getMonth() + 1 !== month) return '전체';
  return `${today.getDate()}일째`;
}

function reviewNudgeCard(count) {
  if (!count) return '';
  return `
    <button type="button" class="insight review review-nudge-card" onclick="switchTab('review')">
      <span class="tag">검토 대기</span>
      <div class="head">자동 분류 확인이 필요한 거래 ${count}건이 있어요</div>
      <div class="body">카테고리만 정해주면 홈 게이지와 월간 리포트가 바로 정돈됩니다.</div>
    </button>
  `;
}

function financeDirectionCard(impact) {
  if (!impact) {
    return `
      <button type="button" class="finance-direction-card empty" onclick="switchTab('finance')">
          <span class="mark">◇</span>
          <span class="body">
            <span class="label">장기 방향</span>
          <span class="h">목표 탭에서 목표 시나리오를 정해주세요</span>
          <span class="sub">저축 시나리오 하나를 기준으로 삼으면 소비 흐름과 함께 볼 수 있어요.</span>
          </span>
        <span class="arrow">›</span>
      </button>
    `;
  }
  const directionText = impact.directionDelta >= 0
    ? `목표선에 ${formatManwonFromKRW(impact.directionDelta)} 가까워지는 흐름`
    : `목표선에서 ${formatManwonFromKRW(Math.abs(impact.directionDelta))} 멀어지는 흐름`;
  const budgetText = impact.budgetDelta >= 0
    ? `예산 대비 ${fmtKRW(impact.budgetDelta)} 여유`
    : `예산 대비 ${fmtKRW(Math.abs(impact.budgetDelta))} 초과`;
  return `
    <button type="button" class="finance-direction-card" onclick="switchTab('finance')">
      <span class="mark">◇</span>
      <span class="body">
        <span class="label">장기 방향 · ${escHtml(impact.goal.name || '목표')}</span>
        <span class="h">${directionText}</span>
        <span class="sub">${budgetText} · 좋은 선택 여력 +${fmtKRW(impact.mindbankTotal)}</span>
      </span>
      <span class="meter"><span style="transform:scaleX(${impact.progress})"></span></span>
    </button>
  `;
}

function heroSecondaryProgress(label, used, target) {
  const pct = target ? Math.min(999, Math.round((used / target) * 100)) : 0;
  return `
    <div class="report-hero-progress secondary">
      <div class="report-hero-secondary-head">
        <span>${escHtml(label)}</span>
        <strong>${fmtKRW(used)} / ${fmtKRW(target)}</strong>
      </div>
      <div class="tds-progress"><div class="tds-progress-fill" style="transform:scaleX(${ratio(used, target)})"></div></div>
      <div class="report-hero-meta">
        <span>${target ? `${pct}% 사용` : '목표 미설정'}</span>
      </div>
    </div>
  `;
}

function reportInsightCard(categories, byCat, monthKey, mode) {
  const ranked = categories
    .map(cat => {
      const used = usedFor(cat, byCat);
      const target = targetFor(cat, monthKey, mode);
      const pct = target ? used / target : 0;
      return { cat, used, target, pct };
    })
    .filter(row => row.used > 0 || row.target > 0)
    .sort((a, b) => b.pct - a.pct);
  const hot = ranked[0];
  const head = hot
    ? `${hot.cat.name} 페이스가 가장 빠르게 움직여요`
    : '아직 판단할 소비 흐름이 충분하지 않아요';
  const body = hot
    ? `${mode === 'cycle' ? '이번 격주' : '이번 달'} 기준 ${Math.round(hot.pct * 100)}% 사용 중. 한 번만 더 결제 전 멈추면 리듬이 훨씬 안정됩니다.`
    : '거래가 쌓이면 지난 흐름과 비교해서 자동으로 알려줄게요.';
  return `
    <div class="insight">
      <span class="tag">${mode === 'cycle' ? '이번 격주 흐름' : '이번 달 흐름'}</span>
      <div class="head">${escHtml(head)}</div>
      <div class="body">${escHtml(body)}</div>
    </div>
  `;
}

function reimbursementCategoryCard(summary, mode) {
  if (!summary.amount) return '';
  return `
    <button type="button" class="reimbursement-category-card" onclick="window.openReportReimbursementTxs('${mode}')">
      <span class="mark">↩</span>
      <span class="body">
        <span class="label">${REIMBURSEMENT_CATEGORY_NAME}</span>
        <span class="h">${fmtKRW(summary.amount)}</span>
        <span class="sub">${mode === 'cycle' ? '이번 2주' : '이번 달'} · ${summary.count}건 · 조절비/월간 지출 합계 제외</span>
      </span>
      <span class="arrow">내역</span>
    </button>
  `;
}

function reimbursementGaugeGroup(summary, mode) {
  if (!summary.amount) return '';
  return `
    <div class="budget-gauge-group reimbursement">
      <div class="budget-gauge-parent">
        <strong>예산 제외</strong>
        <span>${summary.count}건</span>
      </div>
      <div class="budget-gauge-row actionable reimbursement" role="button" tabindex="0" onclick="window.openReportReimbursementTxs('${mode}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openReportReimbursementTxs('${mode}')}">
        <div class="budget-gauge-head">
          <span>↩ ${REIMBURSEMENT_CATEGORY_NAME}</span>
          <strong>${fmtKRW(summary.amount)} ›</strong>
        </div>
        <div class="budget-gauge-meta">${mode === 'cycle' ? '이번 2주' : '이번 달'} · 조절비/월간 지출 합계 제외</div>
        <div class="tds-progress reimbursement"><div class="tds-progress-fill" style="transform:scaleX(1)"></div></div>
      </div>
    </div>
  `;
}

function reimbursementSummary(txs) {
  const rows = reimbursementTransactions(txs);
  return {
    amount: rows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
    count: rows.length,
  };
}

function incomeFor(txs) {
  return txs
    .filter(tx => tx.type === 'transfer_in' || tx.type === 'settlement_in')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

function settlementFor(txs) {
  return txs
    .filter(tx => tx.type === 'settlement_in')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

function paceText(used, target) {
  if (!target) return '목표 미설정';
  const pct = Math.round((used / target) * 100);
  if (pct >= 100) return `초과 주의 · 예산의 ${pct}%`;
  if (pct >= 85) return `속도 빠름 · 예산의 ${pct}%`;
  return `페이스 정상 · 예산의 ${pct}%`;
}

function homeActionCards(mindbank) {
  const total = Number(mindbank.total) || 0;
  const totalKcalSaved = Number(mindbank.totalKcalSaved) || 0;
  const choiceCount = Number(mindbank.urges) || 0;
  const nudge = choiceCount > 0
    ? `여태껏 +${fmtKRW(total)}${totalKcalSaved ? ` · -${totalKcalSaved.toLocaleString('ko-KR')} kcal` : ''}, ${choiceCount}개의 좋은 선택이 쌓였어요. 더 해볼까요?`
    : '한 번 기록하면 감각뱅크에 좋은 선택이 같이 쌓여요.';
  return `
    <button type="button" class="urge-cta report-urge-cta" onclick="startUrgeFlow()">
      <span class="ico">✦</span>
      <span class="body">
        <span class="h">지금 끌리는 게 있나요?</span>
        <span class="sub">사고 싶음, 먹고 싶음, 마시고 싶은 와인, 돈으로 환산되지 않는 감각까지 남겨요</span>
        <span class="nudge">${escHtml(nudge)}</span>
      </span>
      <span class="arrow">›</span>
    </button>
  `;
}

function homePactCarousel(pacts) {
  const active = (pacts || [])
    .map(homePactRuntime)
    .filter(pact => !['fulfilled', 'broken', 'archived'].includes(pact.status))
    .sort((a, b) => homePactStatusRank(homePactStatus(b)) - homePactStatusRank(homePactStatus(a)) || (b.progress || 0) - (a.progress || 0))
    .slice(0, 4);
  if (!active.length) return '';
  const ready = active.find(pact => homePactStatus(pact) === 'ready');
  const primary = ready || active[0];
  const progressPct = Math.min(100, Math.max(0, Math.round((primary.progress || 0) * 100)));
  return `
    <section class="home-pact-strip">
      <div class="section-title home-section-title compact"><h3>이번 주 결심</h3><button type="button" class="more" onclick="switchTab('cart')">편집 ›</button></div>
      <button type="button" class="home-pact-card ${homePactStatus(primary)}" onclick="localStorage.setItem('budget.planSegment','do');switchTab('cart')">
        <span class="ico">${escHtml(primary.what?.emoji || '□')}</span>
        <span class="body">
          <span class="title-row">
            <strong>${escHtml(primary.what?.title || primary.what?.category || '하고픈 것')}</strong>
            <b>${progressPct}%</b>
          </span>
          <em>${escHtml(homePactTriggerLabel(primary))}</em>
          <span class="home-pact-meter"><i style="width:${progressPct}%"></i></span>
        </span>
        <span class="arrow">›</span>
      </button>
    </section>
  `;
}

function homePactRuntime(pact) {
  return { ...pact, progress: homePactProgress(pact) };
}

function homePactStatus(pact) {
  if (['fulfilled', 'broken', 'archived'].includes(pact.status)) return pact.status;
  if (homePactOverdue(pact)) return 'broken';
  if ((pact.progress || 0) >= 1) return 'ready';
  if ((pact.progress || 0) >= 0.5) return 'ripening';
  return 'active';
}

function homePactStatusRank(status) {
  if (status === 'ready') return 4;
  if (status === 'ripening') return 3;
  if (status === 'active') return 2;
  return 1;
}

function homePactProgress(pact) {
  const trigger = pact?.trigger || {};
  const cfg = trigger.config || {};
  if (pact.status === 'fulfilled') return 1;
  if (trigger.type === 'time') {
    const due = cfg.date ? new Date(`${cfg.date}T23:59:59`) : null;
    if (!due || Number.isNaN(due.getTime())) return 0;
    const created = homeTimestampMs(pact.createdAt) || Date.now();
    const span = Math.max(1, due.getTime() - created);
    return Math.max(0, Math.min(1, (Date.now() - created) / span));
  }
  if (trigger.type === 'savings') return homeRatio(cfg.currentAmount, cfg.targetAmount);
  if (trigger.type === 'streak') return homeRatio(cfg.currentCount, cfg.count);
  if (trigger.type === 'measure') {
    const target = Number(cfg.value) || 0;
    const current = Number(cfg.currentValue) || 0;
    if (!target) return 0;
    if (cfg.op === '<=') return current <= target ? 1 : Math.max(0, Math.min(0.95, target / current));
    return current >= target ? 1 : Math.max(0, Math.min(0.95, current / target));
  }
  if (trigger.type === 'event') return cfg.done ? 1 : 0;
  if (trigger.type === 'manual') return 1;
  return cfg.done ? 1 : Number(trigger.progress) || 0;
}

function homePactOverdue(pact) {
  const cfg = pact.trigger?.config || {};
  if (pact.trigger?.type !== 'time' || !cfg.date) return false;
  const due = new Date(`${cfg.date}T23:59:59`);
  return !Number.isNaN(due.getTime()) && Date.now() - due.getTime() > 14 * 86400000;
}

function homeRatio(current, target) {
  const t = Number(target) || 0;
  if (!t) return 0;
  return Math.max(0, Math.min(1, (Number(current) || 0) / t));
}

function homeTimestampMs(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function homePactTriggerLabel(pact) {
  const type = pact.trigger?.type;
  const cfg = pact.trigger?.config || {};
  if (type === 'time' && cfg.date) return `${cfg.date} 이후 다시 보기`;
  if (type === 'savings') return `저축 ${fmtKRWShort(cfg.targetAmount || 0)} 도달 시`;
  if (type === 'streak') return `${cfg.metric || '스트릭'} ${cfg.count || 0}회`;
  if (type === 'measure') return `${cfg.metric || '지표'} ${cfg.op || '>='} ${cfg.value || ''}${cfg.unit || ''}`;
  if (type === 'event') return cfg.eventName || '이벤트 후';
  return '직접 판단';
}

function devIdeasCard(ideas) {
  const pendingCount = ideas.filter(idea => devIdeaStatus(idea) === 'pending').length;
  const runningCount = ideas.filter(idea => devIdeaStatus(idea) === 'running').length;
  const headText = runningCount
    ? `${runningCount}개 진행중 · ${pendingCount}개 진행전`
    : `${pendingCount}개 진행전`;
  return `
    <section class="dev-idea-card">
      <div class="dev-idea-head">
        <div>
          <div class="eyebrow">Dev Ideas</div>
          <h3>개발 아이디어</h3>
        </div>
        <span>${headText}</span>
      </div>
      <form id="dev-idea-form" class="dev-idea-form" onsubmit="window.addDevIdea(event)">
        <input class="tds-input" name="title" placeholder="홈 하단에 붙여둘 아이디어" autocomplete="off" required>
        <button class="tds-btn tonal" type="submit">추가</button>
      </form>
      <div class="dev-idea-list">
        ${ideas.length ? ideas.slice(0, 4).map(devIdeaRow).join('') : '<div class="dev-idea-empty">생각난 기능을 한 줄로 저장해요.</div>'}
      </div>
    </section>
  `;
}

function devIdeaRow(idea) {
  const status = devIdeaStatus(idea);
  const done = status === 'done';
  return `
    <label class="dev-idea-row ${done ? 'done' : ''} status-${status}">
      <input type="checkbox" aria-label="완료 표시" ${done ? 'checked' : ''} onchange="window.toggleDevIdea('${idea.id}', this.checked)">
      <span class="dev-idea-title">${escHtml(idea.title || '제목 없음')}</span>
      <span class="dev-idea-status">${devIdeaStatusLabel(status)}</span>
      <button type="button" title="삭제" onclick="event.preventDefault();event.stopPropagation();window.deleteDevIdea('${idea.id}')">×</button>
    </label>
  `;
}

function devIdeaStatus(idea) {
  const status = String(idea?.status || '').trim();
  if (['pending', 'running', 'done', 'failed'].includes(status)) return status;
  return idea?.done ? 'done' : 'pending';
}

function devIdeaStatusLabel(status) {
  return ({
    pending: '진행전',
    running: '진행중',
    done: '완료',
    failed: '오류',
  })[status] || '진행전';
}

function homeManagedCategoryCards(categories, byCat, monthKey, mode) {
  const rows = categories.map(cat => homeManagedCategoryModel(cat, byCat, monthKey, mode));
  if (!rows.length) {
    return `
      <button type="button" class="home-managed-empty" onclick="switchTab('settings')">
        <strong>홈에 남길 카테고리를 골라주세요</strong>
        <span>설정에서 술·와인, 야식, 카페처럼 자주 보고 싶은 항목만 선택합니다.</span>
      </button>
    `;
  }
  return `<div class="home-managed-grid">${rows.map(homeManagedCategoryCard).join('')}</div>`;
}

function homeManagedCategoryModel(cat, byCat, monthKey, mode) {
  const used = usedFor(cat, byCat);
  const target = targetFor(cat, monthKey, mode);
  const count = countFor(cat, byCat);
  const countTarget = estimatedCountTarget(cat, used, target, count);
  const amountPct = target ? used / target : 0;
  const countPct = countTarget ? count / countTarget : 0;
  return { cat, used, target, count, countTarget, amountPct, countPct, mode };
}

function homeManagedCategoryCard(model) {
  const { cat, used, target, count, countTarget, amountPct, countPct, mode } = model;
  const tone = amountPct > 1 || countPct > 1 ? 'warn' : amountPct > 0.75 || countPct > 0.75 ? 'watch' : 'ok';
  const amountWidth = Math.min(100, Math.round(amountPct * 100));
  const countWidth = Math.min(100, Math.round(countPct * 100));
  return `
    <button type="button" class="home-managed-card ${tone}" onclick="window.openReportCategoryTxs('${encodeURIComponent(cat.name)}','${mode}')">
      <span class="home-managed-top">
        <span class="home-managed-name">
          <span class="home-managed-icon">${escHtml(cat.emoji || '□')}</span>
          <strong>${escHtml(cat.name)}</strong>
        </span>
      </span>
      <span class="home-managed-gauges">
        <span class="home-managed-gauge">
          <em><span>횟수</span><strong>${count} / ${countTarget}회</strong></em>
          <i><b style="width:${countWidth}%"></b></i>
        </span>
        <span class="home-managed-gauge amount">
          <em><span>금액</span><strong>${fmtKRW(used)} / ${fmtKRW(target)}</strong></em>
          <i><b style="width:${amountWidth}%"></b></i>
        </span>
      </span>
    </button>
  `;
}

function budgetGaugeGroups(categories, byCat, monthKey, mode, options = {}) {
  if (categories.length === 0) return '<div class="empty-state compact"><div>표시할 예산 카테고리가 없습니다</div></div>';
  const groups = {};
  for (const cat of categories) {
    const parent = cat.parent || '기타';
    if (!groups[parent]) groups[parent] = [];
    groups[parent].push(cat);
  }
  return Object.entries(groups).map(([parent, rows]) => {
    const parentUsed = rows.reduce((sum, cat) => sum + usedFor(cat, byCat), 0);
    const parentTarget = rows.reduce((sum, cat) => sum + targetFor(cat, monthKey, mode), 0);
    return `
      <div class="budget-gauge-group">
        <div class="budget-gauge-parent">
          <strong>${escHtml(parent)}</strong>
          <span>${fmtKRWShort(parentUsed)} / ${fmtKRWShort(parentTarget)}</span>
        </div>
        ${rows.map(cat => gaugeRow(cat, byCat, monthKey, mode, options)).join('')}
      </div>
    `;
  }).join('');
}

function gaugeRow(cat, byCat, monthKey, mode, options = {}) {
  const used = usedFor(cat, byCat);
  const target = targetFor(cat, monthKey, mode);
  const pct = target ? Math.min(100, Math.round((used / target) * 100)) : 0;
  const fillClass = target && used / target > 0.85 ? 'warning' : '';
  const gaugeClass = fillClass ? 'amber' : (pct < 55 ? 'green' : '');
  const showIcon = options.showIcon !== false;
  const compactHome = STATE.homeMode && options.showIcon === false;
  const compactMeta = target ? `${fmtKRW(used).replace('원', '')} / ${fmtKRW(target).replace('원', '')}` : `목표 미설정 · ${fmtKRW(used).replace('원', '')}`;
  return `
    <div class="cat-row variable budget-gauge-row actionable ${showIcon ? '' : 'no-icon'}" role="button" tabindex="0" onclick="window.openReportCategoryTxs('${encodeURIComponent(cat.name)}','${mode}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openReportCategoryTxs('${encodeURIComponent(cat.name)}','${mode}')}">
      ${showIcon ? `<div class="cat-icon">${cat.emoji || '□'}</div>` : ''}
      <div class="cat-body">
        <div class="top">
          <span class="name">${escHtml(cat.name)}</span>
          ${compactHome ? '' : `<span class="vals"><b>${fmtKRW(used)}</b> <em>/ ${fmtKRW(target)}</em></span>`}
        </div>
        <div class="gauges">
          <div>
            <div class="gauge-track"><span class="gauge-fill ${gaugeClass}" style="width:${pct}%"></span></div>
            <div class="gauge-meta ${compactHome ? 'compact' : ''}">${compactHome ? compactMeta : (target ? `${pct}%` : '목표 미설정')}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function fixedCostRow(cat, byCat, monthKey) {
  const used = usedFor(cat, byCat);
  const target = targetFor(cat, monthKey, 'month');
  const status = used <= 0 ? '예정' : used <= target ? '결제됨' : '초과';
  return `
    <div class="fixed-cost-row" role="button" tabindex="0" onclick="window.openReportCategoryTxs('${encodeURIComponent(cat.name)}','month')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openReportCategoryTxs('${encodeURIComponent(cat.name)}','month')}">
      <span>${cat.emoji || ''} ${escHtml(cat.name)}</span>
      <strong>${fmtKRW(used)} / ${fmtKRW(target)}</strong>
      <em class="${status === '초과' ? 'over' : ''}">${status}</em>
    </div>
  `;
}

function openReportCategoryTxs(encodedName, mode = STATE.viewMode) {
  const categoryName = decodeURIComponent(encodedName);
  STATE.activeDrill = { type: 'category', categoryName, mode };
  const txs = txsForCategory(categoryName, mode);
  const total = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const modal = ensureReportModal();
  const category = STATE.categories.find(cat => cat.name === categoryName);
  modal.querySelector('.tds-modal-title').textContent = `${category?.emoji || ''} ${categoryName}`;
  modal.querySelector('#report-category-modal-body').innerHTML = `
    <div class="report-drill-summary">
      <strong>${fmtKRW(total)}</strong>
      <span>${mode === 'cycle' ? '이번 2주' : '이번 달'} · ${txs.length}건</span>
    </div>
    ${txs.length ? subcategorySummaryHtml(txs) : ''}
    ${txs.length
      ? txs.map(tx => reportTxRow(tx)).join('')
      : '<div class="empty-state compact"><div>해당 기준의 거래가 없습니다</div></div>'}
  `;
  window.openModal('report-category-modal');
}

function openReportReimbursementTxs(mode = STATE.viewMode) {
  STATE.activeDrill = { type: 'reimbursement', categoryName: REIMBURSEMENT_CATEGORY_NAME, mode };
  const txs = txsForCategory(REIMBURSEMENT_CATEGORY_NAME, mode);
  const total = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const modal = ensureReportModal();
  modal.querySelector('.tds-modal-title').textContent = `↩ ${REIMBURSEMENT_CATEGORY_NAME}`;
  modal.querySelector('#report-category-modal-body').innerHTML = `
    <div class="report-drill-summary reimbursement">
      <strong>${fmtKRW(total)}</strong>
      <span>${mode === 'cycle' ? '이번 2주' : '이번 달'} · ${txs.length}건 · 예산/소비 합계 제외</span>
    </div>
    ${txs.length ? subcategorySummaryHtml(txs) : ''}
    ${txs.length
      ? txs.map(tx => reportTxRow(tx)).join('')
      : '<div class="empty-state compact"><div>환급 예정으로 표시된 거래가 없습니다</div></div>'}
  `;
  window.openModal('report-category-modal');
}

function ensureReportModal() {
  let modal = document.getElementById('report-category-modal');
  if (modal) return modal;
  const container = document.getElementById('modals-container') || document.body;
  container.insertAdjacentHTML('beforeend', `
    <div class="tds-modal-overlay" id="report-category-modal" onclick="if(event.target===this)closeModal('report-category-modal')">
      <div class="tds-modal-sheet">
        <div class="tds-modal-handle"></div>
        <div class="tds-modal-content" style="text-align:left">
          <div class="tds-modal-title">카테고리 내역</div>
          <div id="report-category-modal-body"></div>
        </div>
      </div>
    </div>
  `);
  return document.getElementById('report-category-modal');
}

function reportTxRow(tx) {
  const isPos = tx.type === 'transfer_in' || tx.type === 'settlement_in';
  const sign = isPos ? '+' : '-';
  const checked = isReimbursementExpected(tx);
  const meta = [
    tx.subcategory,
    fmtDateTime(tx.occurredAt),
    tx.memo,
  ].filter(Boolean).join(' · ');
  return `
    <div class="report-tx-row">
      <button type="button" class="report-tx-open" onclick="window.openReportTxDetail('${tx.id}')">
        <span class="tx-icon">${typeEmoji(tx.type)}</span>
        <span class="report-tx-body">
          <strong>${escHtml(tx.merchant || tx.counterparty || '미분류')}</strong>
          <small>${escHtml(meta)}</small>
        </span>
        <span class="${isPos ? 'amount-pos' : 'amount-neg'}">${sign}${fmtKRW(tx.amount)}</span>
      </button>
      <label class="report-refund-check" onclick="event.stopPropagation()">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="window.reportToggleReimbursement(event,'${tx.id}')">
        <span>${checked ? '환급예정' : '환급처리'}</span>
      </label>
    </div>
  `;
}

function subcategorySummaryHtml(txs) {
  const rows = Object.values(txs.reduce((acc, tx) => {
    const key = tx.subcategory || '상세분류 미지정';
    if (!acc[key]) acc[key] = { name: key, amount: 0, count: 0 };
    acc[key].amount += Number(tx.amount) || 0;
    acc[key].count += 1;
    return acc;
  }, {})).sort((a, b) => b.amount - a.amount);

  return `
    <div class="report-subcategory-summary">
      <div class="report-subcategory-title">상세분류 요약</div>
      ${rows.map(row => `
        <div class="report-subcategory-row">
          <span>${escHtml(row.name)}</span>
          <em>${row.count}건</em>
          <strong>${fmtKRW(row.amount)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function openReportTxDetail(txId) {
  window.closeModal('report-category-modal');
  window.openTxEditModal?.(txId);
}

async function reportToggleReimbursement(event, txId) {
  event?.stopPropagation?.();
  const checked = !!event?.target?.checked;
  try {
    await updateTransaction(txId, {
      reimbursementExpected: checked,
      excludedFromBudget: checked,
      excludeReason: checked ? 'reimbursement_expected' : null,
    });
    patchLocalTx(txId, {
      reimbursementExpected: checked,
      excludedFromBudget: checked,
      excludeReason: checked ? 'reimbursement_expected' : null,
    });
    showToast(checked ? '환급예정금액으로 분리됨' : '일반 지출로 복귀됨', 1400, 'success');
    refreshActiveReportDrill();
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    if (event?.target) event.target.checked = !checked;
    showToast(err.message || '환급 상태 변경 실패', 2600, 'error');
  }
}

function patchLocalTx(txId, patch) {
  STATE.monthTxs = STATE.monthTxs.map(tx => tx.id === txId ? { ...tx, ...patch } : tx);
  STATE.cycleTxs = STATE.cycleTxs.map(tx => tx.id === txId ? { ...tx, ...patch } : tx);
}

function refreshActiveReportDrill() {
  if (!STATE.activeDrill) return;
  if (STATE.activeDrill.type === 'reimbursement') {
    openReportReimbursementTxs(STATE.activeDrill.mode);
    return;
  }
  openReportCategoryTxs(encodeURIComponent(STATE.activeDrill.categoryName), STATE.activeDrill.mode);
}

function txsForCategory(categoryName, mode) {
  const source = mode === 'cycle' ? STATE.cycleTxs : STATE.monthTxs;
  if (categoryName === REIMBURSEMENT_CATEGORY_NAME) {
    return reimbursementTransactions(source)
      .sort((a, b) => dateMs(b.occurredAt) - dateMs(a.occurredAt));
  }
  return expenseTransactions(source)
    .filter(tx => displayCategoryName(tx) === categoryName)
    .sort((a, b) => dateMs(b.occurredAt) - dateMs(a.occurredAt));
}

function dateMs(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function usedFor(cat, byCat) {
  return Number(byCat.find(row => row.name === cat.name)?.expense || 0);
}

function countFor(cat, byCat) {
  return Number(byCat.find(row => row.name === cat.name)?.count || 0);
}

function estimatedCountTarget(cat, used, target, count) {
  if (!target) return Math.max(1, count || 1);
  const observedUnit = count > 0 && used > 0 ? used / count : 0;
  const unit = observedUnit || fallbackUnitAmount(cat);
  return Math.max(1, Math.round(target / Math.max(1, unit)));
}

function fallbackUnitAmount(cat) {
  const text = `${cat.name || ''} ${cat.parent || ''}`;
  if (/카페|커피/i.test(text)) return 5500;
  if (/야식|와인|술|주류/i.test(text)) return 35000;
  if (/교통|택시/i.test(text)) return 12000;
  if (/생활|마트|편의점/i.test(text)) return 25000;
  if (/쇼핑|의류|취미|여가/i.test(text)) return 50000;
  if (/대인|식사|모임/i.test(text)) return 30000;
  return 20000;
}

function targetFor(cat, monthKey, mode) {
  const monthly = Number(cat.monthlyTargets?.[monthKey] ?? cat.target ?? 0) || 0;
  if (mode !== 'cycle') return monthly;
  return currentRhythm(cat) === 'front_loaded' ? monthly : Math.round(monthly / 2);
}

function currentRhythm(cat) {
  return cat.budgetRhythm || 'spread';
}

function isControlCategory(cat) {
  return currentRhythm(cat) !== 'fixed';
}

function expenseTransactions(txs) {
  return txs
    .filter(t => t.type === 'card_payment' || t.type === 'transfer_out')
    .filter(t => t.type !== 'internal_transfer')
    .filter(t => !isBudgetExcluded(t));
}

function reimbursementTransactions(txs) {
  return txs
    .filter(t => t.type === 'card_payment' || t.type === 'transfer_out')
    .filter(t => isReimbursementExpected(t));
}

function ratio(used, target) {
  if (!target) return 0;
  return Math.min(1, Math.max(0, used / target));
}

function typeEmoji(type) {
  return ({ card_payment: '💳', transfer_out: '↗️', transfer_in: '↙️', internal_transfer: '🔄', settlement_in: '💰', settlement_out: '💸' })[type] || '📦';
}

window.reportMonthShift = (delta) => {
  const [y, m] = STATE.monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  STATE.monthKey = fmtMonthKey(d);
  renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
};

window.reportViewMode = (mode) => {
  STATE.viewMode = mode === 'month' ? 'month' : 'cycle';
  renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
};

window.openReportCategoryTxs = openReportCategoryTxs;
window.openReportReimbursementTxs = openReportReimbursementTxs;
window.openReportTxDetail = openReportTxDetail;
window.reportToggleReimbursement = reportToggleReimbursement;

window.addDevIdea = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const title = new FormData(form).get('title');
  try {
    await saveDevIdea({ title, status: 'pending' });
    form.reset();
    showToast('개발 아이디어를 저장했어요.', 1300, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '아이디어 저장 실패', 2400, 'error');
  }
};

window.toggleDevIdea = async (ideaId, done) => {
  try {
    await updateDevIdea(ideaId, { status: done ? 'done' : 'pending' });
    showToast(done ? '완료로 표시했어요.' : '진행전으로 돌렸어요.', 1200, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '아이디어 변경 실패', 2400, 'error');
  }
};

window.deleteDevIdea = async (ideaId) => {
  try {
    await deleteDevIdea(ideaId);
    showToast('아이디어를 삭제했어요.', 1200, 'success');
    renderReport({ rootSelector: STATE.rootSelector, homeMode: STATE.homeMode });
  } catch (err) {
    showToast(err.message || '아이디어 삭제 실패', 2400, 'error');
  }
};
