import { escHtml } from '../../utils/dom.js?v=20260503-cache-no-store';

export function androidBridge() {
  return window.BudgetAndroid || null;
}

export function readAndroidCaptureStatus() {
  const bridge = androidBridge();
  if (!bridge?.getStatusJson) {
    return {
      available: false,
      notificationAccessEnabled: false,
      smsReadPermissionGranted: false,
      queued: 0,
      failed: 0,
      exhausted: 0,
      maxAttempts: 3,
      saved: 0,
      recent: [],
    };
  }
  try {
    const parsed = JSON.parse(bridge.getStatusJson() || '{}');
    return {
      available: true,
      notificationAccessEnabled: !!parsed.notificationAccessEnabled,
      smsReadPermissionGranted: !!parsed.smsReadPermissionGranted,
      queued: Number(parsed.queued) || 0,
      failed: Number(parsed.failed) || 0,
      exhausted: Number(parsed.exhausted) || 0,
      maxAttempts: Number(parsed.maxAttempts) || 3,
      saved: Number(parsed.saved) || 0,
      recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, 8) : [],
    };
  } catch (err) {
    return {
      available: true,
      notificationAccessEnabled: false,
      smsReadPermissionGranted: false,
      queued: 0,
      failed: 0,
      exhausted: 0,
      maxAttempts: 3,
      saved: 0,
      recent: [],
      error: err.message || 'Android status parse failed',
    };
  }
}

export function androidCapturePanel(status) {
  const disabled = status.available ? '' : 'disabled';
  const access = status.available
    ? (status.notificationAccessEnabled ? '알림 접근 켜짐' : '알림 접근 꺼짐')
    : 'Android APK 필요';
  const sms = status.available ? (status.smsReadPermissionGranted ? '문자 권한 켜짐' : '문자 권한 꺼짐') : '문자 권한 없음';
  const queue = `대기 ${status.queued || 0}건 · 저장 ${status.saved || 0}건${status.failed ? ` · 실패 ${status.failed}건` : ''}${status.exhausted ? ` · 재시도 종료 ${status.exhausted}건` : ''}`;
  return `
    <div class="settings-row" style="display:block">
      <div class="settings-control-head">
        <div class="l">
          <div class="ico">🔔</div>
          <div>
            <div class="name">Android 알림/문자 수집</div>
            <div class="desc">${escHtml(access)} · ${escHtml(sms)} · ${escHtml(queue)}</div>
          </div>
        </div>
      </div>
      <div class="flex gap-sm" style="flex-wrap:wrap;margin-top:10px">
        <button class="tds-btn sm" id="android-open-notification-settings" type="button" ${disabled}>알림 접근 열기</button>
        <button class="tds-btn sm secondary" id="android-sms-permission" type="button" ${disabled}>문자 권한</button>
        <button class="tds-text-btn" id="android-capture-flush" type="button" ${disabled}>지금 반영</button>
      </div>
      <div class="desc" style="padding-top:8px">${status.available ? '결제 알림과 최근 문자함은 Android 기기 안의 로컬 큐에 먼저 쌓이고, 로그인된 앱이 열리면 거래로 저장됩니다.' : '웹 브라우저에서는 휴대폰 알림과 문자를 읽을 수 없습니다. APK에서 권한을 켜세요.'}</div>
      ${androidCaptureRecent(status)}
    </div>
  `;
}

function androidCaptureRecent(status) {
  if (status.error) return `<div class="desc" style="padding-top:8px;color:var(--danger)">${escHtml(status.error)}</div>`;
  if (!status.available || !status.recent.length) return '';
  return `
    <div style="display:grid;gap:6px;margin-top:10px">
      ${status.recent.map(row => `
        <div style="display:grid;gap:2px;border-top:1px solid var(--line);padding-top:8px">
          <div class="name" style="font-size:13px">${escHtml(androidCaptureTitle(row))}</div>
          <div class="desc">${escHtml(androidCaptureMeta(row))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

export function androidFlushResultText(result = {}) {
  if (result.skipped) return `반영 안 됨 · ${result.skipped}`;
  const scan = result.scan || {};
  const bits = [
    `스캔 ${Number(scan.scanned) || 0}건`,
    `큐 ${Number(result.listed) || 0}건`,
    `저장 ${Number(result.saved) || 0}건`,
    `중복 ${Number(result.duplicate) || 0}건`,
  ];
  if (Number(result.failed) || Number(scan.failed)) {
    bits.push(`실패 ${(Number(result.failed) || 0) + (Number(scan.failed) || 0)}건`);
  }
  if (scan.permissionGranted === false) bits.push('문자 권한 없음');
  if (Array.isArray(result.errors) && result.errors.length) bits.push(result.errors[0]);
  if (scan.error) bits.push(scan.error);
  return bits.join(' · ');
}

function androidCaptureTitle(row = {}) {
  if (row.status === 'info' || row.status === 'error') return `${row.status} · ${row.event || 'Android'}`;
  const amount = Number(row.amount) ? `${Number(row.amount).toLocaleString('ko-KR')}원` : '금액 없음';
  return `${captureStatusLabel(row.status)} · ${row.merchant || row.appLabel || '알림'} · ${amount}`;
}

function androidCaptureMeta(row = {}) {
  const bits = [];
  if (row.occurredAt) bits.push(row.occurredAt);
  else if (row.capturedAt) bits.push(androidCaptureTime(row.capturedAt));
  if (row.type) bits.push(row.type);
  if (row.packageName) bits.push(row.packageName);
  if (Number(row.attempts)) bits.push(`시도 ${Number(row.attempts)}회`);
  if (Number(row.nextAttemptAt)) bits.push(`다음 ${androidCaptureTime(row.nextAttemptAt)}`);
  if (row.lastError) bits.push(row.lastError);
  if (row.message) bits.push(row.message);
  return bits.join(' · ') || '상세 없음';
}

function captureStatusLabel(status) {
  if (status === 'queued') return '대기';
  if (status === 'saved') return '저장됨';
  if (status === 'duplicate') return '중복';
  if (status === 'merged') return '병합';
  if (status === 'failed') return '실패';
  if (status === 'ignored') return '무시됨';
  if (status === 'info') return '정보';
  if (status === 'error') return '오류';
  return status || '상태 없음';
}

function androidCaptureTime(value) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

