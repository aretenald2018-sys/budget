export function createTrailingRefreshDrain({ readPending, clearPendingIfCurrent, send }) {
  if (
    typeof readPending !== 'function'
    || typeof clearPendingIfCurrent !== 'function'
    || typeof send !== 'function'
  ) throw new TypeError('Trailing refresh drain requires pending-state and send callbacks.');

  let inFlight = null;

  function flush(fallbackReason = 'budget-resume') {
    if (inFlight) return inFlight;
    const task = (async () => {
      let marker = readPending();
      let reason = String(marker?.reason || fallbackReason || 'budget-resume');
      while (true) {
        const sentMarker = marker;
        const sent = await send(reason);
        if (sent === false) return false;

        if (sentMarker && clearPendingIfCurrent(sentMarker.id)) {
          marker = readPending();
          if (!marker) return true;
          reason = String(marker.reason || fallbackReason || 'budget-resume');
          continue;
        }

        marker = readPending();
        if (!marker) return true;
        reason = String(marker.reason || fallbackReason || 'budget-resume');
      }
    })();
    inFlight = task;
    task.finally(() => {
      if (inFlight === task) inFlight = null;
    }).catch(() => {});
    return task;
  }

  return Object.freeze({
    flush,
    isInFlight: () => inFlight !== null,
  });
}
