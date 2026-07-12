// ================================================================
// modal-manager.js — 모달 동적 로드/주입 (토마토팜 패턴 차용)
// 새 모달 추가 시 MODALS 배열에 등록.
// ================================================================

const MODALS = [
  { id: 'tx-edit-modal',  path: './modals/tx-edit-modal.js',  export: 'MODAL_HTML' },
  { id: 'category-modal', path: './modals/category-modal.js', export: 'MODAL_HTML' },
  { id: 'account-modal',  path: './modals/account-modal.js',  export: 'MODAL_HTML' },
];

const MODAL_CACHE_VERSION = '20260712-feature-modules';
const DATA_MODULE_CACHE_VERSION = '20260712-domain-rules';
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

  const results = await Promise.allSettled(
    MODALS.map(cfg => import(withCacheVersion(cfg.path)).then(m => ({ cfg, html: m[cfg.export] || '' })))
  );

  let loaded = 0;
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value?.html) {
      console.warn('[modal-manager] modal load failed', result.reason || result.value?.cfg?.id);
      continue;
    }
    injectModalHtml(container, result.value.cfg, result.value.html);
    loaded += 1;
  }
  _modalsLoaded = true;
  console.log(`[modal-manager] ${loaded}/${MODALS.length} 모달 로드`);
}

function withCacheVersion(path) {
  const glue = path.includes('?') ? '&' : '?';
  return `${path}${glue}v=${MODAL_CACHE_VERSION}&data=${DATA_MODULE_CACHE_VERSION}`;
}

function injectModalHtml(container, cfg, html) {
  if (document.getElementById(cfg.id)) return;
  container.insertAdjacentHTML('beforeend', html);
}

export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('open');
  if (!_openStack.includes(id)) _openStack.push(id);
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
