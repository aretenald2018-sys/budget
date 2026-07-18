import { currentUser } from '../data/core/firebase.js';
import { externalApiUrl } from './api-base.js';
import { createTrailingRefreshDrain } from './trailing-refresh.js';

const PENDING_KEY = 'budget.daybirdRefreshPending';
let markerSequence = 0;
let memoryPending = null;

function normalizeMarker(value) {
  if (!value || typeof value !== 'object') return null;
  const reason = String(value.reason || 'budget-resume');
  const requestedAt = Number(value.requestedAt) || 0;
  const id = String(value.id || `legacy:${requestedAt}:${reason}`);
  return { id, reason, requestedAt };
}

function remember(reason) {
  const marker = {
    id: `${Date.now().toString(36)}-${(++markerSequence).toString(36)}`,
    reason: String(reason || 'budget-change'),
    requestedAt: Date.now(),
  };
  memoryPending = marker;
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(marker));
  } catch {
    // Keep the marker in memory when private mode blocks storage.
  }
  return marker;
}

function pendingMarker() {
  if (memoryPending) return memoryPending;
  try { return normalizeMarker(JSON.parse(localStorage.getItem(PENDING_KEY) || 'null')); }
  catch { return null; }
}

function pendingReason(fallback = 'budget-resume') {
  return String(pendingMarker()?.reason || fallback);
}

function clearPendingIfCurrent(markerId) {
  const current = pendingMarker();
  if (!current || current.id !== markerId) return false;
  if (memoryPending?.id === markerId) memoryPending = null;
  try {
    const stored = normalizeMarker(JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'));
    if (!stored || stored.id === markerId) localStorage.removeItem(PENDING_KEY);
  } catch { /* memory marker was still cleared */ }
  return true;
}

const refreshDrain = createTrailingRefreshDrain({
  readPending: pendingMarker,
  clearPendingIfCurrent,
  send: async reason => {
    const endpoint = externalApiUrl('/api/daybird?action=refresh');
    if (!endpoint || !currentUser) return false;
    const token = await currentUser.getIdToken();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) throw new Error(`DayBird refresh failed: ${response.status}`);
    return true;
  },
});

export function queueDaybirdRefresh(reason = 'budget-change') {
  remember(reason);
  return flushDaybirdRefresh(reason).catch(() => false);
}

export async function flushDaybirdRefresh(reason = pendingReason()) {
  return refreshDrain.flush(reason);
}

export function hasPendingDaybirdRefresh() {
  return pendingMarker() !== null;
}
