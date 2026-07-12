import {
  getCurrentUser,
  saveTransaction,
  findSimilarTransaction,
  updateTransaction,
} from '../../data.js';
import { showToast } from '../../utils/toast.js';
import { hasServerApi } from '../../utils/runtime.js';
import { buildNaverPayDuplicateMergePatch } from '../../utils/naverpay.js';
import {
  androidCaptureValidationError,
  transactionFromAndroidCapture,
  parseAndroidCaptureBridgeJsonArray,
} from '../../utils/android-capture.js';
import { flushAndroidCaptureQueue } from '../../utils/android-flush.js';

const ANDROID_CAPTURE_FLUSH_INTERVAL_MS = 30 * 1000;
let autoSyncStarted = false;
let androidCaptureFlushTimer = null;
let androidCaptureFlushInFlight = false;
let smsPermissionRequested = false;
const callbacks = {
  refreshCurrentTab: () => {},
  getCurrentTab: () => 'home',
};

export function configureBackgroundSync(next = {}) {
  if (typeof next.refreshCurrentTab === 'function') callbacks.refreshCurrentTab = next.refreshCurrentTab;
  if (typeof next.getCurrentTab === 'function') callbacks.getCurrentTab = next.getCurrentTab;
}

export async function runAutoSyncOnce() {
  if (autoSyncStarted) return;

  autoSyncStarted = true;
  try {
    const serverResult = await syncLatestFromServer();
    const created = countServerSyncChanges(serverResult);
    const touched = countServerSyncTouches(serverResult);
    if (touched > 0) {
      showToast(`자동 동기화: ${created}건 반영`, 1800, created > 0 ? 'success' : 'info');
      callbacks.refreshCurrentTab();
    }
  } catch (err) {
    if (err.code === 'API_UNAVAILABLE') {
      return;
    }
    if (err.code === 'API_TEMPORARY') {
      console.info(`[auto-sync] skipped: server sync temporary unavailable (${err.status || 'unknown'})`);
      return;
    }
    console.warn('[auto-sync]', err);
    showToast(`자동 동기화 실패: ${err.message}`, 3000, 'error');
  }
}

export function startAndroidNotificationCaptureFlush() {
  if (!androidBridge()?.listPendingNotificationCaptures) return;
  requestSmsPermissionOnce();
  flushAndroidNotificationCaptures({ silent: true });
  if (androidCaptureFlushTimer) return;
  androidCaptureFlushTimer = setInterval(() => {
    flushAndroidNotificationCaptures({ silent: true });
  }, ANDROID_CAPTURE_FLUSH_INTERVAL_MS);
}

export function stopAndroidNotificationCaptureFlush() {
  if (!androidCaptureFlushTimer) return;
  clearInterval(androidCaptureFlushTimer);
  androidCaptureFlushTimer = null;
  androidCaptureFlushInFlight = false;
}

export async function flushAndroidNotificationCaptures(options = {}) {
  if (androidCaptureFlushInFlight) {
    return { saved: 0, duplicate: 0, failed: 0, listed: 0, skipped: '이미 반영 중' };
  }
  androidCaptureFlushInFlight = true;
  try {
    const result = await flushAndroidCaptureQueue({
      bridge: androidBridge(),
      currentUser: getCurrentUser(),
      scanRecentSmsCaptures,
      parseAndroidCaptureBridgeJsonArray,
      androidCaptureValidationError,
      transactionFromAndroidCapture,
      findSimilarTransaction,
      updateTransaction,
      saveTransaction,
      buildNaverPayDuplicateMergePatch,
      onError: err => console.warn('[android-capture]', err),
    });
    if (result.saved > 0 || result.duplicate > 0) {
      if (!options.silent) {
        showToast(`Android 알림 ${result.saved}건 저장${result.duplicate ? ` · 중복 ${result.duplicate}건` : ''}`, 1800, 'success');
      }
      if (['home', 'tx', 'report', 'review'].includes(callbacks.getCurrentTab())) {
        callbacks.refreshCurrentTab();
      }
    }
    return result;
  } finally {
    androidCaptureFlushInFlight = false;
  }
}

function androidBridge() {
  return window.BudgetAndroid || null;
}

function requestSmsPermissionOnce() {
  const bridge = androidBridge();
  if (!bridge?.hasSmsReadPermission || !bridge?.requestSmsReadPermission || smsPermissionRequested) return;
  try {
    if (!bridge.hasSmsReadPermission()) {
      smsPermissionRequested = true;
      bridge.requestSmsReadPermission();
    }
  } catch (err) {
    console.warn('[android-sms-permission]', err);
  }
}

function scanRecentSmsCaptures() {
  const bridge = androidBridge();
  if (!bridge?.scanRecentSmsCaptures) return null;
  try {
    return JSON.parse(bridge.scanRecentSmsCaptures(80, 3 * 24 * 60) || '{}');
  } catch (err) {
    console.warn('[android-sms-scan]', err);
    return null;
  }
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
  return Number(result.gmail?.created || 0);
}

function countServerSyncTouches(result) {
  if (!result) return 0;
  return Number(result.gmail?.created || 0)
    + Number(result.gmail?.enriched || 0)
    + Number(result.gmail?.updated || 0);
}

function kstDateText(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
