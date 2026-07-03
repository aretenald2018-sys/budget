export async function flushAndroidCaptureQueue(options = {}) {
  const {
    bridge,
    currentUser,
    scanRecentSmsCaptures = () => null,
    parseAndroidCaptureBridgeJsonArray,
    transactionFromAndroidCapture,
    findSimilarTransaction,
    updateTransaction,
    saveTransaction,
    buildNaverPayDuplicateMergePatch,
    maxCaptures = 10,
  } = options;

  if (!bridge?.listPendingNotificationCaptures) {
    return { saved: 0, duplicate: 0, failed: 0, listed: 0, skipped: 'Android bridge 없음' };
  }
  if (!currentUser) {
    return { saved: 0, duplicate: 0, failed: 0, listed: 0, skipped: '로그인 필요' };
  }

  let saved = 0;
  let duplicate = 0;
  let failed = 0;
  const errors = [];
  const scan = scanRecentSmsCaptures();
  const captures = parseAndroidCaptureBridgeJsonArray(bridge.listPendingNotificationCaptures(maxCaptures));

  for (const capture of captures) {
    const tx = transactionFromAndroidCapture(capture);
    if (!tx) {
      failed++;
      const message = 'invalid capture payload';
      errors.push(message);
      bridge.failNotificationCapture?.(capture?.id || '', message);
      continue;
    }

    try {
      const existing = await findSimilarTransaction(tx, 10 * 60 * 1000);
      if (existing?.id) {
        const mergePatch = buildNaverPayDuplicateMergePatch(existing, tx);
        if (mergePatch) {
          await updateTransaction(existing.id, mergePatch);
        }
        duplicate++;
        bridge.ackNotificationCapture?.(capture.id, existing.id, mergePatch ? 'merged' : 'duplicate');
        continue;
      }
      const txId = await saveTransaction(tx);
      if (!txId) throw new Error('transaction save returned empty id');
      saved++;
      bridge.ackNotificationCapture?.(capture.id, txId, 'saved');
    } catch (err) {
      failed++;
      const message = err.message || 'save failed';
      errors.push(message);
      bridge.failNotificationCapture?.(capture.id, message);
      options.onError?.(err);
    }
  }

  const result = {
    saved,
    duplicate,
    failed,
    listed: captures.length,
    scan,
    errors: errors.slice(0, 3),
  };
  bridge.recordCaptureInfo?.('web_flush', androidFlushSummary(result));
  return result;
}

export function androidFlushSummary(result = {}) {
  const scan = result.scan || {};
  const parts = [
    `listed=${Number(result.listed) || 0}`,
    `saved=${Number(result.saved) || 0}`,
    `duplicate=${Number(result.duplicate) || 0}`,
    `failed=${Number(result.failed) || 0}`,
  ];
  if (scan && typeof scan === 'object') {
    parts.push(`smsScanned=${Number(scan.scanned) || 0}`);
    parts.push(`smsQueued=${Number(scan.queued) || 0}`);
    parts.push(`smsIgnored=${Number(scan.ignored) || 0}`);
    parts.push(`smsFailed=${Number(scan.failed) || 0}`);
    if (scan.permissionGranted === false) parts.push('smsPermission=false');
    if (scan.error) parts.push(`smsError=${String(scan.error).slice(0, 80)}`);
  }
  if (Array.isArray(result.errors) && result.errors.length) {
    parts.push(`errors=${result.errors.map(item => String(item).slice(0, 60)).join('|')}`);
  }
  if (result.skipped) parts.push(`skipped=${result.skipped}`);
  return parts.join(' ');
}
