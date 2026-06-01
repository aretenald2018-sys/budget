// ================================================================
// app.js — 가계부 오케스트레이터
// ================================================================

import { initData, signIn, signOut, getCurrentUser, onAuthChange, listUrges, listPacts, getAppSettings } from './data.js';
import { loadAndInjectModals, openModal, closeModal } from './modal-manager.js?v=20260505-v2-gap';
import { showToast } from './utils/toast.js?v=20260503-sync-latest';
import { $, $$, escHtml } from './utils/dom.js?v=20260503-sync-latest';
import { hasServerApi } from './utils/runtime.js?v=20260505-github-pages';
import { cycleDateRangeText, cycleRangeForDate, normalizeCycleAnchorDate } from './utils/cycles.js?v=20260601-biweekly-start';
import { processPendingRawMessages } from './client-parse.js?v=20260531-naverpay-complete';

import { renderHome } from './render-home.js?v=20260601-transport-subcategory';
import { renderTx } from './render-tx.js?v=20260601-loading-watchdog';
import { renderFinance } from './render-finance.js?v=20260507-kr-etf-symbol-fix';
import { renderSettings } from './render-settings.js?v=20260506-apk-settings';
import { renderCart } from './render-cart.js?v=20260531-refactor';
import { renderUrgeInput } from './urge/render-urge-input.js?v=20260505-github-pages';
import { renderMindbank } from './urge/render-mindbank.js?v=20260506-choice-wine-cellar';
import { renderReview } from './render-review.js?v=20260526-naverpay-review';
import { renderSettle } from './render-settle.js?v=20260505-v2-gap';
import { renderReport } from './render-report.js?v=20260601-transport-subcategory';

const TABS = ['home', 'finance', 'tx', 'cart', 'mindbank', 'urge', 'settings', 'review', 'settle', 'report'];
const SILENT_FIREBASE_CODES = new Set(['failed-precondition']);
const TAB_RENDERERS = {
  home: renderHome,
  finance: renderFinance,
  tx: renderTx,
  cart: renderCart,
  mindbank: renderMindbank,
  urge: renderUrgeInput,
  settings: renderSettings,
  review: renderReview,
  settle: renderSettle,
  report: () => renderReport({ rootSelector: '#tab-report', homeMode: false }),
};
const TAB_TITLES = {
  home: '홈', finance: '목표', tx: '거래 내역', cart: '선택', mindbank: '감각뱅크', urge: '끌림 들여다보기', settings: '설정',
  review: '검토 대기', settle: '정산', report: '월간 리포트',
};
let _currentTab = 'home';
let _navBound = false;
let _autoParseStarted = false;
let _tabRenderSeq = 0;
const _tabRenderTokens = new Map();
const _urgeReminderTimers = new Map();
const _pactReminderTimers = new Map();
const CLIENT_FALLBACK_PARSE_KEY = 'budget.clientFallbackParseEnabled';
const CLIENT_FALLBACK_COOLDOWN_KEY = 'budget.clientFallbackParseCooldownUntil';
const CLIENT_FALLBACK_INTERVAL_KEY = 'budget.clientFallbackParseLastRunAt';
const BIWEEKLY_START_KEY = 'budget.biweeklyStartDate';
const CLIENT_FALLBACK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CLIENT_FALLBACK_QUOTA_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const TAB_RENDER_DELAY_MS = 8000;

applyTheme(localStorage.getItem('budget.theme') || 'light');

export function switchTab(tab) {
  if (!TABS.includes(tab)) return;
  if (!getCurrentUser() && tab !== 'settings') {
    showLogin();
    showToast('로그인 후 이용할 수 있어요.', 1800, 'warning');
    return;
  }
  const previousTab = _currentTab;
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
  renderTab(_currentTab, { source: 'refresh' });
}

function renderTab(tab, context = {}) {
  const renderer = TAB_RENDERERS[tab];
  if (!renderer) return Promise.resolve();

  const token = ++_tabRenderSeq;
  _tabRenderTokens.set(tab, token);
  const delayTimer = window.setInterval(() => {
    if (isActiveTabRender(tab, token)) showTabLoadDelay(tab);
  }, TAB_RENDER_DELAY_MS);

  return Promise.resolve()
    .then(() => renderer(context))
    .catch(err => {
      console.error(`[render:${tab}]`, err);
      if (!isActiveTabRender(tab, token)) return;
      showTabLoadFailure(tab, err);
      showToast(`로드 실패: ${err.message || '화면을 불러오지 못했습니다.'}`, 3000, 'error');
    })
    .finally(() => {
      window.clearInterval(delayTimer);
      if (isActiveTabRender(tab, token)) _tabRenderTokens.delete(tab);
    });
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
  await syncAppSettingsOnce();
  await loadAndInjectModals();
  bindNav();
  switchTab(hasCartSharePayload() ? 'cart' : 'home');
  runAutoParseOnce();
  armUrgeReminders();
  armPactReminders();
}

function showLogin() {
  $('#app').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
}

function hasCartSharePayload() {
  const params = new URLSearchParams(window.location.search);
  return params.get('shareTarget') === 'cart'
    || !!params.get('url')
    || !!params.get('title')
    || !!params.get('text');
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
  localStorage.setItem('budget.planSegment', 'wine');
  switchTab('cart');
};
window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.signOut = async () => { await signOut(); showToast('로그아웃됨', 1500); };

boot();

async function syncAppSettingsOnce() {
  try {
    const settings = await getAppSettings();
    if (settings?.theme) {
      localStorage.setItem('budget.theme', settings.theme);
      applyTheme(settings.theme);
    }
    if (settings?.planSegment) localStorage.setItem('budget.planSegment', settings.planSegment);
    if (settings?.biweeklyStartDate) localStorage.setItem(BIWEEKLY_START_KEY, settings.biweeklyStartDate);
    else localStorage.removeItem(BIWEEKLY_START_KEY);
    localStorage.setItem(CLIENT_FALLBACK_PARSE_KEY, settings?.browserFallbackParse ? '1' : '0');
  } catch (err) {
    console.warn('[app-settings]', err);
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
  if (tab === 'cart') return { label: '후보·약속·적립', kind: 'cart' };
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

async function armPactReminders() {
  try {
    const pacts = await listPacts({ max: 80 });
    for (const pact of pacts) {
      if (_pactReminderTimers.has(pact.id) || ['fulfilled', 'broken', 'archived'].includes(pact.status)) continue;
      const delay = pactReadyDelay(pact);
      if (delay == null || delay > 2147483647) continue;
      const notify = () => {
        localStorage.setItem('budget.planSegment', 'do');
        showToast(`${pact.what?.title || '약속'}을 실현할 수 있어요. 선택 탭에서 확인하세요.`, 5200, 'info');
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('약속한 그 날이에요', {
            body: `${pact.what?.title || '약속'}을 지금 실현할지 결정해볼까요?`,
          });
        }
        _pactReminderTimers.delete(pact.id);
      };
      if (delay <= 0) notify();
      else _pactReminderTimers.set(pact.id, window.setTimeout(notify, delay));
    }
  } catch (err) {
    if (!SILENT_FIREBASE_CODES.has(err.code)) console.warn('[pact-reminders]', err);
  }
}

function pactReadyDelay(pact) {
  const trigger = pact?.trigger || {};
  const cfg = trigger.config || {};
  if (trigger.type === 'time') {
    const due = cfg.date ? new Date(`${cfg.date}T09:00:00`) : null;
    if (!due || Number.isNaN(due.getTime())) return null;
    return due.getTime() - Date.now();
  }
  if (trigger.type === 'savings') return Number(cfg.currentAmount || 0) >= Number(cfg.targetAmount || 0) && Number(cfg.targetAmount || 0) > 0 ? 0 : null;
  if (trigger.type === 'streak') return Number(cfg.currentCount || 0) >= Number(cfg.count || 0) && Number(cfg.count || 0) > 0 ? 0 : null;
  if (trigger.type === 'measure') {
    const current = Number(cfg.currentValue) || 0;
    const target = Number(cfg.value) || 0;
    if (!target) return null;
    return cfg.op === '<=' ? (current <= target ? 0 : null) : (current >= target ? 0 : null);
  }
  if (trigger.type === 'event') return cfg.done ? 0 : null;
  if (trigger.type === 'manual') return 0;
  return Number(trigger.progress || 0) >= 1 ? 0 : null;
}
