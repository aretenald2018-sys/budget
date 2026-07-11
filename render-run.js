import { getRunActivity, listRunActivities, saveRunActivity } from './data.js?v=20260710-gps-route-fidelity';
import { $, escHtml } from './utils/dom.js?v=20260503-sync-latest';
import { fmtDateTime } from './utils/format.js?v=20260503-sync-latest';
import {
  normalizeRunActivitySummary,
  formatRunDistanceKm,
  formatRunDuration,
  formatRunPace,
  projectRunRoute,
} from './utils/gps-route.js?v=20260710-gps-route-fidelity';
import {
  buildRunInsights,
  calculateRunSplits,
  normalizeRunPreferences,
} from './utils/run-insights.js?v=20260711-run-coach';

const MAP_WIDTH = 360;
const MAP_HEIGHT = 380;
const RUN_PREFERENCES_KEY = 'budget.run.preferences.v1';
const APK_DOWNLOAD_URL = './downloads/budget.apk?run=20260711-native-gps';
let _activities = [];
let _selectedId = '';
let _preferences = loadRunPreferences();
let _bound = false;
let _recorderTimer = null;
let _pwaSession = null;
let _recorderMessage = '';

export async function renderRun() {
  const root = $('#tab-run');
  if (!root) return;
  root.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  bindRunEvents(root);

  try {
    _activities = await loadRunActivities();
    if (_activities.length && !_activities.some(item => item.id === _selectedId)) _selectedId = _activities[0].id;
    await renderSelectedRun(root);
    startRecorderPolling(root);
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
  root.addEventListener('click', async (event) => {
    const runTarget = event.target?.closest?.('[data-run-id]');
    if (runTarget && root.contains(runTarget)) {
      _selectedId = runTarget.dataset.runId || '';
      await renderSelectedRun(root).catch((err) => {
        console.error('[render-run]', err);
        renderRunContent(root);
      });
      return;
    }
    const actionTarget = event.target?.closest?.('[data-run-action]');
    if (!actionTarget || !root.contains(actionTarget)) return;
    await handleRunAction(actionTarget.dataset.runAction, root);
  });
  root.addEventListener('submit', (event) => {
    const form = event.target?.closest?.('[data-run-goal-form]');
    if (!form || !root.contains(form)) return;
    event.preventDefault();
    const data = new FormData(form);
    _preferences = normalizeRunPreferences({
      weeklyGoalKm: data.get('weeklyGoalKm'),
      daysPerWeek: data.get('daysPerWeek'),
    });
    saveRunPreferences(_preferences);
    renderRunContent(root);
  });
}

async function handleRunAction(action, root) {
  if (action === 'edit-goal') {
    root.querySelector('[data-run-goal-form]')?.removeAttribute('hidden');
    root.querySelector('[data-run-goal-summary]')?.setAttribute('hidden', '');
    return;
  }
  if (action === 'cancel-goal') {
    renderRunContent(root);
    return;
  }
  if (action === 'start-recording') return startRunRecording(root);
  if (action === 'pause-recording') return pauseRunRecording(root);
  if (action === 'resume-recording') return resumeRunRecording(root);
  if (action === 'stop-recording') return stopRunRecording(root);
  if (action === 'cancel-recording') return cancelRunRecording(root);
}

async function loadRunActivities() {
  if (Array.isArray(window.__BUDGET_RUN_ACTIVITY_FIXTURES__)) {
    return window.__BUDGET_RUN_ACTIVITY_FIXTURES__.map((activity, index) => ({
      id: activity.id || `fixture-${index + 1}`,
      ...activity,
    }));
  }
  return listRunActivities({ max: 100, hydrateRoutes: false });
}

function renderRunContent(root) {
  const selected = _activities.find(item => item.id === _selectedId) || _activities[0] || null;
  const insights = buildRunInsights(_activities, _preferences);
  root.innerHTML = `
    <section class="run-screen" data-run-selected-id="${escHtml(selected?.id || '')}">
      ${runRecorderHtml(recorderState())}
      ${runDashboardHtml(insights)}
      ${selected ? runActivityDetailHtml(selected) : emptyRunHtml()}
      ${_activities.length ? runActivityListHtml(_activities.slice(0, 12), selected?.id || '') : ''}
    </section>
  `;
}

async function renderSelectedRun(root) {
  const index = _activities.findIndex(item => item.id === _selectedId);
  const selected = index >= 0 ? _activities[index] : _activities[0];
  if (!selected || Array.isArray(window.__BUDGET_RUN_ACTIVITY_FIXTURES__)) {
    renderRunContent(root);
    return;
  }
  const needsRouteHydration = selected.routeStoredInChunks
    && selected.routeComplete !== false
    && (!Array.isArray(selected.routePoints) || selected.routePoints.length === 0);
  if (needsRouteHydration) {
    const hydrated = await getRunActivity(selected.id);
    if (hydrated) _activities[index] = hydrated;
  }
  renderRunContent(root);
}

function runRecorderHtml(state) {
  const isNative = state.mode === 'native';
  const isRecording = state.status === 'recording';
  const isPaused = state.status === 'paused';
  const isActive = isRecording || isPaused;
  const title = isNative ? 'APK 백그라운드 GPS' : 'PWA 전경 GPS';
  const description = isNative
    ? '화면을 잠가도 네이티브 위치 서비스가 경로를 기록합니다.'
    : '이 화면이 열려 있을 때만 기록됩니다. 화면 잠금·백그라운드 러닝은 APK를 사용하세요.';
  return `
    <section class="run-recorder ${isActive ? 'active' : ''}" data-run-recorder-host data-recorder-mode="${state.mode}" data-recorder-status="${state.status}">
      <div class="run-recorder-head">
        <div>
          <span class="run-section-eyebrow">${escHtml(title)}</span>
          <strong>${isActive ? (isPaused ? '일시정지됨' : '러닝 기록 중') : '새 러닝 기록'}</strong>
        </div>
        <span class="run-recorder-dot" aria-hidden="true"></span>
      </div>
      ${isActive ? `
        <div class="run-recorder-live" aria-live="polite">
          <div><strong>${formatRunDuration(state.durationSeconds)}</strong><span>시간</span></div>
          <div><strong>${formatRunDistanceKm(state.distanceMeters / 1000)}</strong><span>km</span></div>
          <div><strong>${formatRunPace(state.distanceMeters >= 100 ? state.durationSeconds / (state.distanceMeters / 1000) : 0)}</strong><span>평균 페이스</span></div>
        </div>
      ` : `<p>${escHtml(description)}</p>`}
      ${state.message || _recorderMessage ? `<div class="run-recorder-message">${escHtml(state.message || _recorderMessage)}</div>` : ''}
      <div class="run-recorder-actions">
        ${!isActive ? '<button type="button" class="run-primary-button" data-run-action="start-recording">러닝 시작</button>' : ''}
        ${isRecording ? '<button type="button" class="run-secondary-button" data-run-action="pause-recording">일시정지</button>' : ''}
        ${isPaused ? '<button type="button" class="run-secondary-button" data-run-action="resume-recording">계속</button>' : ''}
        ${isActive ? '<button type="button" class="run-primary-button danger" data-run-action="stop-recording">종료·저장</button>' : ''}
        ${isPaused ? '<button type="button" class="run-text-button" data-run-action="cancel-recording">기록 취소</button>' : ''}
        ${!isNative && !isActive ? `<a class="run-apk-link" href="${APK_DOWNLOAD_URL}" download>백그라운드 기록용 APK</a>` : ''}
      </div>
      ${!isNative ? '<span class="run-recorder-footnote">갤럭시 워치 기록은 GPX·TCX·JSON 파일을 APK에 공유하면 이 화면에 합쳐집니다.</span>' : ''}
    </section>
  `;
}

function runDashboardHtml(insights) {
  return `
    <section class="run-dashboard" aria-label="러닝 훈련 현황">
      <article class="run-week-card">
        <div data-run-goal-summary>
          <div class="run-card-head">
            <div><span class="run-section-eyebrow">이번 주</span><h2>${formatRunDistanceKm(insights.weekDistanceKm)} <small>/ ${formatRunDistanceKm(insights.settings.weeklyGoalKm)} km</small></h2></div>
            <button type="button" class="run-icon-button" data-run-action="edit-goal" aria-label="주간 러닝 목표 변경">목표</button>
          </div>
          <div class="run-progress-track" role="progressbar" aria-label="주간 거리 목표" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${insights.progressPercent}">
            <span style="width:${insights.progressPercent}%"></span>
          </div>
          <div class="run-week-stats">
            <div><strong>${insights.weekRunCount}회</strong><span>러닝</span></div>
            <div><strong>${formatRunDuration(insights.weekDurationSeconds)}</strong><span>운동 시간</span></div>
            <div><strong>${formatRunDistanceKm(insights.remainingKm)} km</strong><span>남은 거리</span></div>
          </div>
        </div>
        ${runGoalFormHtml(insights.settings)}
      </article>
      <article class="run-coach-card ${escHtml(insights.recommendation.tone)}">
        <div class="run-coach-copy">
          <span class="run-section-eyebrow">${escHtml(insights.recommendation.eyebrow)}</span>
          <h3>${escHtml(insights.recommendation.title)}</h3>
          <p>${escHtml(insights.recommendation.detail)}</p>
        </div>
        <strong class="run-coach-target">${escHtml(insights.recommendation.target)}</strong>
      </article>
      ${runScheduleHtml(insights.schedule)}
      ${runTrendAndRecordsHtml(insights)}
    </section>
  `;
}

function runGoalFormHtml(settings) {
  return `
    <form class="run-goal-form" data-run-goal-form hidden>
      <div class="run-goal-field">
        <label for="run-weekly-goal">주간 거리</label>
        <div><input id="run-weekly-goal" name="weeklyGoalKm" type="number" min="3" max="200" step="1" value="${settings.weeklyGoalKm}"><span>km</span></div>
      </div>
      <div class="run-goal-field">
        <label for="run-days-per-week">주간 횟수</label>
        <select id="run-days-per-week" name="daysPerWeek">
          ${[1, 2, 3, 4, 5, 6, 7].map(value => `<option value="${value}"${value === settings.daysPerWeek ? ' selected' : ''}>${value}회</option>`).join('')}
        </select>
      </div>
      <div class="run-goal-actions">
        <button type="button" class="run-secondary-button" data-run-action="cancel-goal">취소</button>
        <button type="submit" class="run-primary-button">목표 저장</button>
      </div>
      <span>목표는 이 기기에 저장되며 추천 루틴에 바로 반영됩니다.</span>
    </form>
  `;
}

function runScheduleHtml(schedule) {
  return `
    <article class="run-training-card">
      <div class="run-card-head"><div><span class="run-section-eyebrow">자동 훈련 루틴</span><h3>이번 주 ${schedule.length}회</h3></div><span>기록 기준 자동 체크</span></div>
      <div class="run-session-list">
        ${schedule.map((session, index) => `
          <div class="run-session ${session.status}">
            <span class="run-session-index">${session.status === 'done' ? '✓' : index + 1}</span>
            <div><strong>${escHtml(session.title)}</strong><span>${escHtml(session.detail)}</span></div>
            <b>${session.targetKm.toFixed(1)} km</b>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

function runTrendAndRecordsHtml(insights) {
  const longest = insights.records.longest;
  const fastest = insights.records.fastest;
  return `
    <div class="run-dashboard-grid">
      <article class="run-trend-card">
        <div class="run-card-head"><div><span class="run-section-eyebrow">6주 추세</span><h3>${formatRunDistanceKm(insights.monthDistanceKm)} km <small>이번 달</small></h3></div></div>
        <div class="run-trend-bars">
          ${insights.weeklyTrend.map(week => `
            <div class="${week.isCurrent ? 'current' : ''}"><span style="height:${Math.max(4, week.barPercent)}%"></span><small>${escHtml(week.label)}</small></div>
          `).join('')}
        </div>
      </article>
      <article class="run-record-card">
        <span class="run-section-eyebrow">내 기록</span>
        <div><span>최장 거리</span><strong>${longest ? `${formatRunDistanceKm(longest.distanceKm)} km` : '--'}</strong></div>
        <div><span>최고 평균 페이스</span><strong>${fastest ? `${formatRunPace(fastest.paceSecondsPerKm)} /km` : '--'}</strong></div>
      </article>
    </div>
  `;
}

function runActivityDetailHtml(activity) {
  const summary = normalizeRunActivitySummary(activity);
  const route = summary.route;
  const pointCount = route.points.length;
  const started = summary.startedAt ? fmtDateTime(summary.startedAt) : '날짜 없음';
  const splitAnalysis = calculateRunSplits(activity);
  return `
    <article class="run-detail" data-route-point-count="${pointCount}" data-route-distance-km="${formatRunDistanceKm(route.distanceKm)}">
      <div class="run-detail-divider"><span>최근 활동 분석</span></div>
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
      ${runSplitAnalysisHtml(splitAnalysis)}
    </article>
  `;
}

function runSplitAnalysisHtml(analysis) {
  if (!analysis.available) {
    return `
      <section class="run-analysis-card empty">
        <div class="run-card-head"><div><span class="run-section-eyebrow">페이스 분석</span><h3>km 스플릿</h3></div></div>
        <p>${escHtml(analysis.message)}</p>
      </section>
    `;
  }
  return `
    <section class="run-analysis-card" data-run-split-count="${analysis.splits.length}" data-run-splits-estimated="${analysis.estimated}">
      <div class="run-card-head">
        <div><span class="run-section-eyebrow">페이스 분석</span><h3>km 스플릿</h3></div>
        ${analysis.estimated ? '<span class="run-estimated-badge">추정</span>' : '<span>GPS 시간 기준</span>'}
      </div>
      <div class="run-split-list">
        ${analysis.splits.map(split => `
          <div class="run-split-row ${split.isFastest ? 'fastest' : ''}">
            <span>${split.isPartial ? `${(split.distanceMeters / 1000).toFixed(2)} km` : `${split.index} km`}</span>
            <div><i style="width:${split.barPercent}%"></i></div>
            <strong>${formatRunPace(split.paceSecondsPerKm)}</strong>
          </div>
        `).join('')}
      </div>
      <div class="run-split-insight">
        <strong>${analysis.estimated ? '데이터 안내' : (analysis.paceChangePercent < -2 ? '네거티브 스플릿' : '페이스 유지력')}</strong>
        <span>${escHtml(analysis.insight)}</span>
      </div>
    </section>
  `;
}

function runStatHtml(value, label) {
  return `<div class="run-stat"><strong>${escHtml(value)}</strong><span>${escHtml(label)}</span></div>`;
}

function routeMapHtml(route, activity) {
  if (route.points.length < 3) {
    const message = activity.routeIncomplete ? '저장된 GPS 경로가 일부 누락되었습니다' : 'GPS 경로 데이터가 부족합니다';
    const hint = activity.routeIncomplete
      ? '위치 청크를 모두 불러와야 실제 러닝 궤적을 표시합니다.'
      : '시작점과 끝점만 있는 기록은 실제 궤적으로 표시하지 않습니다.';
    return `<div class="run-map empty" data-route-polyline-points="0"><div>${escHtml(message)}</div><span>${escHtml(hint)}</span></div>`;
  }
  const projected = projectRunRoute(route, { width: MAP_WIDTH, height: MAP_HEIGHT, padding: 34 });
  const routePath = smoothSvgPath(projected.points);
  const city = activity.locationLabel || activity.city || activity.region || 'GPS 러닝 경로';
  return `
    <div class="run-map" data-route-polyline-points="${projected.points.length}">
      <svg class="run-map-svg" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" role="img" aria-label="GPS 전체 궤적">
        <defs><linearGradient id="run-route-grade" x1="0%" x2="100%" y1="0%" y2="0%"><stop offset="0%" stop-color="#b8e03f"></stop><stop offset="38%" stop-color="#f59e0b"></stop><stop offset="100%" stop-color="#ff3b18"></stop></linearGradient></defs>
        <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" rx="2" class="run-map-land"></rect>
        <path class="run-map-water left" d="M0 0 C50 62 22 128 58 178 C90 222 38 292 74 380 L0 380 Z"></path>
        <path class="run-map-water top" d="M0 42 C78 26 124 44 184 18 C240 -8 306 8 360 0 L360 55 C286 72 250 48 188 73 C126 98 70 64 0 84 Z"></path>
        <path class="run-map-road" d="M7 350 C80 326 118 356 172 338 C230 318 282 344 354 314"></path>
        <path class="run-route-shadow" d="${routePath}"></path><path class="run-route-path" d="${routePath}"></path>
        ${projected.kilometerMarkers.map(marker => `<g class="run-km-marker" transform="translate(${marker.x} ${marker.y})"><rect x="-34" y="-16" width="68" height="27" rx="8"></rect><text x="0" y="2">${marker.km}킬로미터</text></g>`).join('')}
        ${routeMarkerSvg(projected.startPoint, 'start')}${routeMarkerSvg(projected.endPoint, 'end')}
      </svg>
      <div class="run-map-label top">${escHtml(city)}</div><div class="run-map-detail" aria-label="상세 경로">상세 경로</div>
    </div>
  `;
}

function routeMarkerSvg(point, type) {
  if (!point) return '';
  return `<g class="run-route-marker ${type}" transform="translate(${point.x} ${point.y})"><circle r="9"></circle><circle r="5"></circle></g>`;
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
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
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
    <section class="run-history"><div class="run-detail-divider"><span>최근 러닝</span></div><div class="run-list">
      ${items.map(item => {
        const summary = normalizeRunActivitySummary(item);
        return `<button type="button" class="run-list-item${item.id === selectedId ? ' active' : ''}" data-run-id="${escHtml(item.id)}"><div><span>${escHtml(summary.title)}</span><small>${escHtml(summary.startedAt ? fmtDateTime(summary.startedAt) : '날짜 없음')}</small></div><div><strong>${formatRunDistanceKm(summary.distanceKm)} km</strong><small>${formatRunPace(summary.route.paceSecondsPerKm)} /km</small></div></button>`;
      }).join('')}
    </div></section>
  `;
}

function emptyRunHtml() {
  return `<section class="run-empty"><strong>아직 저장된 러닝이 없습니다</strong><span>위의 ‘러닝 시작’으로 기록하거나 갤럭시 워치·러닝 앱에서 내보낸 GPX/TCX 파일을 APK에 공유하세요.</span></section>`;
}

function recorderState() {
  const bridge = nativeRunBridge();
  if (bridge?.getRunRecorderStatusJson) {
    try {
      const status = JSON.parse(bridge.getRunRecorderStatusJson());
      return { mode: 'native', status: status.state || 'idle', durationSeconds: status.durationSeconds || 0, distanceMeters: status.distanceMeters || 0, pointCount: status.pointCount || 0, message: status.message || '' };
    } catch (err) {
      console.warn('[run-recorder-native-status]', err);
    }
  }
  if (_pwaSession) {
    return {
      mode: 'pwa',
      status: _pwaSession.status,
      durationSeconds: pwaDurationSeconds(),
      distanceMeters: pwaDistanceMeters(_pwaSession.samples),
      pointCount: _pwaSession.samples.length,
      message: _pwaSession.message || '',
    };
  }
  return { mode: 'pwa', status: 'idle', durationSeconds: 0, distanceMeters: 0, pointCount: 0, message: '' };
}

function startRecorderPolling(root) {
  if (_recorderTimer) return;
  _recorderTimer = setInterval(() => {
    if (!document.body.contains(root) || root.classList.contains('hidden')) return;
    replaceRecorderCard(root);
  }, 1000);
}

function replaceRecorderCard(root) {
  const current = root.querySelector('[data-run-recorder-host]');
  if (!current) return;
  const holder = document.createElement('div');
  holder.innerHTML = runRecorderHtml(recorderState());
  current.replaceWith(holder.firstElementChild);
}

async function startRunRecording(root) {
  _recorderMessage = '';
  const bridge = nativeRunBridge();
  if (bridge?.startRunRecorder) {
    const result = String(bridge.startRunRecorder() || '');
    if (result === 'permission_required') {
      bridge.requestRunLocationPermission?.();
      _recorderMessage = '위치 권한을 허용한 뒤 러닝 시작을 다시 눌러주세요.';
    } else if (result === 'user_required') {
      _recorderMessage = '로그인 정보를 연결한 뒤 다시 시작해주세요.';
    } else if (result !== 'started' && result !== 'already_active') {
      _recorderMessage = '네이티브 GPS 기록을 시작하지 못했습니다.';
    }
    replaceRecorderCard(root);
    return;
  }
  if (!navigator.geolocation) {
    _recorderMessage = '이 브라우저는 위치 기록을 지원하지 않습니다. APK를 설치해주세요.';
    replaceRecorderCard(root);
    return;
  }
  _pwaSession = { status: 'recording', startedAt: Date.now(), pausedMs: 0, pausedAt: 0, samples: [], watchId: null, wakeLock: null, message: 'GPS 신호를 찾는 중…' };
  await acquireWakeLock();
  startPwaWatch(root);
  replaceRecorderCard(root);
}

function startPwaWatch(root) {
  if (!_pwaSession || _pwaSession.watchId != null) return;
  _pwaSession.watchId = navigator.geolocation.watchPosition((position) => {
    if (!_pwaSession || _pwaSession.status !== 'recording') return;
    const sample = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      altitude: position.coords.altitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
      elapsedSeconds: pwaDurationSeconds(),
    };
    if (sample.accuracy > 80) {
      _pwaSession.message = `GPS 정확도 개선 중 (±${Math.round(sample.accuracy)}m)`;
      return;
    }
    const previous = _pwaSession.samples.at(-1);
    if (previous) {
      const seconds = Math.max(.001, (sample.timestamp - previous.timestamp) / 1000);
      if (haversineMeters(previous, sample) / seconds > 13) {
        _pwaSession.message = '비정상 GPS 이동을 제외했습니다.';
        return;
      }
    }
    if (!previous || sample.timestamp - previous.timestamp >= 1000) _pwaSession.samples.push(sample);
    _pwaSession.message = sample.accuracy > 30 ? `GPS 정확도 ±${Math.round(sample.accuracy)}m` : '';
    replaceRecorderCard(root);
  }, (error) => {
    if (!_pwaSession) return;
    _pwaSession.message = error.code === 1
      ? '위치 권한이 거부되었습니다. 권한을 허용하거나 APK를 사용해주세요.'
      : 'GPS 신호를 받을 수 없습니다. 야외에서 다시 시도해주세요.';
    if (error.code === 1) _pwaSession.status = 'paused';
    replaceRecorderCard(root);
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
}

function pauseRunRecording(root) {
  const bridge = nativeRunBridge();
  if (bridge?.pauseRunRecorder) bridge.pauseRunRecorder();
  else if (_pwaSession?.status === 'recording') {
    _pwaSession.status = 'paused';
    _pwaSession.pausedAt = Date.now();
    stopPwaWatch();
  }
  replaceRecorderCard(root);
}

async function resumeRunRecording(root) {
  const bridge = nativeRunBridge();
  if (bridge?.resumeRunRecorder) bridge.resumeRunRecorder();
  else if (_pwaSession?.status === 'paused') {
    _pwaSession.pausedMs += Math.max(0, Date.now() - _pwaSession.pausedAt);
    _pwaSession.pausedAt = 0;
    _pwaSession.status = 'recording';
    await acquireWakeLock();
    startPwaWatch(root);
  }
  replaceRecorderCard(root);
}

async function stopRunRecording(root) {
  const bridge = nativeRunBridge();
  if (bridge?.stopRunRecorder) {
    bridge.stopRunRecorder();
    _recorderMessage = '러닝을 저장하는 중…';
    replaceRecorderCard(root);
    await delay(900);
    if (typeof window.flushAndroidRunActivityImports === 'function') await window.flushAndroidRunActivityImports({ silent: false });
    _recorderMessage = '';
    await renderRun();
    return;
  }
  if (!_pwaSession) return;
  stopPwaWatch();
  await releaseWakeLock();
  const session = _pwaSession;
  const durationSeconds = pwaDurationSeconds();
  if (session.samples.length < 2) {
    session.status = 'paused';
    session.message = '저장할 GPS 좌표가 부족합니다. 야외에서 신호를 확인해주세요.';
    replaceRecorderCard(root);
    return;
  }
  _pwaSession = null;
  await saveRunActivity({
    title: 'PWA 러닝',
    source: 'pwa_foreground_gps',
    startedAt: session.startedAt,
    endedAt: Date.now(),
    durationSeconds,
    gps: { samples: session.samples },
  });
  await renderRun();
}

async function cancelRunRecording(root) {
  const bridge = nativeRunBridge();
  if (bridge?.cancelRunRecorder) bridge.cancelRunRecorder();
  stopPwaWatch();
  await releaseWakeLock();
  _pwaSession = null;
  _recorderMessage = '';
  replaceRecorderCard(root);
}

function stopPwaWatch() {
  if (_pwaSession?.watchId != null) navigator.geolocation.clearWatch(_pwaSession.watchId);
  if (_pwaSession) _pwaSession.watchId = null;
}

async function acquireWakeLock() {
  if (!_pwaSession || !navigator.wakeLock?.request) return;
  try { _pwaSession.wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}

async function releaseWakeLock() {
  try { await _pwaSession?.wakeLock?.release?.(); } catch {}
}

function pwaDurationSeconds() {
  if (!_pwaSession) return 0;
  const endedAt = _pwaSession.status === 'paused' && _pwaSession.pausedAt ? _pwaSession.pausedAt : Date.now();
  return Math.max(0, Math.round((endedAt - _pwaSession.startedAt - _pwaSession.pausedMs) / 1000));
}

function pwaDistanceMeters(samples) {
  let total = 0;
  for (let index = 1; index < samples.length; index += 1) total += haversineMeters(samples[index - 1], samples[index]);
  return total;
}

function haversineMeters(a, b) {
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 12742017.6 * Math.asin(Math.sqrt(value));
}

function nativeRunBridge() {
  return window.BudgetAndroid || null;
}

function loadRunPreferences() {
  try { return normalizeRunPreferences(JSON.parse(localStorage.getItem(RUN_PREFERENCES_KEY) || '{}')); }
  catch { return normalizeRunPreferences({}); }
}

function saveRunPreferences(value) {
  localStorage.setItem(RUN_PREFERENCES_KEY, JSON.stringify(value));
}

function numberText(value) {
  const number = Math.round(Number(value) || 0);
  return number > 0 ? number.toLocaleString('ko-KR') : '--';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

window.renderRun = renderRun;
