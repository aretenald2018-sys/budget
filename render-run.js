import { listRunActivities } from './data.js?v=20260710-gps-route-rewrite';
import { $, escHtml } from './utils/dom.js?v=20260503-sync-latest';
import { fmtDateTime } from './utils/format.js?v=20260503-sync-latest';
import {
  normalizeRunActivitySummary,
  formatRunDistanceKm,
  formatRunDuration,
  formatRunPace,
  projectRunRoute,
} from './utils/gps-route.js?v=20260710-gps-route-rewrite';

const MAP_WIDTH = 360;
const MAP_HEIGHT = 380;
let _activities = [];
let _selectedId = '';
let _bound = false;

export async function renderRun() {
  const root = $('#tab-run');
  if (!root) return;
  root.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  bindRunEvents(root);

  try {
    _activities = await loadRunActivities();
    if (!_activities.length) {
      root.innerHTML = emptyRunHtml();
      return;
    }
    if (!_activities.some(item => item.id === _selectedId)) _selectedId = _activities[0].id;
    renderRunContent(root);
  } catch (err) {
    console.error('[render-run]', err);
    root.innerHTML = `
      <div class="empty-state compact">
        <div>러닝 기록을 불러오지 못했습니다</div>
        <div class="st4">${escHtml(err?.message || '잠시 후 다시 시도하세요.')}</div>
      </div>
    `;
  }
}

function bindRunEvents(root) {
  if (_bound) return;
  _bound = true;
  root.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-run-id]');
    if (!target || !root.contains(target)) return;
    _selectedId = target.dataset.runId || '';
    renderRunContent(root);
  });
}

async function loadRunActivities() {
  if (Array.isArray(window.__BUDGET_RUN_ACTIVITY_FIXTURES__)) {
    return window.__BUDGET_RUN_ACTIVITY_FIXTURES__.map((activity, index) => ({
      id: activity.id || `fixture-${index + 1}`,
      ...activity,
    }));
  }
  const rows = await listRunActivities({ max: 20 });
  return rows;
}

function renderRunContent(root) {
  const selected = _activities.find(item => item.id === _selectedId) || _activities[0];
  root.innerHTML = `
    <section class="run-screen" data-run-selected-id="${escHtml(selected.id || '')}">
      ${runActivityDetailHtml(selected)}
      ${_activities.length > 1 ? runActivityListHtml(_activities, selected.id) : ''}
    </section>
  `;
}

function runActivityDetailHtml(activity) {
  const summary = normalizeRunActivitySummary(activity);
  const route = summary.route;
  const pointCount = route.points.length;
  const started = summary.startedAt ? fmtDateTime(summary.startedAt) : '날짜 없음';
  return `
    <article class="run-detail" data-route-point-count="${pointCount}" data-route-distance-km="${formatRunDistanceKm(route.distanceKm)}">
      <div class="run-title-block">
        <span>${escHtml(started)}</span>
        <h2>${escHtml(summary.title)}</h2>
      </div>
      <div class="run-distance">
        <strong>${formatRunDistanceKm(route.distanceKm)}</strong>
        <span>킬로미터</span>
      </div>
      <div class="run-stat-grid">
        ${runStatHtml(formatRunPace(route.paceSecondsPerKm), '평균 페이스')}
        ${runStatHtml(formatRunDuration(route.durationSeconds), '시간')}
        ${runStatHtml(numberText(summary.calories), '칼로리')}
        ${runStatHtml(`${numberText(summary.elevationGainMeters)} m`, '고도 상승')}
        ${runStatHtml(numberText(summary.averageHeartRate), '평균 심박수')}
        ${runStatHtml(numberText(summary.cadence), '케이던스')}
      </div>
      ${routeMapHtml(route, activity)}
    </article>
  `;
}

function runStatHtml(value, label) {
  return `
    <div class="run-stat">
      <strong>${escHtml(value)}</strong>
      <span>${escHtml(label)}</span>
    </div>
  `;
}

function routeMapHtml(route, activity) {
  if (route.points.length < 2) {
    return `
      <div class="run-map empty" data-route-polyline-points="0">
        <div>GPS 경로 데이터가 없습니다</div>
        <span>갤럭시워치 또는 모바일 기록의 위치 배열이 저장되면 전체 궤적을 표시합니다.</span>
      </div>
    `;
  }
  const projected = projectRunRoute(route, { width: MAP_WIDTH, height: MAP_HEIGHT, padding: 34 });
  const pathPointCount = projected.points.length;
  const routePath = smoothSvgPath(projected.points);
  const city = activity.locationLabel || activity.city || activity.region || '송파구, 서울특별시';
  return `
    <div class="run-map" data-route-polyline-points="${pathPointCount}">
      <svg class="run-map-svg" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="GPS 전체 궤적">
        <defs>
          <linearGradient id="run-route-grade" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stop-color="#b8e03f"></stop>
            <stop offset="38%" stop-color="#f59e0b"></stop>
            <stop offset="100%" stop-color="#ff3b18"></stop>
          </linearGradient>
        </defs>
        <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" rx="2" class="run-map-land"></rect>
        <path class="run-map-water left" d="M0 0 C50 62 22 128 58 178 C90 222 38 292 74 380 L0 380 Z"></path>
        <path class="run-map-water top" d="M0 42 C78 26 124 44 184 18 C240 -8 306 8 360 0 L360 55 C286 72 250 48 188 73 C126 98 70 64 0 84 Z"></path>
        <path class="run-map-road" d="M7 350 C80 326 118 356 172 338 C230 318 282 344 354 314"></path>
        <path class="run-route-shadow" d="${routePath}"></path>
        <path class="run-route-path" d="${routePath}"></path>
        ${projected.kilometerMarkers.map(marker => `
          <g class="run-km-marker" transform="translate(${marker.x} ${marker.y})">
            <rect x="-34" y="-16" width="68" height="27" rx="8"></rect>
            <text x="0" y="2">${marker.km}킬로미터</text>
          </g>
        `).join('')}
        ${routeMarkerSvg(projected.startPoint, 'start')}
        ${routeMarkerSvg(projected.endPoint, 'end')}
      </svg>
      <div class="run-map-label top">${escHtml(city)}</div>
      <div class="run-map-detail" aria-label="상세 경로">상세 경로</div>
    </div>
  `;
}

function routeMarkerSvg(point, type) {
  if (!point) return '';
  return `
    <g class="run-route-marker ${type}" transform="translate(${point.x} ${point.y})">
      <circle r="9"></circle>
      <circle r="5"></circle>
    </g>
  `;
}

function smoothSvgPath(points) {
  if (!points.length) return '';
  if (points.length < 3) return straightSvgPath(points);
  const parts = [`M ${routeCoord(points[0].x)} ${routeCoord(points[0].y)}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const cp1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    };
    const cp2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    };
    parts.push(`C ${routeCoord(cp1.x)} ${routeCoord(cp1.y)}, ${routeCoord(cp2.x)} ${routeCoord(cp2.y)}, ${routeCoord(p2.x)} ${routeCoord(p2.y)}`);
  }
  return parts.join(' ');
}

function straightSvgPath(points) {
  const [first, ...rest] = points;
  return [`M ${routeCoord(first.x)} ${routeCoord(first.y)}`, ...rest.map(point => `L ${routeCoord(point.x)} ${routeCoord(point.y)}`)].join(' ');
}

function routeCoord(value) {
  return Math.round(Number(value) * 10) / 10;
}

function runActivityListHtml(items, selectedId) {
  return `
    <div class="run-list">
      ${items.map(item => {
        const summary = normalizeRunActivitySummary(item);
        const selected = item.id === selectedId ? ' active' : '';
        return `
          <button type="button" class="run-list-item${selected}" data-run-id="${escHtml(item.id)}">
            <span>${escHtml(summary.title)}</span>
            <strong>${formatRunDistanceKm(summary.distanceKm)} km</strong>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function emptyRunHtml() {
  return `
    <section class="run-empty">
      <strong>러닝 기록 없음</strong>
      <span>갤럭시워치나 모바일에서 저장된 GPS 좌표 배열이 있으면 전체 궤적과 거리 데이터를 표시합니다.</span>
    </section>
  `;
}

function numberText(value) {
  const n = Math.round(Number(value) || 0);
  return n > 0 ? n.toLocaleString('ko-KR') : '--';
}

window.renderRun = renderRun;
