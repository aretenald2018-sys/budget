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
};

const CATEGORY_COLORS = ['#5B8FFF', '#B277E6', '#F5C64A', '#F08A3C', '#FF5B6B', '#98A4BC', '#3BD68F'];

const DEFAULT_MODEL = {
  user: { name: '태우', greeting: '좋은 하루예요!', avatarUrl: '', avatarInitial: '태' },
  period: { label: '7월 15일 – 7월 28일', cycleLabel: '이번 2주' },
  hero: {
    label: '지금까지 쓴 돈',
    amountText: '−196,323',
    overLabel: '예산 초과',
    overText: '+196,323원 초과',
    spent: 941323, budget: 750000, usageText: '125% 사용', usageTone: 'danger',
    fillPercent: 48,
    trend: [8, 11, 10, 15, 13, 19, 22, 26, 23, 21],
    tooltip: '지금 여기',
  },
  kpis: [
    { key: 'income', label: '수입', value: '344,267원', sub: '이번 2주', tone: 'info', icon: 'income' },
    { key: 'fixed', label: '고정비', value: '290,635원', sub: '이번 달', tone: 'brand', icon: 'trend' },
    { key: 'savings', label: '저축률', value: '15%', sub: '△ 3%p', subTone: 'success', tone: 'success', icon: 'trend' },
    { key: 'budget', label: '이번 달 예산', value: '1,050,000원', sub: '예정', tone: 'warning', icon: 'wallet' },
  ],
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
    { name: '생활유지비', fraction: '44만 / 20만', percent: 100, color: '#7C5CF0', icon: '🏠' },
    { name: '자아유지비', fraction: '3,000 / 30만', percent: 10, color: '#B277E6', icon: '🌿' },
    { name: '변동비', fraction: '1만 / 25만', percent: 4, color: '#3BD68F', icon: '🍷' },
    { name: '미분류', fraction: '49만 / 0', percent: null, color: '#98A4BC', icon: '❔', action: '설정하기' },
  ],
  points: [
    { key: 'wine', label: '와인구매', value: '−3,356P', direction: 'down', color: '#E86A6A' },
    { key: 'ingredient', label: '고급재료', value: '+12,129P', direction: 'up', color: '#7C5CF0' },
    { key: 'travel', label: '여행충당', value: '+84,901P', direction: 'up', color: '#5B8FFF' },
    { key: 'delivery', label: '배달', value: '+36,386P', direction: 'up', color: '#2FB8A8' },
  ],
  devIdeas: {
    runningLabel: '17개 진행중',
    items: [
      { title: '개발 아이디어', status: '완료', done: true },
      { title: 'AI공생 프로젝트', status: '진행중', done: false },
      { title: 'Z04', status: '진행중', done: false },
      { title: '요청사항들을 주간으로 집계해서 메타적으로 개…', status: '진행중', done: false },
    ],
  },
};

export function homeDashboardHtml(model = {}) {
  const m = mergeModel(DEFAULT_MODEL, model);
  return `
    <div class="home-dash">
      ${headerHtml(m)}
      ${heroHtml(m.hero)}
      ${kpiHtml(m.kpis)}
      ${categoriesHtml(m.categories)}
      ${goalsHtml(m.goals)}
      <div class="hd-two-col">
        ${pointsHtml(m.points)}
        ${devIdeasHtml(m.devIdeas)}
      </div>
    </div>
  `;
}

function headerHtml(m) {
  const avatar = m.user.avatarUrl
    ? `<img class="hd-avatar" src="${esc(m.user.avatarUrl)}" alt="프로필">`
    : `<div class="hd-avatar hd-avatar-fallback">${esc(m.user.avatarInitial || '나')}</div>`;
  return `
    <header class="hd-header">
      <div class="hd-head-left">
        <h1 class="hd-title">홈 <span class="hd-wave">👋</span></h1>
        <p class="hd-greet">${esc(m.user.name)}님, ${esc(m.user.greeting)}</p>
        <button type="button" class="hd-date" data-report-action="open-biweekly-start">
          <span class="hd-date-ic">${ICON.calendar}</span>
          <span>${esc(m.period.label)}</span>
          <span class="hd-date-caret">${ICON.chevronDown}</span>
        </button>
      </div>
      <div class="hd-head-actions">
        <button type="button" class="hd-icon-btn" aria-label="검색">${ICON.search}</button>
        <button type="button" class="hd-icon-btn" aria-label="알림">${ICON.bell}</button>
        <div class="hd-avatar-wrap">${avatar}<span class="hd-avatar-dot"></span></div>
      </div>
    </header>
  `;
}

function heroHtml(h) {
  return `
    <section class="hd-hero">
      <div class="hd-hero-top">
        <button type="button" class="hd-cycle-pill" data-report-action="toggle-mode">
          <span>${esc(h.cycleLabel || '이번 2주')}</span>${ICON.chevronDown}
        </button>
        <button type="button" class="hd-analyze" data-report-action="switch-tab" data-tab="report">
          ${ICON.analyze}<span>분석 보기</span>
        </button>
      </div>
      <div class="hd-hero-main">
        <div class="hd-hero-info">
          <div class="hd-hero-label">${esc(h.label)}</div>
          <div class="hd-hero-amount">${esc(h.amountText)}<span class="hd-won">원</span></div>
          <div class="hd-hero-over">
            <span class="hd-over-pill">${esc(h.overLabel)}</span>
            <span class="hd-over-text">${esc(h.overText)}</span>
          </div>
        </div>
        ${heroChartHtml(h)}
      </div>
      <div class="hd-hero-progress">
        <div class="hd-hero-track"><span class="hd-hero-fill" style="width:${clampPct(h.fillPercent)}%"></span></div>
      </div>
      <div class="hd-hero-foot">
        <span class="hd-hero-detail">지출 ${esc(fmtWon(h.spent))} / 예산 ${esc(fmtWon(h.budget))}</span>
        <span class="hd-hero-usage hd-tone-${esc(h.usageTone || 'danger')}">${esc(h.usageText)}</span>
      </div>
    </section>
  `;
}

function heroChartHtml(h) {
  const series = Array.isArray(h.trend) && h.trend.length > 1 ? h.trend : [40, 38, 30, 26, 18, 10, 6];
  const W = 200, H = 96, pad = 6;
  const max = Math.max(...series), min = Math.min(...series);
  const span = Math.max(1, max - min);
  const pts = series.map((v, i) => {
    const x = pad + (i / (series.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / span) * (H - pad * 2);
    return [x, y];
  });
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;
  const end = pts[pts.length - 1];
  const ex = ((end[0] / W) * 100).toFixed(1);
  const ey = ((end[1] / H) * 100).toFixed(1);
  return `
    <div class="hd-hero-chart">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="hd-hero-svg">
        <defs>
          <linearGradient id="hdLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#F25F9B"/></linearGradient>
          <linearGradient id="hdArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B45CE0" stop-opacity=".28"/><stop offset="1" stop-color="#B45CE0" stop-opacity="0"/></linearGradient>
        </defs>
        <path d="${area}" fill="url(#hdArea)"/>
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
      ${kpis.map(k => `
        <div class="hd-kpi hd-tone-${esc(k.tone)}">
          <span class="hd-kpi-ic">${ICON[k.icon] || ICON.wallet}</span>
          <div class="hd-kpi-label">${esc(k.label)}</div>
          <div class="hd-kpi-value">${esc(k.value)}</div>
          <div class="hd-kpi-sub ${k.subTone ? 'hd-tone-' + esc(k.subTone) : ''}">${esc(k.sub)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function categoriesHtml(c) {
  const items = c.items.map((it, i) => ({ ...it, color: CATEGORY_COLORS[(it.id ? it.id - 1 : i) % CATEGORY_COLORS.length] }));
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
          ${items.map(it => `
            <div class="hd-legend-row">
              <span class="hd-legend-dot" style="background:${it.color}"></span>
              <span class="hd-legend-name">${esc(it.label)}</span>
              <span class="hd-legend-pct">${Number(it.percent) || 0}%</span>
              <span class="hd-legend-amt">${esc(it.amount)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function goalsHtml(goals) {
  return `
    <section class="hd-goals">
      <div class="hd-card-head bare"><h2>나의 목표</h2><button type="button" class="hd-more" data-report-action="switch-tab" data-tab="settings">전체 보기 ${ICON.chevronRight}</button></div>
      <div class="hd-goal-grid">
        ${goals.map(g => `
          <div class="hd-goal">
            <div class="hd-goal-top"><span class="hd-goal-ic" style="background:${g.color}22;color:${g.color}">${esc(g.icon)}</span><span class="hd-goal-name">${esc(g.name)}</span></div>
            <div class="hd-goal-frac">${esc(g.fraction)}</div>
            ${g.action
              ? `<button type="button" class="hd-goal-set" data-report-action="switch-tab" data-tab="settings">${esc(g.action)}</button>`
              : `<div class="hd-goal-bar"><span style="width:${clampPct(g.percent)}%;background:${g.percent >= 100 ? '#7C5CF0' : '#7C5CF0'}"></span></div>
                 <div class="hd-goal-pct">${Math.round(Number(g.percent) || 0)}%</div>`}
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function pointsHtml(points) {
  return `
    <section class="hd-card hd-points">
      <div class="hd-card-head"><h2>이번 2주 포인트</h2><button type="button" class="hd-mini-pill">기준액 대비 ${ICON.chevronDown}</button></div>
      <div class="hd-point-list">
        ${points.map(p => `
          <button type="button" class="hd-point-row" data-reward-point-action="open" data-reward-point-id="${esc(p.key)}">
            <span class="hd-point-av" style="background:${p.color}">${esc(firstChar(p.label))}</span>
            <span class="hd-point-name">${esc(p.label)}</span>
            <span class="hd-point-val hd-tone-${p.direction === 'down' ? 'danger' : 'success'}">${esc(p.value)}</span>
            <span class="hd-point-dir hd-tone-${p.direction === 'down' ? 'danger' : 'success'}">${p.direction === 'down' ? ICON.chevronDown : ICON.chevronUp}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function devIdeasHtml(d) {
  return `
    <section class="hd-card hd-dev">
      <div class="hd-card-head"><h2>Dev Ideas</h2><span class="hd-dev-count">${esc(d.runningLabel)} ${ICON.chevronRight}</span></div>
      <div class="hd-dev-list">
        ${d.items.map(it => `
          <label class="hd-dev-row ${it.done ? 'done' : ''}">
            <input type="checkbox" ${it.done ? 'checked' : ''}>
            <span class="hd-dev-check"></span>
            <span class="hd-dev-title">${esc(it.title)}</span>
            <span class="hd-dev-badge ${it.done ? 'ok' : ''}">${esc(it.status)}</span>
            <span class="hd-dev-x">×</span>
          </label>
        `).join('')}
      </div>
      <button type="button" class="hd-dev-add">아이디어 추가하기</button>
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
function fmtWon(n) { const v = Number(n) || 0; return v.toLocaleString('ko-KR') + '원'; }
function firstChar(s) { return Array.from(String(s || '').trim())[0] || 'P'; }
