import { currentUser } from '../data/core/firebase.js';
import { externalApiUrl } from './api-base.js';

const PENDING_KEY = 'budget.daybirdRefreshPending';
let inFlight = null;

function remember(reason) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ reason, requestedAt: Date.now() }));
  } catch {
    // Storage may be unavailable in private mode; the next app resume still retries.
  }
}

function forget() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
}

function pendingReason(fallback = 'budget-resume') {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    return String(parsed?.reason || fallback);
  } catch {
    return fallback;
  }
}

export function queueDaybirdRefresh(reason = 'budget-change') {
  remember(reason);
  return flushDaybirdRefresh(reason).catch(() => false);
}

export async function flushDaybirdRefresh(reason = pendingReason()) {
  if (inFlight) return inFlight;
  const endpoint = externalApiUrl('/api/daybird?action=refresh');
  if (!endpoint || !currentUser) return false;
  inFlight = (async () => {
    const token = await currentUser.getIdToken();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) throw new Error(`DayBird refresh failed: ${response.status}`);
    forget();
    return true;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function hasPendingDaybirdRefresh() {
  try { return !!localStorage.getItem(PENDING_KEY); } catch { return false; }
}
