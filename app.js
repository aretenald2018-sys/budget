// ================================================================
// app.js — 가계부 오케스트레이터
// ================================================================

import { initData, signIn, signOut, getCurrentUser, onAuthChange, listUrges, getAppSettings } from './data.js?v=20260702-reward-settings-system';
import { loadAndInjectModals, openModal, closeModal } from './modal-manager.js?v=20260702-home-tx-detail-fix';
import { showToast } from './utils/toast.js?v=20260503-sync-latest';
import { $, $$, escHtml } from './utils/dom.js?v=20260503-sync-latest';
import { hasServerApi } from './utils/runtime.js?v=20260505-github-pages';
import { cycleDateRangeText, cycleRangeForDate, normalizeCycleAnchorDate } from './utils/cycles.js?v=20260601-biweekly-start';
import { processPendingRawMessages } from './client-parse.js?v=20260702-reward-settings-system';

import { renderHome } from './render-home.js?v=20260702-reward-settings-system';
import { renderTx } from './render-tx.js?v=20260702-reward-settings-system';
import { renderFinance } from './render-finance.js?v=20260702-reward-settings-system';
import { renderSettings } from './render-settings.js?v=20260702-reward-settings-system';
import { renderUrgeInput } from './urge/render-urge-input.js?v=20260701-thread-complete';
import { renderMindbank } from './urge/render-mindbank.js?v=20260701-thread-complete';
import { renderReview } from './render-review.js?v=20260702-reward-settings-system';
import { renderSettle } from './render-settle.js?v=20260702-reward-settings-system';
import { renderReport } from './render-report.js?v=20260702-reward-settings-system';

const TABS = ['home', 'finance', 'tx', 'mindbank', 'urge', 'settings', 'review', 'settle', 'report'];
const SILENT_FIREBASE_CODES = new Set(['failed-precondition']);
const TAB_RENDERERS = {
  home: renderHome,
  finance: renderFinance,
  tx: renderTx,
  mindbank: renderMindbank,
  urge: renderUrgeInput,
  settings: renderSettings,
  review: renderReview,
  settle: renderSettle,
  report: () => renderReport({ rootSelector: '#tab-report', homeMode: false }),
};
const TAB_TITLES = {
  home: '홈', finance: '목표', tx: '거래 내역', mindbank: '감각뱅크', urge: '끌림 들여다보기', settings: '설정',
  review: '검토 대기', settle: '정산', report: '월간 리포트',
};
let _currentTab = 'home';
let _navBound = false;
let _autoParseStarted = false;
let _tabRenderSeq = 0;
const _tabRenderTokens = new Map();
const _pendingTabRefreshes = new Set();
const _urgeReminderTimers = new Map();
const CLIENT_FALLBACK_PARSE_KEY = 'budget.clientFallbackParseEnabled';
const CLIENT_FALLBACK_COOLDOWN_KEY = 'budget.clientFallbackParseCooldownUntil';
const CLIENT_FALLBACK_INTERVAL_KEY = 'budget.clientFallbackParseLastRunAt';
const BIWEEKLY_START_KEY = 'budget.biweeklyStartDate';
const CLIENT_FALLBACK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CLIENT_FALLBACK_QUOTA_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const TAB_RENDER_DELAY_MS = 8000;
const TAB_RENDER_TIMEOUT_MS = 25000;

applyTheme(localStorage.getItem('budget.theme') || 'light');
installModalPreloadFallbacks();

export function switchTab(tab) {
  if (!TABS.includes(tab)) return;
  if (!getCurrentUser() && tab !== 'settings') {
    showLogin();
    showToast('로그인 후 이용할 수 있어요.', 1800, 'warning');
    return;
  }
  const previousTab = _currentTab;
  if (tab === previousTab && _tabRenderTokens.has(tab)) {
    showTabLoadDelay(tab);
    return;
  }
  $$('.tab-content').forEach(el => {
    el.classList.toggle('hidden', el.dataset.tab !== tab);
  });
  $$('.bottom-nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.body.classList.toggle('urge-mode', tab === 'urge');
  _currentTab = tab;
  renderAppHeader(tab);
  renderTab(tab, { source: 'switchTab', previousTab });
}

export function getCurrentTab() { return _currentTab; }

export function refreshCurrentTab() {
  const tab = _currentTab;
  if (_tabRenderTokens.has(tab)) {
    _pendingTabRefreshes.add(tab);
    return;
  }
  renderTab(tab, { source: 'refresh' });
}

function renderTab(tab, context = {}) {
  const renderer = TAB_RENDERERS[tab];
  if (!renderer) return Promise.resolve();

  const token = ++_tabRenderSeq;
  _tabRenderTokens.set(tab, token);
  const delayTimer = window.setTimeout(() => {
    if (isActiveTabRender(tab, token)) showTabLoadDelay(tab);
  }, TAB_RENDER_DELAY_MS);
  let timeoutTimer = null;
  const renderPromise = Promise.resolve().then(() => renderer(context));
  const timeoutPromise = new Promise((_, reject) => {
    timeoutTimer = window.setTimeout(() => reject(tabRenderTimeoutError(tab)), TAB_RENDER_TIMEOUT_MS);
  });
  let renderFailed = false;

  return Promise.race([renderPromise, timeoutPromise])
    .catch(err => {
      renderFailed = true;
      console.error(`[render:${tab}]`, err);
      if (!isActiveTabRender(tab, token)) return;
      showTabLoadFailure(tab, err);
      showToast(`로드 실패: ${err.message || '화면을 불러오지 못했습니다.'}`, 3000, 'error');
    })
    .finally(() => {
      window.clearTimeout(delayTimer);
      window.clearTimeout(timeoutTimer);
      if (isActiveTabRender(tab, token)) {
        _tabRenderTokens.delete(tab);
        if (_pendingTabRefreshes.delete(tab) && !renderFailed && _currentTab === tab) {
          window.setTimeout(() => renderTab(tab, { source: 'refresh' }), 0);
        }
      }
    });
}

function tabRenderTimeoutError(tab) {
  const title = TAB_TITLES[tab] || '화면';
  const err = new Error(`${title} 데이터 로딩이 ${Math.round(TAB_RENDER_TIMEOUT_MS / 1000)}초를 넘겼습니다.`);
  err.code = 'TAB_RENDER_TIMEOUT';
  return err;
}

function isActiveTabRender(tab, token) {
  return _tabRenderTokens.get(tab) === token;
}

function showTabLoadDelay(tab) {
  const root = tabRoot(tab);
  if (!root) return;
  const html = tabLoadStateHtml({
    tab,
    title: `${TAB_TITLES[tab] || '화면'} 로딩 지연`,
    detail: '데이터 응답이 느립니다. 잠시 기다리거나 다시 시도하세요.',
  });
  if (!replaceLoadingState(root, html) && root.children.length === 0) {
    root.innerHTML = `<div class="empty-state" style="padding:48px 20px">${html}</div>`;
  }
}

function showTabLoadFailure(tab, err) {
  const root = tabRoot(tab);
  if (!root) return;
  root.innerHTML = `
    <div class="empty-state" style="padding:48px 20px">
      ${tabLoadStateHtml({
        tab,
        title: `${TAB_TITLES[tab] || '화면'} 로드 실패`,
        detail: err?.message || '데이터를 불러오지 못했습니다.',
      })}
    </div>
  `;
}

function tabRoot(tab) {
  return $(`#tab-${tab}`) || $(`.tab-content[data-tab="${tab}"]`);
}

function replaceLoadingState(root, html) {
  const spinner = root.querySelector('.loading-spinner, .spinner');
  const target = spinner?.closest('.empty-state') || spinner?.parentElement;
  if (!target || !root.contains(target)) return false;
  target.innerHTML = html;
  return true;
}

function tabLoadStateHtml({ tab, title, detail }) {
  return `
    <div class="icon">!</div>
    <div>${escHtml(title)}</div>
    <div class="st4">${escHtml(detail)}</div>
    <button type="button" class="tds-btn sm secondary" data-tab-retry="${escHtml(tab)}">다시 시도</button>
  `;
}

function bindNav() {
  if (_navBound) return;
  _navBound = true;
  $$('.bottom-nav button').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  $('#btn-settings')?.addEventListener('click', () => switchTab('settings'));
  $('#btn-search')?.addEventListener('click', () => showToast('검색은 다음 단계에서 연결할게요.', 1400, 'info'));
  document.addEventListener('click', (event) => {
    const retry = event.target?.closest?.('[data-tab-retry]');
    if (!retry) return;
    event.preventDefault();
    switchTab(retry.dataset.tabRetry);
  });
}

function bindLogin() {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#login-error');
    errEl.textContent = '';
    const fd = new FormData(e.currentTarget);
    try {
      await signIn(fd.get('email'), fd.get('password'));
      // onAuthChange가 boot 흐름 트리거
    } catch (err) {
      errEl.textContent = err.code === 'auth/invalid-credential' ? '이메일 또는 비밀번호가 일치하지 않습니다.' : (err.message || '로그인 실패');
    }
  });
}

async function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  bindNav();
  dropRetiredCartSharePayload();
  switchTab('home');
  preloadPostLoginWork();
}

function preloadPostLoginWork() {
  preloadModals();
  syncAppSettingsOnce().then(changed => {
    if (!changed) return;
    renderAppHeader(_currentTab);
    if (['home', 'report'].includes(_currentTab)) refreshCurrentTab();
  });
  runAutoParseOnce();
  armUrgeReminders();
}

let _modalLoadPromise = null;
function preloadModals() {
  if (!_modalLoadPromise) {
    _modalLoadPromise = loadAndInjectModals().catch(err => {
      console.warn('[modal-preload]', err);
      _modalLoadPromise = null;
    });
  }
  return _modalLoadPromise;
}

function installModalPreloadFallbacks() {
  ['openTxEditModal', 'openTxAddModal', 'openCategoryModal', 'openAccountModal'].forEach(name => {
    if (typeof window[name] === 'function') return;
    const fallback = (...args) => {
      preloadModals()?.then(() => {
        const loadedFn = window[name];
        if (typeof loadedFn === 'function' && loadedFn !== fallback) {
          loadedFn(...args);
        } else {
          showToast('화면을 준비 중입니다. 잠시 후 다시 시도하세요.', 1800, 'info');
        }
      });
    };
    window[name] = fallback;
  });
}

function showLogin() {
  $('#app').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
}

function dropRetiredCartSharePayload() {
  const params = new URLSearchParams(window.location.search);
  const hasSharePayload = params.get('shareTarget') === 'cart'
    || params.has('url')
    || params.has('title')
    || params.has('text');
  if (!hasSharePayload) return;
  ['shareTarget', 'url', 'title', 'text'].forEach(key => params.delete(key));
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
  showToast('선택 탭 공유 기능은 제거되어 홈으로 이동했어요.', 2200, 'info');
}

async function boot() {
  try {
    await initData();
    onAuthChange((user) => {
      if (user) showApp();
      else showLogin();
    });

    bindLogin();

    $('#loading-overlay').classList.add('hidden');

    if (getCurrentUser()) {
      await showApp();
    } else {
      showLogin();
    }
  } catch (err) {
    console.error('[boot] 실패:', err);
    $('#loading-overlay').innerHTML =
      `<div class="st2" style="color:var(--negative);text-align:center;max-width:300px">초기화 실패: ${err.message}<br><br>config.js의 Firebase 키를 확인하세요.</div>`;
  }
}

// HTML onclick 노출
window.switchTab = switchTab;
window.getCurrentTab = getCurrentTab;
window.refreshCurrentTab = refreshCurrentTab;
window.refreshAppHeader = () => renderAppHeader(_currentTab);
window.applyBudgetTheme = applyTheme;
window.startUrgeFlow = () => switchTab('urge');
window.openWineCellar = () => {
  window.openSensoryBank?.('wine');
  switchTab('mindbank');
};
window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.signOut = async () => { await signOut(); showToast('로그아웃됨', 1500); };

boot();

async function syncAppSettingsOnce() {
  try {
    const settings = await getAppSettings();
    let changed = false;
    if (settings?.theme) {
      changed ||= localStorage.getItem('budget.theme') !== settings.theme;
      localStorage.setItem('budget.theme', settings.theme);
      applyTheme(settings.theme);
    }
    if (settings?.biweeklyStartDate) {
      changed ||= localStorage.getItem(BIWEEKLY_START_KEY) !== settings.biweeklyStartDate;
      localStorage.setItem(BIWEEKLY_START_KEY, settings.biweeklyStartDate);
    } else {
      changed ||= !!localStorage.getItem(BIWEEKLY_START_KEY);
      localStorage.removeItem(BIWEEKLY_START_KEY);
    }
    localStorage.setItem(CLIENT_FALLBACK_PARSE_KEY, settings?.browserFallbackParse ? '1' : '0');
    return changed;
  } catch (err) {
    console.warn('[app-settings]', err);
    return false;
  }
}

function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle('light', resolved === 'light');
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.body?.classList.toggle('theme-light', resolved === 'light');
  document.body?.classList.toggle('theme-dark', resolved === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f5f6fa' : '#0a0a0a');
}

function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

function renderAppHeader(tab) {
  const titleEl = $('#header-title');
  const contextEl = $('#header-context');
  if (titleEl) titleEl.textContent = TAB_TITLES[tab] || '가계부';
  if (!contextEl) return;
  const ctx = headerContext(tab);
  contextEl.className = `ctx-action ${ctx.kind || ''}`.trim();
  contextEl.innerHTML = `<span class="dot"></span><span>${ctx.label}</span>`;
}

function headerContext(tab) {
  const now = new Date();
  const ym = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  if (tab === 'home') return { label: `격주 ${homeCycleRangeLabel(now)}` };
  if (tab === 'finance') return { label: '2030년까지' };
  if (tab === 'tx') return { label: ym };
  if (tab === 'mindbank') return { label: '감각 적립', kind: 'good' };
  if (tab === 'review') return { label: '자동 분류 확인', kind: 'review' };
  if (tab === 'settle') return { label: '받을 돈·줄 돈', kind: 'good' };
  if (tab === 'report') return { label: ym, kind: 'good' };
  if (tab === 'settings') return { label: '앱 설정' };
  return { label: '오늘' };
}

function homeCycleRangeLabel(now = new Date()) {
  const anchor = normalizeCycleAnchorDate(localStorage.getItem(BIWEEKLY_START_KEY));
  return cycleDateRangeText(cycleRangeForDate(now, anchor));
}

async function runAutoParseOnce() {
  if (_autoParseStarted) return;

  _autoParseStarted = true;
  try {
    const serverResult = await syncLatestFromServer();
    const fallbackResult = await maybeRunClientFallbackParse();
    const created = countServerSyncChanges(serverResult) + (fallbackResult?.txCreated || 0);
    const touched = countServerSyncTouches(serverResult)
      + (fallbackResult ? (fallbackResult.txCreated + fallbackResult.skipped + fallbackResult.failed) : 0);
    if (touched > 0) {
      showToast(`자동 동기화: ${created}건 반영`, 1800, created > 0 ? 'success' : 'info');
      refreshCurrentTab();
    }
  } catch (err) {
    if (err.code === 'API_UNAVAILABLE') {
      return;
    }
    if (err.code === 'API_TEMPORARY') {
      console.info(`[auto-parse] skipped: server sync temporary unavailable (${err.status || 'unknown'})`);
      return;
    }
    if (err.code === 'AI_QUOTA_EXCEEDED') {
      setClientFallbackCooldown(CLIENT_FALLBACK_QUOTA_COOLDOWN_MS);
      console.info('[auto-parse] Gemini quota exceeded; browser fallback is paused.');
      showToast('Gemini 한도 초과로 보조 파싱을 잠시 멈췄어요.', 2600, 'warning');
      return;
    }
    console.warn('[auto-parse]', err);
    showToast(`자동 파싱 실패: ${err.message}`, 3000, 'error');
  }
}

async function maybeRunClientFallbackParse() {
  if (localStorage.getItem(CLIENT_FALLBACK_PARSE_KEY) !== '1') {
    console.info('[auto-parse] browser fallback skipped: disabled');
    return null;
  }
  const now = Date.now();
  const cooldownUntil = Number(localStorage.getItem(CLIENT_FALLBACK_COOLDOWN_KEY) || 0);
  if (cooldownUntil && cooldownUntil > now) {
    console.info('[auto-parse] browser fallback skipped: cooldown');
    return null;
  }
  const lastRunAt = Number(localStorage.getItem(CLIENT_FALLBACK_INTERVAL_KEY) || 0);
  if (lastRunAt && now - lastRunAt < CLIENT_FALLBACK_INTERVAL_MS) {
    console.info('[auto-parse] browser fallback skipped: interval');
    return null;
  }
  localStorage.setItem(CLIENT_FALLBACK_INTERVAL_KEY, String(now));
  try {
    return await processPendingRawMessages({ max: 5 });
  } catch (err) {
    if (err.code === 'API_UNAVAILABLE') {
      return null;
    }
    if (err.code === 'AI_QUOTA_EXCEEDED') setClientFallbackCooldown(CLIENT_FALLBACK_QUOTA_COOLDOWN_MS);
    throw err;
  }
}

function setClientFallbackCooldown(ms) {
  localStorage.setItem(CLIENT_FALLBACK_COOLDOWN_KEY, String(Date.now() + ms));
}

async function syncLatestFromServer() {
  if (!hasServerApi()) {
    const err = new Error('static host has no /api routes');
    err.code = 'API_UNAVAILABLE';
    throw err;
  }
  const user = getCurrentUser();
  if (!user?.getIdToken) return null;
  const token = await user.getIdToken();
  const res = await fetch('/api/sync-latest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ since: kstDateText(new Date()), max: 40 }),
  });
  const data = await readJsonResponse(res);
  if (!res.ok || data.error) {
    const err = new Error(data.error || `동기화 실패 (${res.status})`);
    err.status = res.status;
    if (res.status >= 500) err.code = 'API_TEMPORARY';
    throw err;
  }
  console.info('[sync-latest]', data);
  return data;
}

async function readJsonResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error(`API 응답이 JSON이 아닙니다 (${res.status})`);
    err.status = res.status;
    err.code = res.status >= 500 ? 'API_TEMPORARY' : 'API_BAD_RESPONSE';
    throw err;
  }
}

function countServerSyncChanges(result) {
  if (!result) return 0;
  const rawCreated = Math.max(0, Number(result.raw?.parsed || 0) - Number(result.raw?.duplicateTx || 0));
  return Number(result.gmail?.created || 0) + rawCreated;
}

function countServerSyncTouches(result) {
  if (!result) return 0;
  return Number(result.gmail?.created || 0)
    + Number(result.gmail?.enriched || 0)
    + Number(result.gmail?.updated || 0)
    + Number(result.raw?.parsed || 0)
    + Number(result.raw?.skipped || 0)
    + Number(result.raw?.failed || 0);
}

function kstDateText(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

async function armUrgeReminders() {
  if (!('Notification' in window)) return;
  try {
    const urges = await listUrges({ status: 'scheduled', max: 50 });
    for (const urge of urges) {
      if (!urge.reminderAt || _urgeReminderTimers.has(urge.id)) continue;
      const when = new Date(urge.reminderAt);
      const delay = when.getTime() - Date.now();
      if (Number.isNaN(when.getTime()) || delay > 2147483647) continue;
      const notify = () => {
        showToast(`${urge.what || '예약한 끌림'}을 다시 볼 시간이에요.`, 5000, 'info');
        if (Notification.permission === 'granted') {
          new Notification('끌림 예약 시간이 왔어요', {
            body: `${urge.what || '예약한 끌림'}을 지금도 원하는지 확인해볼까요?`,
          });
        }
        _urgeReminderTimers.delete(urge.id);
      };
      if (delay <= 0) {
        notify();
      } else {
        _urgeReminderTimers.set(urge.id, window.setTimeout(notify, delay));
      }
    }
  } catch (err) {
    if (!SILENT_FIREBASE_CODES.has(err.code)) console.warn('[urge-reminders]', err);
  }
}
