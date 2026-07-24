// ================================================================
// 설정 drill-in 모달 open/close 제어.
// render-settings.js 는 마크업만 만들고, 동작 배선은 이 피처 모듈이 소유한다.
// 저장 시 renderSettings() 가 설정 화면을 통째로 다시 그려도, 열려 있던 모달을
// 다시 열어 편집 흐름이 끊기지 않게 한다.
// ================================================================

let openSettingsModalId = null;
let escBound = false;

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
  // 재렌더 후 열려 있던 모달을 다시 연다.
  if (openSettingsModalId) {
    const el = document.getElementById(openSettingsModalId);
    if (el) el.classList.add('open');
    else openSettingsModalId = null;
  }
}

function openSettingsDrill(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  openSettingsModalId = id;
}

function closeSettingsDrill() {
  if (openSettingsModalId) {
    document.getElementById(openSettingsModalId)?.classList.remove('open');
  }
  openSettingsModalId = null;
}
