import { getCurrentUser } from '../../data.js';
import { externalApiUrl } from '../../utils/api-base.js';
import { escHtml } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

async function api(path, options = {}) {
  const user = getCurrentUser();
  const endpoint = externalApiUrl(`/api/daybird/${path}`);
  if (!user || !endpoint) throw new Error('DayBird 연결 API를 사용할 수 없습니다.');
  const token = await user.getIdToken();
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `요청 실패 (${response.status})`);
  return payload;
}

export async function loadDaybirdSettingsState() {
  if (!getCurrentUser()) return { available: false, devices: [], connected: false };
  try {
    return { available: true, ...(await api('status')) };
  } catch (error) {
    return { available: false, devices: [], connected: false, error: error.message };
  }
}

function timeText(epochMs) {
  if (!epochMs) return '아직 동기화 전';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(Number(epochMs)));
}

function deviceRows(devices = []) {
  const active = devices.filter(device => device.active);
  if (!active.length) return '<p class="daybird-device-empty">연결된 DayBird 기기가 없습니다.</p>';
  return active.map(device => `
    <div class="daybird-device-row">
      <span><b>✓</b><span><strong>${escHtml(device.deviceName || 'DayBird Android')}</strong><small>${escHtml(timeText(device.updatedAtEpochMs || device.pairedAtEpochMs))}</small></span></span>
      <button type="button" data-daybird-disconnect="${escHtml(device.authUid)}">해제</button>
    </div>`).join('');
}

export function daybirdSettingsPanel(state = {}) {
  const syncText = state.dashboard
    ? `리비전 ${state.dashboard.revision || '-'} · ${timeText(state.dashboard.generatedAtEpochMs)}`
    : '연결 후 첫 스냅샷을 생성합니다.';
  return `
    <div class="settings-section daybird-settings-section">
      <div class="h">DayBird 대시보드</div>
      <div class="daybird-settings-card">
        <div class="daybird-settings-hero">
          <span class="daybird-mark">DB</span>
          <span><strong>${state.connected ? 'DayBird 연결됨' : 'DayBird와 연결'}</strong><small>${escHtml(syncText)}</small></span>
          <i class="${state.connected ? 'is-connected' : ''}"></i>
        </div>
        <p>식단·운동·러닝·소비·와인 요약만 안전하게 전달하며 원본 거래와 기록은 공유하지 않습니다.</p>
        ${state.available ? deviceRows(state.devices) : `<p class="daybird-api-error">${escHtml(state.error || '연결 상태를 불러오지 못했습니다.')}</p>`}
        <div class="daybird-settings-actions">
          <button type="button" data-daybird-connect>${state.connected ? '새 기기 연결' : 'DayBird 연결'}</button>
          <button type="button" data-daybird-refresh ${state.connected ? '' : 'disabled'}>지금 새로고침</button>
        </div>
        <div class="daybird-pairing-fallback" hidden data-daybird-pairing-fallback>
          <strong>DayBird가 자동으로 열리지 않나요?</strong>
          <button type="button" data-daybird-open-link>다시 열기</button>
        </div>
      </div>
    </div>`;
}

export function bindDaybirdSettingsPanel(root, { rerender } = {}) {
  if (!root) return;
  let pairingDeepLink = '';
  const connect = root.querySelector('[data-daybird-connect]');
  connect?.addEventListener('click', async () => {
    connect.disabled = true;
    try {
      const payload = await api('pairings', { method: 'POST', body: '{}' });
      pairingDeepLink = payload.pairing?.deepLink || '';
      if (!pairingDeepLink) throw new Error('연결 링크를 만들지 못했습니다.');
      const fallback = root.querySelector('[data-daybird-pairing-fallback]');
      if (fallback) fallback.hidden = false;
      window.location.assign(pairingDeepLink);
      setTimeout(() => { connect.disabled = false; }, 1400);
    } catch (error) {
      showToast(error.message || 'DayBird 연결을 시작하지 못했어요.', 2400, 'warning');
      connect.disabled = false;
    }
  });
  root.querySelector('[data-daybird-open-link]')?.addEventListener('click', () => {
    if (pairingDeepLink) window.location.assign(pairingDeepLink);
  });
  root.querySelector('[data-daybird-refresh]')?.addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    try {
      await api('refresh', { method: 'POST', body: '{}' });
      showToast('DayBird 대시보드 갱신을 요청했어요.', 1800, 'success');
      await rerender?.();
    } catch (error) {
      showToast(error.message || '새로고침에 실패했어요.', 2200, 'warning');
      event.currentTarget.disabled = false;
    }
  });
  root.querySelectorAll('[data-daybird-disconnect]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!window.confirm('이 DayBird 기기의 연결을 해제할까요?')) return;
      button.disabled = true;
      try {
        await api('disconnect', {
          method: 'POST',
          body: JSON.stringify({ authUid: button.dataset.daybirdDisconnect }),
        });
        showToast('DayBird 연결을 해제했어요.', 1800, 'info');
        await rerender?.();
      } catch (error) {
        showToast(error.message || '연결 해제에 실패했어요.', 2200, 'warning');
        button.disabled = false;
      }
    });
  });
}
