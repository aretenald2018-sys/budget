export const ANDROID_CAPTURE_SCHEMA_VERSION = 1;
export const ANDROID_CAPTURE_SOURCES = Object.freeze([
  'android_local_notification',
  'android_local_sms',
]);

export function transactionFromAndroidCapture(capture) {
  if (androidCaptureValidationError(capture)) return null;
  const amount = Math.abs(Number(capture.amount) || 0);
  const occurredAt = dateFromAndroidCapture(capture);
  const type = normalizeAndroidCaptureType(capture.type);
  const merchant = String(capture.merchant || capture.actualMerchant || capture.appLabel || '알림 결제').trim().slice(0, 80);
  const body = String(capture.raw || [capture.title, capture.text, capture.bigText].filter(Boolean).join(' ')).trim();
  const payload = {
    type,
    amount,
    occurredAt,
    category: null,
    subcategory: null,
    needsReview: Number(capture.confidence || 0) < 0.82,
    confidence: Number(capture.confidence || 0.5),
    source: capture.source || 'android_local_notification',
    androidCaptureId: capture.id,
    notificationKey: capture.notificationKey || null,
    notificationPackage: capture.packageName || null,
    notificationAppLabel: capture.appLabel || null,
    body: body.slice(0, 1200),
    memo: capture.source === 'android_local_sms' ? 'Android 문자 자동 수집' : 'Android 알림 자동 수집',
    rawNotification: {
      title: capture.title || '',
      text: capture.text || '',
      bigText: capture.bigText || '',
      packageName: capture.packageName || '',
      appLabel: capture.appLabel || '',
      postTime: capture.postTime || null,
      capturedAt: capture.capturedAt || null,
    },
  };
  const paymentRail = String(capture.paymentRail || '').trim();
  const actualMerchant = String(capture.actualMerchant || '').trim().slice(0, 80);
  const reason = String(capture.reason || '').trim().slice(0, 120);
  if (paymentRail) payload.paymentRail = paymentRail;
  if (capture.paymentRailResolved === true || capture.paymentRailResolved === 'true') {
    payload.paymentRailResolved = true;
  }
  if (actualMerchant) payload.actualMerchant = actualMerchant;
  if (reason) payload.reason = reason;
  if (type === 'transfer_in') payload.counterparty = merchant;
  else payload.merchant = merchant;
  return payload;
}

export function androidCaptureValidationError(capture) {
  if (!capture || typeof capture !== 'object' || Array.isArray(capture)) return 'capture payload가 객체가 아닙니다';
  if (Number(capture.schemaVersion) !== ANDROID_CAPTURE_SCHEMA_VERSION) {
    return `지원하지 않는 capture schemaVersion: ${capture.schemaVersion ?? '없음'}`;
  }
  if (!String(capture.id || '').trim()) return 'capture id가 없습니다';
  if (!(Math.abs(Number(capture.amount) || 0) > 0)) return 'capture amount가 0 이하입니다';
  if (!dateFromAndroidCapture(capture)) return 'capture occurredAt이 올바르지 않습니다';
  if (!ANDROID_CAPTURE_SOURCES.includes(String(capture.source || ''))) return `지원하지 않는 capture source: ${capture.source || '없음'}`;
  return '';
}

export function parseAndroidCaptureBridgeJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
  } catch {
    return [];
  }
}

function normalizeAndroidCaptureType(value) {
  return ['card_payment', 'transfer_out', 'transfer_in'].includes(value) ? value : 'card_payment';
}

function dateFromAndroidCapture(capture) {
  const raw = capture.occurredAt || capture.occurredAtMs || capture.postTime || capture.capturedAt;
  const date = typeof raw === 'number' ? new Date(raw) : new Date(String(raw || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}
