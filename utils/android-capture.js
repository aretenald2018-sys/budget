export function transactionFromAndroidCapture(capture) {
  if (!capture || typeof capture !== 'object') return null;
  const amount = Math.abs(Number(capture.amount) || 0);
  const occurredAt = dateFromAndroidCapture(capture);
  const type = normalizeAndroidCaptureType(capture.type);
  if (!capture.id || !amount || !occurredAt) return null;
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
    source: 'android_local_notification',
    androidCaptureId: capture.id,
    notificationKey: capture.notificationKey || null,
    notificationPackage: capture.packageName || null,
    notificationAppLabel: capture.appLabel || null,
    body: body.slice(0, 1200),
    memo: 'Android 알림 자동 수집',
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

export function parseAndroidCaptureBridgeJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
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
