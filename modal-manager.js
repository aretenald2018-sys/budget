// ================================================================
// modal-manager.js — 모달 동적 로드/주입 (토마토팜 패턴 차용)
// 새 모달 추가 시 MODALS 배열에 등록.
// 닫기 계약(전 모달 공통): backdrop 클릭 / ESC / [data-modal-dismiss] 버튼.
// modal-manager 밖에서 자체 상태로 여닫는 시트는 루트에 [data-modal-layer]와
// 닫기 버튼에 [data-modal-close]를 달면 ESC·스크롤락 계약에 편입된다.
// ================================================================

const MODALS = [
  { id: 'tx-edit-modal',  path: './modals/tx-edit-modal.js',  export: 'MODAL_HTML' },
  { id: 'category-modal', path: './modals/category-modal.js', export: 'MODAL_HTML' },
  { id: 'account-modal',  path: './modals/account-modal.js',  export: 'MODAL_HTML' },
];

let _modalsLoaded = false;
const _openStack = []; // { id, opener } — opener는 닫힐 때 포커스 복원 대상

export async function loadAndInjectModals() {
  if (_modalsLoaded) return;
  const container = document.getElementById('modals-container');
  if (!container) return;

  if (MODALS.length === 0) {
    _modalsLoaded = true;
    return;
  }

  const results = await Promise.allSettled(
    MODALS.map(cfg => import(cfg.path).then(m => ({ cfg, html: m[cfg.export] || '' })))
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

function injectModalHtml(container, cfg, html) {
  if (document.getElementById(cfg.id)) return;
  container.insertAdjacentHTML('beforeend', html);
}

// 스크롤락은 카운터가 아니라 살아있는 DOM 상태의 순수 함수 —
// 재렌더/탭 전환으로 시트가 사라져도 락이 남는 desync가 생기지 않는다.
export function syncBodyScrollLock() {
  const anyOpen = !!document.querySelector(
    '.tds-modal-overlay.open, [data-modal-layer].open, [data-modal-layer="always"]'
  );
  document.body.classList.toggle('modal-open', anyOpen);
}

export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.getAttribute('role')) el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.classList.add('open');
  if (!_openStack.some(entry => entry.id === id)) {
    _openStack.push({ id, opener: document.activeElement });
  }
  const sheet = el.querySelector('.tds-modal-sheet') || el;
  if (!sheet.hasAttribute('tabindex')) sheet.setAttribute('tabindex', '-1');
  sheet.focus({ preventScroll: true });
  syncBodyScrollLock();
}

export function closeModal(id) {
  const target = id || _openStack[_openStack.length - 1]?.id;
  if (!target) return;
  const el = document.getElementById(target);
  if (el) el.classList.remove('open');
  const idx = _openStack.findIndex(entry => entry.id === target);
  const [entry] = idx >= 0 ? _openStack.splice(idx, 1) : [];
  syncBodyScrollLock();
  const opener = entry?.opener;
  if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
    opener.focus({ preventScroll: true });
  }
}

document.addEventListener('click', event => {
  const dismissTarget = event.target?.closest?.('[data-modal-dismiss]');
  if (dismissTarget) {
    const modalId = dismissTarget.dataset.modalDismiss
      || dismissTarget.closest('.tds-modal-overlay')?.id;
    if (modalId) closeModal(modalId);
    return;
  }
  if (event.target?.classList?.contains('tds-modal-overlay') && event.target.id) {
    closeModal(event.target.id);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (_openStack.length > 0) {
    closeModal();
    return;
  }
  // modal-manager 밖 레이어(finance 시트, 와인 화면 등): DOM상 마지막 열린
  // 레이어의 자체 닫기 버튼을 눌러 각 기능의 상태 정리 로직을 그대로 태운다.
  const layers = [...document.querySelectorAll('[data-modal-layer]')].filter(el =>
    el.classList.contains('open') || el.dataset.modalLayer === 'always');
  layers[layers.length - 1]?.querySelector('[data-modal-close]')?.click();
});

window.openModal = openModal;
window.closeModal = closeModal;
window.syncBudgetModalLock = syncBodyScrollLock;
