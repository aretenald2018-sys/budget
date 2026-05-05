// ================================================================
// utils/toast.js — TDS Toast
// 사용: showToast('저장됨', 2000, 'success')
// ================================================================

export function showToast(msg, duration = 2400, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `tds-toast ${type}`;
  el.textContent = msg;
  el.style.opacity = '0';
  container.appendChild(el);

  requestAnimationFrame(() => { el.style.opacity = '1'; });

  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, duration);
}
