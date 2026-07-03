// ================================================================
// modal-manager.js — 모달 동적 로드/주입 (토마토팜 패턴 차용)
// 새 모달 추가 시 MODALS 배열에 등록.
// ================================================================

const MODALS = [
  { id: 'tx-edit-modal',  path: './modals/tx-edit-modal.js',  export: 'MODAL_HTML' },
  { id: 'category-modal', path: './modals/category-modal.js', export: 'MODAL_HTML' },
  { id: 'account-modal',  path: './modals/account-modal.js',  export: 'MODAL_HTML' },
];

let _modalsLoaded = false;
const _openStack = [];

export async function loadAndInjectModals() {
  if (_modalsLoaded) return;
  const container = document.getElementById('modals-container');
  if (!container) return;

  if (MODALS.length === 0) {
    _modalsLoaded = true;
    return;
  }

  const cacheKey = '?v=20260703-data-auth-singleton';
  const results = await Promise.allSettled(
    MODALS.map(cfg => import(cfg.path + cacheKey).then(m => m[cfg.export] || ''))
  );
  const htmlParts = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  container.innerHTML = htmlParts.join('\n');
  _modalsLoaded = true;
  console.log(`[modal-manager] ${htmlParts.length}/${MODALS.length} 모달 로드`);
}

export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  _openStack.push(id);
}

export function closeModal(id) {
  const target = id || _openStack[_openStack.length - 1];
  if (!target) return;
  const el = document.getElementById(target);
  if (el) el.classList.remove('open');
  const idx = _openStack.indexOf(target);
  if (idx >= 0) _openStack.splice(idx, 1);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _openStack.length > 0) closeModal();
});

window.openModal = openModal;
window.closeModal = closeModal;
