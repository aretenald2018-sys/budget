// ================================================================
// 설정 drill-in 모달 open/close 제어.
// render-settings.js 는 마크업만 만들고, 동작 배선은 이 피처 모듈이 소유한다.
// - 10개 설정 화면(SETTINGS_SCREENS)은 열기 직전에 lazy render + bind.
// - 명시 저장 화면(01·03)은 overlay dataset.dirty 로 미저장 이탈 가드.
// - 저장 시 renderSettings() 가 설정 화면을 통째로 다시 그려도, 열려 있던 모달을
//   다시 열어 편집 흐름이 끊기지 않게 한다.
// ================================================================

import { SETTINGS_SCREENS } from './screens/index.js';

let openSettingsModalId = null;
let escBound = false;
let onAfterClose = null; // 허브 요약 갱신용 콜백 (controller가 주입)

export function setSettingsModalCallbacks(callbacks = {}) {
  onAfterClose = callbacks.onAfterClose || onAfterClose;
}

export function bindSettingsModalControls() {
  document.querySelectorAll('[data-open-settings-modal]').forEach(btn => {
    btn.addEventListener('click', () => openSettingsDrill(btn.dataset.openSettingsModal));
  });
  document.querySelectorAll('[data-close-settings-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeSettingsDrill());
  });
  document.querySelectorAll('.settings-drill-overlay').forEach(overlay => {
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeSettingsDrill();
    });
  });
  if (!escBound) {
    escBound = true;
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && openSettingsModalId) closeSettingsDrill();
    });
  }
  // 재렌더 후 열려 있던 모달을 다시 연다 (lazy 화면은 다시 그린다).
  if (openSettingsModalId) {
    const el = document.getElementById(openSettingsModalId);
    if (el) {
      const screen = SETTINGS_SCREENS[openSettingsModalId];
      if (screen) void renderScreenInto(el, screen);
      el.classList.add('open');
    } else {
      openSettingsModalId = null;
    }
  }
}

async function renderScreenInto(el, screen) {
  const body = el.querySelector('[data-screen-body]');
  if (!body) return;
  body.innerHTML = '<div class="empty-state"><div class="loading-spinner"></div></div>';
  const ctx = {
    refresh: () => renderScreenInto(el, screen),
    close: () => closeSettingsDrill({ skipGuard: true }),
  };
  try {
    body.innerHTML = await screen.render(ctx);
    screen.bind?.(body, ctx);
  } catch (err) {
    console.warn('[settings] screen render failed', screen.id, err);
    body.innerHTML = `
      <div class="settings-screen-empty">
        화면을 불러오지 못했어요.
        <button type="button" class="tds-text-btn" data-screen-retry>다시 시도</button>
      </div>
    `;
    body.querySelector('[data-screen-retry]')?.addEventListener('click', () => ctx.refresh());
  }
}

function openSettingsDrill(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const screen = SETTINGS_SCREENS[id];
  if (screen) void renderScreenInto(el, screen);
  el.classList.add('open');
  openSettingsModalId = id;
}

function closeSettingsDrill(opts = {}) {
  if (!openSettingsModalId) return;
  const el = document.getElementById(openSettingsModalId);
  // 명시 저장 화면의 미저장 이탈 가드
  if (!opts.skipGuard && el?.dataset.dirty === 'true') {
    if (!window.confirm('저장하지 않은 변경이 있어요. 나가면 변경이 사라집니다. 나갈까요?')) return;
  }
  if (el) {
    delete el.dataset.dirty;
    el.classList.remove('open');
  }
  openSettingsModalId = null;
  // 허브 행 요약(예: "규칙 N개")을 최신으로.
  onAfterClose?.();
}
