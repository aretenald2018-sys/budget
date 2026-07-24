// ================================================================
// features/home/dashboard.js — 홈 대시보드 뷰 (순수 함수)
// 실제 renderReport(homeMode)가 데이터 모델을 만들어 이 함수를 호출한다.
// 마크업/구조의 단일 출처. 데이터 접근·상태는 여기 없음(테스트·프리뷰 가능).
// ================================================================

const ICON = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  chevronUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  analyze: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 3.5-4 3 2.5L21 6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9h17M8 3v3M16 3v3"/></svg>',
  income: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19"/><path d="M6 15h3"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17 9.5 10.5l4 4L21 7"/><path d="M15 7h6v6"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v1.5"/><rect x="3" y="6.5" width="18" height="13" rx="2.5"/><path d="M16 12.5h3.5"/><circle cx="16" cy="13" r=".4" fill="currentColor"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 5.5v5c0 4.4 3 8 7 10 4-2 7-5.6 7-10v-5L12 3Z"/><path d="m9 11.5 2 2 4-4.5"/></svg>',
};

// fancy gradient goal icons (keyed) — 이모지 대신 그라디언트 배지 + 라인 아이콘
const GOAL_ICONS = {
  home: { grad: ['#7C5CF0', '#A78BFA'], svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 11 12 4l8.5 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/></svg>' },
  leaf: { grad: ['#0EA5A0', '#34D399'], svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 9 12 4.5 20 4c.5 8-3.5 15-13 15h-2Z"/><path d="M5 19c2.5-5 6-8.5 10-10.5"/></svg>' },
  glass: { grad: ['#E0507A', '#F59E7B'], svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10l-1 8a4 4 0 0 1-8 0L7 3Z"/><path d="M12 15v5"/><path d="M8.5 20h7"/></svg>' },
  question: { grad: ['#64748B', '#94A3B8'], svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.1v.3"/><circle cx="12" cy="18" r=".6" fill="#fff"/></svg>' },
  spark: { grad: ['#4E7DF0', '#67A2FF'], svg: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>' },
};

const CATEGORY_COLORS = ['#5B8FFF', '#B277E6', '#F5C64A', '#F08A3C', '#FF5B6B', '#98A4BC', '#3BD68F'];

const DEFAULT_MODEL = {
  user: { name: '태우', greeting: '좋은 하루예요!', avatarUrl: '', avatarInitial: '태' },
  period: { label: '7월 15일 – 7월 28일', cycleLabel: '이번 2주' },
  hero: {
    lens: 'sts',
    sts: {
      amountText: '−191,323',
      negative: true,
      subText: '남은 5일 · 여유 없음',
      badgeText: '예산을 191,323원 초과했어요',
      badgeTone: 'danger',
    },
    spentView: {
      amountText: '941,323',
      overLabel: '예산 초과',
      overText: '+191,323원 초과',
      overTone: 'danger',
    },
    spentLine: '지출 941,323원 / 예산 750,000원',
    usageText: '125.5% 사용', usageTone: 'danger',
    fillPercent: 100,
    trend: [8, 11, 10, 15, 13, 19, 22, 26, 23, 21],
    tooltip: '지금 여기',
  },
  kpis: [
    { key: 'income', label: '수입', value: '344,267원', sub: '이번 2주', tone: 'info', icon: 'income' },
    { key: 'funds', label: '충당금', value: '없음', sub: '만들기 →', tone: 'brand', icon: 'shield' },
    { key: 'fixed', label: '고정비', value: '290,635원', sub: '이번 달', tone: 'success', icon: 'trend' },
    { key: 'budget', label: '이번 달 예산', value: '1,050,000원', sub: '예정', tone: 'warning', icon: 'wallet' },
  ],
  funds: {
    items: [],
    monthlyText: '',
  },
  categories: {
    total: '941,323원',
    items: [
      { id: 1, label: '교통', percent: 29, amount: '274,300원' },
      { id: 2, label: '여행', percent: 25, amount: '235,100원' },
      { id: 3, label: '배달', percent: 18, amount: '169,800원' },
      { id: 4, label: '쇼핑', percent: 12, amount: '112,600원' },
      { id: 5, label: '문화', percent: 8, amount: '75,523원' },
      { id: 6, label: '기타', percent: 8, amount: '73,000원' },
    ],
  },
  goals: [
    { name: '생활유지비', fraction: '44만 / 20만', percent: 220, iconKey: 'home', realloc: { label: '생활비용', overage: 240000 } },
    { name: '자아유지비', fraction: '3,000 / 30만', percent: 1, iconKey: 'leaf' },
    { name: '변동비', fraction: '1만 / 25만', percent: 4, iconKey: 'glass' },
    { name: '미분류', fraction: '49만 / 0', percent: null, iconKey: 'question', action: '설정하기' },
  ],
  points: [
    { key: 'wine', label: '와인구매', value: '−3,356P', direction: 'down', color: '#E86A6A' },
    { key: 'ingredient', label: '고급재료', value: '+12,129P', direction: 'up', color: '#7C5CF0' },
    { key: 'travel', label: '여행충당', value: '+84,901P', direction: 'up', color: '#5B8FFF' },
    { key: 'delivery', label: '배달', value: '+36,386P', direction: 'up', color: '#2FB8A8' },
  ],
};

export function homeDashboardHtml(model = {}) {
  const m = mergeModel(DEFAULT_MODEL, model);
  return `
    <div class="home-dash">
      ${headerHtml(m)}
      ${heroHtml(m.hero, m.period.cycleLabel)}
      ${kpiHtml(m.kpis)}
      ${categoriesHtml(m.categories)}
      ${fundsHtml(m.funds)}
      ${goalsHtml(m.goals)}
      ${pointsHtml(m.points, m.period.cycleLabel)}
    </div>
  `;
}

function headerHtml(m) {
  const reviewCount = Math.max(0, Math.round(Number(m.review?.count) || 0));
  const avatar = m.user.avatarUrl
    ? `<img class="hd-avatar" src="${esc(m.user.avatarUrl)}" alt="프로필">`
    : `<div class="hd-avatar hd-avatar-fallback">${esc(m.user.avatarInitial || '나')}</div>`;
  return `
    <header class="hd-header">
      <div class="hd-head-left">
        <h1 class="hd-title">홈 <span class="hd-wave">👋</span></h1>
        <p class="hd-greet">${esc(m.user.name)}님, ${esc(m.user.greeting)}</p>
        <button type="button" class="hd-date" data-report-action="open-biweekly-start-settings">
          <span class="hd-date-ic">${ICON.calendar}</span>
          <span>${esc(m.period.label)}</span>
          <span class="hd-date-caret">${ICON.chevronDown}</span>
        </button>
      </div>
      <div class="hd-head-actions">
        <button type="button" class="hd-icon-btn" aria-label="거래 검색" data-report-action="switch-tab" data-tab="tx">${ICON.search}</button>
        <button type="button" class="hd-icon-btn" aria-label="검토 알림${reviewCount ? ` ${reviewCount}건` : ''}" data-report-action="switch-tab" data-tab="review">
          ${ICON.bell}${reviewCount ? `<span class="hd-badge">${reviewCount > 99 ? '99+' : reviewCount}</span>` : ''}
        </button>
        <div class="hd-avatar-wrap">${avatar}</div>
      </div>
    </header>
  `;
}

export function heroHtml(h, cycleLabel) {
  const stsOn = h.lens !== 'spent';
  const isMonth = cycleLabel === '이번 달';
  const sts = h.sts || {};
  const sp = h.spentView || {};
  const body = stsOn
    ? `
      <div class="hd-hero-label">지금 써도 되는 돈</div>
      <div class="hd-hero-amount ${sts.negative ? 'neg' : ''}">${esc(sts.amountText)}<span class="hd-won">원</span></div>
      <div class="hd-hero-over">
        <span class="hd-over-pill hd-pill-${esc(sts.badgeTone || 'danger')}">${esc(sts.badgeText)}</span>
      </div>`
    : `
      <div class="hd-hero-label">지금까지 쓴 돈</div>
      <div class="hd-hero-amount">${esc(sp.amountText)}<span class="hd-won">원</span></div>
      <div class="hd-hero-over">
        <span class="hd-over-pill hd-pill-${esc(sp.overTone || 'danger')}">${esc(sp.overLabel)}</span>
        <span class="hd-over-text">${esc(sp.overText)}</span>
      </div>`;
  return `
    <section class="hd-hero">
      <div class="hd-hero-top">
        <div class="hd-hero-controls">
          <div class="hd-period" role="tablist" aria-label="기간 전환">
            <button type="button" class="${isMonth ? '' : 'on'}" data-report-action="set-report-mode" data-mode="cycle" role="tab" aria-selected="${!isMonth}">2주</button>
            <button type="button" class="${isMonth ? 'on' : ''}" data-report-action="set-report-mode" data-mode="month" role="tab" aria-selected="${isMonth}">달</button>
          </div>
          <div class="hd-lens" role="tablist" aria-label="히어로 보기 전환">
            <button type="button" class="${stsOn ? 'on' : ''}" data-report-action="hero-lens" data-lens="sts" role="tab" aria-selected="${stsOn}">써도 되는 돈</button>
            <button type="button" class="${stsOn ? '' : 'on'}" data-report-action="hero-lens" data-lens="spent" role="tab" aria-selected="${!stsOn}">쓴 돈</button>
          </div>
        </div>
        <button type="button" class="hd-analyze" data-report-action="switch-tab" data-tab="report">
          ${ICON.analyze}<span>분석 보기</span>
        </button>
      </div>
      <div class="hd-hero-main">
        <div class="hd-hero-info">${body}</div>
        ${heroChartHtml(h)}
      </div>
      <div class="hd-hero-progress">
        <div class="hd-hero-track"><span class="hd-hero-fill" style="width:${clampPct(h.fillPercent)}%"></span></div>
      </div>
      <div class="hd-hero-foot">
        <span class="hd-hero-detail">${esc(h.spentLine || '')}${stsOn && sts.subText ? ` · ${esc(sts.subText)}` : ''}</span>
        <span class="hd-hero-usage hd-tone-${esc(h.usageTone || 'danger')}">${esc(h.usageText)}</span>
      </div>
    </section>
  `;
}

// 실제 누적 지출 곡선을 '0 ~ 예산' 스케일로 그린다(예산 대비 높이가 의미를 가짐).
// 예산이 있으면 이상 페이스(0→예산) 점선을 함께 그려, 지금 페이스가 앞선지 뒤진지 보이게 한다.
function heroChartHtml(h) {
  const raw = Array.isArray(h.trend) && h.trend.length > 1 ? h.trend : [40, 38, 30, 26, 18, 10, 6];
  const W = 200, H = 96, pad = 6;
  const budget = Math.max(0, Number(h.trendBudget) || 0);
  // 곡선 시간축 모양은 유지하되, 끝점 크기를 히어로 '쓴 돈'에 맞춰 재스케일 →
  // 차트 높이가 예산 대비 사용률과 일치(예: 27% 사용이면 곡선도 예산의 27% 높이).
  const rawPeak = Math.max(...raw, 0) || 1;
  const spent = Number(h.trendSpent);
  const series = Number.isFinite(spent) && spent >= 0 ? raw.map(v => v / rawPeak * spent) : raw;
  const peak = Math.max(...series, 0);
  // 상한은 예산과 실제 최고치 중 큰 값 — 초과하면 곡선이 페이스선 위로 솟아 보인다.
  const yMax = Math.max(peak, budget, 1);
  const xAt = i => pad + (i / (series.length - 1)) * (W - pad * 2);
  const yAt = v => pad + (1 - Math.min(1, Math.max(0, v / yMax))) * (H - pad * 2);
  const pts = series.map((v, i) => [xAt(i), yAt(v)]);
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const end = pts[pts.length - 1];
  const ex = ((end[0] / W) * 100).toFixed(1);
  const ey = ((end[1] / H) * 100).toFixed(1);
  const pace = budget > 0
    ? `<path d="M${xAt(0).toFixed(1)},${yAt(0).toFixed(1)} L${xAt(series.length - 1).toFixed(1)},${yAt(budget).toFixed(1)}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.4" stroke-dasharray="4 4" stroke-linecap="round"/>`
    : '';
  return `
    <div class="hd-hero-chart">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="hd-hero-svg">
        <defs>
          <linearGradient id="hdLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#F25F9B"/></linearGradient>
          <linearGradient id="hdArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B45CE0" stop-opacity=".28"/><stop offset="1" stop-color="#B45CE0" stop-opacity="0"/></linearGradient>
        </defs>
        <path d="${area}" fill="url(#hdArea)"/>
        ${pace}
        <path d="${line}" fill="none" stroke="url(#hdLine)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="hd-hero-tipline" style="left:${ex}%;top:${ey}%"></span>
      <div class="hd-hero-tip" style="left:${ex}%;top:${ey}%">${esc(h.tooltip || '지금 여기')}</div>
      <span class="hd-hero-dot" style="left:${ex}%;top:${ey}%"></span>
    </div>
  `;
}

function kpiHtml(kpis) {
  return `
    <div class="hd-kpis">
      ${kpis.map(k => {
        const inner = `
          <span class="hd-kpi-ic">${ICON[k.icon] || ICON.wallet}</span>
          <div class="hd-kpi-label">${esc(k.label)}</div>
          <div class="hd-kpi-value">${esc(k.value)}</div>
          <div class="hd-kpi-sub ${k.subTone ? 'hd-tone-' + esc(k.subTone) : ''}">${esc(k.sub)}</div>`;
        return k.action?.tab
          ? `<button type="button" class="hd-kpi hd-tone-${esc(k.tone)}" data-report-action="switch-tab" data-tab="${esc(k.action.tab)}"${k.action.scrollTo ? ` data-scroll-to="${esc(k.action.scrollTo)}"` : ''}>${inner}</button>`
          : `<div class="hd-kpi hd-tone-${esc(k.tone)}">${inner}</div>`;
      }).join('')}
    </div>
  `;
}

function categoriesHtml(c) {
  const items = c.items.map((it, i) => ({ ...it, color: CATEGORY_COLORS[(it.id ? it.id - 1 : i) % CATEGORY_COLORS.length] }));
  if (!items.length) {
    return `
      <section class="hd-card hd-donut-card">
        <div class="hd-card-head"><h2>지출 카테고리</h2><button type="button" class="hd-more" data-report-action="switch-tab" data-tab="report">전체 보기 ${ICON.chevronRight}</button></div>
        <div class="hd-empty">이번 기간 지출이 아직 없어요</div>
      </section>
    `;
  }
  const R = 15.9155, C = 2 * Math.PI * R;
  let offset = 25;
  const arcs = items.map(it => {
    const len = (Number(it.percent) || 0) / 100 * C;
    const dash = `${len.toFixed(2)} ${(C - len).toFixed(2)}`;
    const dashoffset = (C * (offset / 100)).toFixed(2);
    offset += Number(it.percent) || 0;
    return `<circle cx="21" cy="21" r="${R}" fill="none" stroke="${it.color}" stroke-width="6.6" stroke-dasharray="${dash}" stroke-dashoffset="-${dashoffset}"/>`;
  }).join('');
  return `
    <section class="hd-card hd-donut-card">
      <div class="hd-card-head"><h2>지출 카테고리</h2><button type="button" class="hd-more" data-report-action="switch-tab" data-tab="report">전체 보기 ${ICON.chevronRight}</button></div>
      <div class="hd-donut-body">
        <div class="hd-donut">
          <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="${R}" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="6.6"/>${arcs}</svg>
          <div class="hd-donut-center"><span>지출 합계</span><strong>${esc(c.total)}</strong></div>
        </div>
        <div class="hd-legend">
          ${items.map(it => {
            const inner = `
              <span class="hd-legend-dot" style="background:${it.color}"></span>
              <span class="hd-legend-name">${esc(it.label)}</span>
              <span class="hd-legend-pct">${Number(it.percent) || 0}%</span>
              <span class="hd-legend-amt">${esc(it.amount)}</span>`;
            return it.drillName
              ? `<button type="button" class="hd-legend-row" data-report-action="open-category" data-category-name="${esc(encodeURIComponent(it.drillName))}">${inner}</button>`
              : `<div class="hd-legend-row">${inner}</div>`;
          }).join('')}
        </div>
      </div>
    </section>
  `;
}

function fundsHtml(f = {}) {
  const items = Array.isArray(f.items) ? f.items : [];
  if (!items.length) {
    return `
      <section class="hd-card hd-funds">
        <div class="hd-card-head"><h2>충당금</h2><button type="button" class="hd-more" data-report-action="switch-tab" data-tab="settings" data-scroll-to="settings-funds-section">만들기 ${ICON.chevronRight}</button></div>
        <button type="button" class="hd-fund-empty" data-report-action="switch-tab" data-tab="settings" data-scroll-to="settings-funds-section">
          <span class="hd-fund-empty-ic">${ICON.shield}</span>
          <span class="hd-fund-empty-tx"><strong>돌발 지출 대비 주머니가 아직 없어요</strong><small>과태료·의류·등록비를 매달 미리 떼어두면 예산이 안 깨져요</small></span>
          ${ICON.chevronRight}
        </button>
      </section>
    `;
  }
  return `
    <section class="hd-card hd-funds">
      <div class="hd-card-head"><h2>충당금</h2><span class="hd-fund-monthly">${esc(f.monthlyText || '')}</span></div>
      <div class="hd-fund-list">
        ${items.map(it => `
          <button type="button" class="hd-fund-row ${it.overdrawn ? 'over' : ''}" data-fund-action="open-fund" data-fund-id="${esc(it.id)}">
            <span class="hd-fund-emoji">${esc(it.emoji)}</span>
            <span class="hd-fund-name">${esc(it.name)}</span>
            ${it.overdrawn ? '<span class="hd-fund-warn">초과 인출</span>' : ''}
            <span class="hd-fund-balance ${it.overdrawn ? 'hd-tone-danger' : ''}">${esc(it.balanceText)}</span>
            ${ICON.chevronRight}
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function goalsHtml(goals) {
  const grid = goals.length
    ? goals.map(g => {
        const icon = GOAL_ICONS[g.iconKey] || GOAL_ICONS.question;
        const overspent = Number(g.percent) > 100;
        return `
          <div class="hd-goal ${overspent ? 'over' : ''}" data-report-action="open-goal-detail" data-goal-name="${esc(g.name)}" role="button" tabindex="0">
            <span class="hd-goal-ic" style="background:linear-gradient(135deg,${icon.grad[0]},${icon.grad[1]})">${icon.svg}</span>
            <div class="hd-goal-name">${esc(g.name)}</div>
            <div class="hd-goal-frac">${esc(g.fraction)}</div>
            ${g.action
              ? `<button type="button" class="hd-goal-set" data-report-action="switch-tab" data-tab="settings">${esc(g.action)}</button>`
              : `<div class="hd-goal-bar"><span style="width:${clampPct(g.percent)}%;background:${overspent ? '#FF5B6B' : `linear-gradient(90deg,${icon.grad[0]},${icon.grad[1]})`}"></span></div>
                 <div class="hd-goal-meta">
                   <span class="hd-goal-pct ${overspent ? 'hd-tone-danger' : ''}">${Math.round(Number(g.percent) || 0)}%</span>
                   ${overspent && g.realloc ? `<button type="button" class="hd-goal-realloc" data-fund-action="open-reallocation" data-target-kind="category" data-target-id="${esc(g.realloc.id || '')}" data-target-label="${esc(g.realloc.label)}" data-suggest-amount="${Math.max(0, Math.round(g.realloc.overage) || 0)}">재배분</button>` : ''}
                 </div>`}
          </div>
        `;
      }).join('')
    : `<button type="button" class="hd-empty hd-empty-cta" data-report-action="switch-tab" data-tab="settings">아직 목표가 없어요 · 설정에서 카테고리 목표를 정해보세요 ${ICON.chevronRight}</button>`;
  return `
    <section class="hd-goals">
      <div class="hd-card-head bare"><h2>나의 목표</h2><button type="button" class="hd-more" data-report-action="switch-tab" data-tab="settings">전체 보기 ${ICON.chevronRight}</button></div>
      <div class="hd-goal-grid">${grid}</div>
    </section>
  `;
}

function pointsHtml(points, cycleLabel = '이번 2주') {
  const list = points.length
    ? points.map(p => `
        <button type="button" class="hd-point-row" data-reward-point-action="open" data-reward-point-id="${esc(p.key)}">
          <span class="hd-point-av" style="background:${p.color}">${esc(firstChar(p.label))}</span>
          <span class="hd-point-name">${esc(p.label)}</span>
          <span class="hd-point-val hd-tone-${p.direction === 'down' ? 'danger' : 'success'}">${esc(p.value)}</span>
          <span class="hd-point-dir hd-tone-${p.direction === 'down' ? 'danger' : 'success'}">${p.direction === 'down' ? ICON.chevronDown : ICON.chevronUp}</span>
        </button>
      `).join('')
    : '<div class="hd-empty">아직 포인트 내역이 없어요 · 절제한 날의 적립이 여기에 쌓여요</div>';
  return `
    <section class="hd-card hd-points">
      <div class="hd-card-head"><h2>${esc(cycleLabel)} 포인트</h2>${points.length ? `<button type="button" class="hd-more" data-reward-point-action="open" data-reward-point-id="${esc(points[0].key)}">자세히 ${ICON.chevronRight}</button>` : ''}</div>
      <div class="hd-point-list">${list}</div>
    </section>
  `;
}

// Catmull-Rom → cubic bezier smoothing (Monotone-ish, no overshoot spikes)
function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length < 3) return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// ---------- helpers ----------
function mergeModel(base, over) {
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) out[k] = { ...base[k], ...over[k] };
    else out[k] = over[k];
  }
  return out;
}
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function clampPct(v) { const n = Number(v) || 0; return Math.min(100, Math.max(0, n)); }
function firstChar(s) { return Array.from(String(s || '').trim())[0] || 'P'; }
