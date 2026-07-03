// ================================================================
// render-settings.js — 설정 화면
// ================================================================

import {
  getCategories, getCurrentUser,
  listSharedPaymentRules, saveSharedPaymentRule, deleteSharedPaymentRule,
  saveCategoryMonthlyTarget, saveCategoryBudgetRhythm,
  getAppSettings, saveAppSettings, listRecentRawMessages,
} from './data.js?v=20260703-reward-rate-css-fix';
import { fmtKRW, fmtMonthKey } from './utils/format.js?v=20260503-cache-no-store';
import { $, escHtml } from './utils/dom.js?v=20260503-cache-no-store';
import { showToast } from './utils/toast.js?v=20260503-cache-no-store';

const DEFAULT_REWARD_SAVINGS_SETTINGS = {
  enabled: true,
  lookbackDays: 180,
  allocationRate: 0.3,
  dailyPointCap: 10000,
  monthPointCap: 120000,
  baselineMethod: 'trimmed_weekly',
};
const DEFAULT_NATIVE_INGEST_URL = 'https://budget-api-liart.vercel.app/api/ingest';

export async function renderSettings() {
  const root = $('#tab-settings');
  const user = getCurrentUser();
  const categories = getCategories();
  const budgetMonth = fmtMonthKey(new Date());
  const expenseCategories = categories
    .filter(c => c.kind === 'expense')
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
  const [sharedRules, recentRawMessages] = user
    ? await Promise.all([
      listSharedPaymentRules().catch(() => []),
      listRecentRawMessages(30).catch(() => []),
    ])
    : [[], []];
  const appSettings = await getAppSettings().catch(() => ({
    theme: localStorage.getItem('budget.theme') || 'dark',
    browserFallbackParse: localStorage.getItem('budget.clientFallbackParseEnabled') === '1',
    homeManagedCategoryIds: [],
    rewardSavings: DEFAULT_REWARD_SAVINGS_SETTINGS,
  }));
  const rewardSavings = normalizeRewardSettings(appSettings.rewardSavings);
  const nativeIngest = readNativeIngestStatus();
  window._budgetHomeManagedCategoryIds = Array.isArray(appSettings.homeManagedCategoryIds) ? appSettings.homeManagedCategoryIds : [];

  root.innerHTML = `
    <div class="settings-card" style="margin-top:8px">
      <div class="settings-row">
        <div class="l">
          <div class="ico" style="background:var(--primary-bg);color:var(--primary)">k</div>
          <div>
            <div class="name">${escHtml(user?.email?.split('@')[0] || 'kim')}</div>
            <div class="desc">${escHtml(user?.email || '-')}</div>
          </div>
        </div>
        <button class="tds-text-btn" onclick="signOut()">로그아웃</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">예산 & 카테고리</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="l"><div class="ico">📊</div><div><div class="name">예산 목표</div><div class="desc">${budgetMonth} · ${fmtKRW(expenseCategories.reduce((sum, c) => sum + currentTarget(c, budgetMonth), 0))}</div></div></div>
          <button class="tds-text-btn" onclick="openCategoryModal()">+ 추가</button>
        </div>
        <div class="settings-row" style="display:block">
          <div class="budget-settings-card">
            ${budgetGoalGroups(expenseCategories, budgetMonth)}
          </div>
          <div class="desc" style="padding:8px 4px 0">입력값은 만원 단위입니다. 항목명이나 자동분류 키워드는 수정 버튼에서 바꿀 수 있습니다.</div>
        </div>
        <div class="settings-row" style="display:block">
          <div class="settings-control-head">
            <div>
              <div class="name">홈 관리 카테고리</div>
              <div class="desc">홈에는 고른 항목만 횟수/금액으로 나눠 보여줍니다.</div>
            </div>
          </div>
          <div class="home-managed-picker">
            ${homeManagedCategoryOptions(expenseCategories.filter(cat => currentRhythm(cat) !== 'fixed'), appSettings.homeManagedCategoryIds || [])}
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">화면 & 소계획</div>
      <div class="settings-card">
        <div class="settings-row" style="display:block">
          <div class="l"><div class="ico">◐</div><div><div class="name">테마</div><div class="desc">라이트/다크/시스템 모드</div></div></div>
          <div class="tds-segmented settings-theme-segment" id="settings-theme-segment">
            ${themeOption('light', '라이트', appSettings.theme)}
            ${themeOption('dark', '다크', appSettings.theme)}
            ${themeOption('system', '시스템', appSettings.theme)}
          </div>
        </div>
        <div class="settings-row reward-settings-row" style="display:block">
          <form id="reward-settings-form" class="reward-settings-form">
            <div class="settings-control-head">
              <div>
                <div class="name">보상 적립</div>
                <div class="desc">기준 소비보다 덜 쓴 금액의 일부를 포인트로 계산합니다.</div>
              </div>
              <label class="toggle-row reward-toggle" aria-label="보상 적립 사용">
                <input type="checkbox" name="enabled" ${rewardSavings.enabled ? 'checked' : ''}>
              </label>
            </div>
            <div class="reward-settings-grid">
              <label>
                <span>기준 기간</span>
                <select class="tds-select" name="lookbackDays">
                  ${rewardOption(90, '최근 3개월', rewardSavings.lookbackDays)}
                  ${rewardOption(180, '최근 6개월', rewardSavings.lookbackDays)}
                  ${rewardOption(365, '최근 1년', rewardSavings.lookbackDays)}
                </select>
              </label>
              <label>
                <span>기준선 방식</span>
                <select class="tds-select" name="baselineMethod">
                  ${rewardOption('trimmed_weekly', '주간 트림 평균', rewardSavings.baselineMethod)}
                  ${rewardOption('simple_daily', '단순 일평균', rewardSavings.baselineMethod)}
                </select>
              </label>
              <label>
                <span>적립 배분율</span>
                <div class="reward-rate-field">
                  <input class="tds-input" type="number" name="allocationRatePct" inputmode="decimal" min="0" max="100" step="0.1" value="${formatRewardRatePct(rewardSavings.allocationRate)}">
                  <span aria-hidden="true">%</span>
                </div>
              </label>
              <label>
                <span>일 상한</span>
                <input class="tds-input" name="dailyPointCap" inputmode="numeric" value="${rewardSavings.dailyPointCap}">
              </label>
              <label>
                <span>월 상한</span>
                <input class="tds-input" name="monthPointCap" inputmode="numeric" value="${rewardSavings.monthPointCap}">
              </label>
            </div>
            <div class="reward-settings-actions">
              <button class="tds-text-btn" id="reward-settings-reset" type="button">초기화</button>
              <button class="tds-btn sm" type="submit">저장</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="h">계좌 & 데이터 소스</div>
      <div class="settings-card">
        <button type="button" class="settings-row as-button" onclick="switchTab('review')">
          <div class="l"><div class="ico">▣</div><div><div class="name">검토 대기</div><div class="desc">미분류·자동분류 실패 거래를 한 번에 확인</div></div></div>
          <span class="arrow">›</span>
        </button>
        <button type="button" class="settings-row as-button" onclick="switchTab('settle')">
          <div class="l"><div class="ico">↔</div><div><div class="name">정산 흐름</div><div class="desc">받을 돈·줄 돈을 상대별로 점검</div></div></div>
          <span class="arrow">›</span>
        </button>
        <button type="button" class="settings-row as-button" onclick="switchTab('report')">
          <div class="l"><div class="ico">↗</div><div><div class="name">월간 리포트</div><div class="desc">홈 요약보다 자세한 소비 페이스</div></div></div>
          <span class="arrow">›</span>
        </button>
        <div class="settings-row">
          <div class="l"><div class="ico">📱</div><div><div class="name">브라우저 보조 파싱</div><div class="desc">서버 동기화가 놓친 문자만 Gemini 프록시로 재파싱</div></div></div>
          <label class="toggle-row"><input type="checkbox" id="settings-fallback-parse" ${appSettings.browserFallbackParse ? 'checked' : ''}></label>
        </div>
        ${ingestTracePanel(recentRawMessages)}
        ${nativeIngestPanel(nativeIngest)}
        <div class="settings-row">
          <div class="l"><div class="ico">⚖️</div><div><div class="name">정산 규칙</div><div class="desc">${sharedRules.length}건 자동 매칭</div></div></div>
          <span class="arrow">›</span>
        </div>
        <div class="settings-row" style="display:block">
          <form id="shared-rule-form" class="flex gap-md">
            <input class="tds-input" name="merchant" placeholder="결제처" style="flex:1" required>
            <input class="tds-input" name="peopleCount" type="number" min="2" max="10" value="2" style="width:72px" required>
            <button class="tds-btn sm" type="submit">추가</button>
          </form>
        </div>
        ${sharedRules.length === 0 ? '<div class="settings-row"><div class="desc">등록된 결제처가 없습니다.</div></div>' : sharedRules.map(rule => `
          <div class="settings-row">
            <div class="l">
              <div class="ico">÷</div>
              <div>
                <div class="name">${escHtml(rule.merchant || rule.name || '-')}</div>
                <div class="desc">${Number(rule.peopleCount) || 2}명 기준 내 부담액만 기록</div>
              </div>
            </div>
            <button class="tds-text-btn" data-delete-shared-rule="${rule.id}" type="button">삭제</button>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="settings-section">
      <div class="h">앱 정보</div>
      <div class="settings-card">
        <div class="settings-row"><div class="l"><div class="ico">ⓘ</div><div><div class="name">버전</div><div class="desc">v2.0.3 · 공개/네이티브 수집 빌드 분리</div></div></div><div class="r">›</div></div>
        <a class="settings-row as-button apk-download-row" href="./downloads/budget.apk?v=20260703-dual-apk-v4" download="tomato-budget.apk">
          <div class="l">
            <div class="ico apk-download-ico"><img src="./android-apk.svg" alt=""></div>
            <div>
              <div class="name">Android APK 다운로드</div>
              <div class="desc">설치 가능한 Android 버전 내려받기</div>
            </div>
          </div>
          <span class="arrow">다운로드</span>
        </a>
      </div>
    </div>
  `;

  bindBudgetGoalControls(budgetMonth);
  bindSharedRuleControls();
  bindAppSettingControls();
}

window.refreshSettings = renderSettings;

function themeOption(value, label, selected) {
  return `<button class="tds-segmented-item ${selected === value ? 'active' : ''}" type="button" data-theme-choice="${value}">${label}</button>`;
}

function homeManagedCategoryOptions(categories, selectedIds = []) {
  const selected = new Set(selectedIds);
  return categories.map(cat => `
    <button type="button" class="home-managed-pick ${selected.has(cat.id) ? 'active' : ''}" data-home-managed-category-id="${escHtml(cat.id)}">
      <span>${cat.emoji || '□'}</span>
      <strong>${escHtml(cat.name)}</strong>
    </button>
  `).join('');
}

function bindAppSettingControls() {
  document.querySelectorAll('[data-theme-choice]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const theme = btn.dataset.themeChoice;
      try {
        localStorage.setItem('budget.theme', theme);
        window.applyBudgetTheme?.(theme);
        await saveAppSettings({ theme });
        showToast('테마를 저장했어요.', 1200, 'success');
        renderSettings();
      } catch (err) {
        showToast(err.message || '테마 저장 실패', 2200, 'error');
      }
    });
  });
  document.querySelectorAll('[data-home-managed-category-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.homeManagedCategoryId;
      const current = new Set(Array.isArray(window._budgetHomeManagedCategoryIds) ? window._budgetHomeManagedCategoryIds : []);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      const homeManagedCategoryIds = Array.from(current).slice(0, 8);
      try {
        window._budgetHomeManagedCategoryIds = homeManagedCategoryIds;
        await saveAppSettings({ homeManagedCategoryIds });
        showToast('홈 관리 카테고리를 저장했어요.', 1200, 'success');
        renderSettings();
        if (window.refreshCurrentTab) window.refreshCurrentTab();
      } catch (err) {
        showToast(err.message || '홈 카테고리 저장 실패', 2200, 'error');
      }
    });
  });
  $('#settings-fallback-parse')?.addEventListener('change', async (e) => {
    const browserFallbackParse = !!e.currentTarget.checked;
    try {
      localStorage.setItem('budget.clientFallbackParseEnabled', browserFallbackParse ? '1' : '0');
      await saveAppSettings({ browserFallbackParse });
      showToast(browserFallbackParse ? '보조 파싱 자동 실행을 켰어요.' : '보조 파싱 자동 실행을 껐어요.', 1400, 'success');
    } catch (err) {
      showToast(err.message || '보조 파싱 설정 저장 실패', 2200, 'error');
      renderSettings();
    }
  });

  const rewardForm = $('#reward-settings-form');
  rewardForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rewardSavings = readRewardSettingsForm(event.currentTarget);
    try {
      await saveAppSettings({ rewardSavings });
      showToast('보상 적립 설정을 저장했어요.', 1400, 'success');
      renderSettings();
      window.refreshCurrentTab?.();
    } catch (err) {
      showToast(err.message || '보상 적립 설정 저장 실패', 2200, 'error');
    }
  });
  $('#reward-settings-reset')?.addEventListener('click', async () => {
    try {
      await saveAppSettings({ rewardSavings: DEFAULT_REWARD_SAVINGS_SETTINGS });
      showToast('보상 적립 설정을 초기화했어요.', 1400, 'success');
      renderSettings();
      window.refreshCurrentTab?.();
    } catch (err) {
      showToast(err.message || '보상 적립 초기화 실패', 2200, 'error');
    }
  });

  $('#native-ingest-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const bridge = nativeBridge();
    if (!bridge?.saveIngestSettings) {
      showToast('Android APK에서만 저장할 수 있어요.', 1800, 'error');
      return;
    }
    const fd = new FormData(e.currentTarget);
    try {
      bridge.saveIngestSettings(fd.get('apiUrl') || DEFAULT_NATIVE_INGEST_URL, fd.get('token') || '');
      showToast('Android 알림 수집 설정 저장됨', 1500, 'success');
      setTimeout(renderSettings, 250);
    } catch (err) {
      showToast(err.message || 'Android 설정 저장 실패', 2200, 'error');
    }
  });

  $('#native-open-notification-settings')?.addEventListener('click', () => {
    const bridge = nativeBridge();
    if (!bridge?.openNotificationAccessSettings) {
      showToast('Android APK에서만 열 수 있어요.', 1800, 'error');
      return;
    }
    bridge.openNotificationAccessSettings();
  });

  $('#native-ingest-flush')?.addEventListener('click', () => {
    const bridge = nativeBridge();
    if (!bridge?.flushIngestQueue) {
      showToast('Android APK에서만 재전송할 수 있어요.', 1800, 'error');
      return;
    }
    bridge.flushIngestQueue();
    showToast('대기 중인 알림을 다시 전송합니다.', 1400, 'success');
    setTimeout(renderSettings, 500);
  });

  $('#native-ingest-clear-token')?.addEventListener('click', () => {
    const bridge = nativeBridge();
    if (!bridge?.clearIngestToken) {
      showToast('Android APK에서만 삭제할 수 있어요.', 1800, 'error');
      return;
    }
    bridge.clearIngestToken();
    showToast('저장된 ingest token을 삭제했어요.', 1500, 'success');
    setTimeout(renderSettings, 250);
  });
}

function nativeBridge() {
  return window.BudgetAndroid || null;
}

function readNativeIngestStatus() {
  const bridge = nativeBridge();
  if (!bridge?.getStatusJson) {
    return {
      available: false,
      apiUrl: DEFAULT_NATIVE_INGEST_URL,
      hasToken: false,
      notificationAccessEnabled: false,
      logs: [],
    };
  }
  try {
    const parsed = JSON.parse(bridge.getStatusJson() || '{}');
    return {
      available: true,
      apiUrl: parsed.apiUrl || DEFAULT_NATIVE_INGEST_URL,
      hasToken: !!parsed.hasToken,
      notificationAccessEnabled: !!parsed.notificationAccessEnabled,
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch (err) {
    return {
      available: true,
      apiUrl: DEFAULT_NATIVE_INGEST_URL,
      hasToken: false,
      notificationAccessEnabled: false,
      logs: [],
      error: err.message || 'native status parse failed',
    };
  }
}

function nativeIngestPanel(status) {
  const disabled = status.available ? '' : 'disabled';
  const accessLabel = status.available
    ? (status.notificationAccessEnabled ? '알림 접근 켜짐' : '알림 접근 꺼짐')
    : 'Android APK 필요';
  const tokenLabel = status.hasToken ? 'token 저장됨' : 'token 없음';
  const tokenPlaceholder = status.hasToken ? '새 token으로 바꿀 때만 입력' : '서버 ingest token 입력';
  return `
    <div class="settings-row" style="display:block">
      <div class="settings-control-head">
        <div class="l">
          <div class="ico">🔔</div>
          <div>
            <div class="name">Android 알림 수집</div>
            <div class="desc">${escHtml(accessLabel)} · ${escHtml(tokenLabel)}</div>
          </div>
        </div>
      </div>
      <form id="native-ingest-form" style="display:grid;gap:8px;margin-top:12px">
        <input class="tds-input" name="apiUrl" value="${escHtml(status.apiUrl || DEFAULT_NATIVE_INGEST_URL)}" placeholder="API bridge URL" ${disabled}>
        <input class="tds-input" name="token" type="password" placeholder="${escHtml(tokenPlaceholder)}" autocomplete="off" ${disabled}>
        <div class="flex gap-sm" style="flex-wrap:wrap">
          <button class="tds-btn sm" type="submit" ${disabled}>저장</button>
          <button class="tds-text-btn" id="native-open-notification-settings" type="button" ${disabled}>알림 접근 열기</button>
          <button class="tds-text-btn" id="native-ingest-flush" type="button" ${disabled}>큐 재전송</button>
          <button class="tds-text-btn" id="native-ingest-clear-token" type="button" ${disabled}>토큰 삭제</button>
        </div>
      </form>
      <div class="desc" style="padding-top:8px">${status.available ? '토큰 값은 Android private storage에만 저장되고 브라우저에는 보관하지 않습니다.' : '공개 APK는 설치 차단을 줄이기 위해 MacroDroid 수집을 기본으로 사용합니다. 앱 자체 알림 수집은 별도 native 수집 빌드에서 활성화됩니다.'}</div>
      ${nativeIngestLogs(status)}
    </div>
  `;
}

function nativeIngestLogs(status) {
  if (status.error) {
    return `<div class="desc" style="padding-top:8px;color:var(--danger)">${escHtml(status.error)}</div>`;
  }
  if (!status.available) return '';
  const logs = Array.isArray(status.logs) ? status.logs.slice(0, 20) : [];
  if (!logs.length) {
    return '<div class="desc" style="padding-top:8px">아직 Android 수집 로그가 없습니다.</div>';
  }
  return `
    <div style="display:grid;gap:6px;margin-top:10px">
      ${logs.map(log => `
        <div style="display:grid;gap:2px;border-top:1px solid var(--line);padding-top:8px">
          <div class="name" style="font-size:13px">${escHtml(nativeLogTitle(log))}</div>
          <div class="desc">${escHtml(nativeLogMeta(log))}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function ingestTracePanel(rawMessages = []) {
  const rows = Array.isArray(rawMessages) ? rawMessages.slice(0, 12) : [];
  const summary = summarizeIngestTrace(rawMessages);
  return `
    <div class="settings-row" style="display:block">
      <div class="settings-control-head">
        <div>
          <div class="name">수집 경로 점검</div>
          <div class="desc">최근 raw 기준으로 MacroDroid와 앱 자체 수집을 구분합니다.</div>
        </div>
      </div>
      <div style="display:grid;gap:6px;margin-top:10px">
        <div style="display:grid;gap:2px;border-top:1px solid var(--line);padding-top:8px">
          <div class="name" style="font-size:13px">최근 ${summary.total}건</div>
          <div class="desc">${escHtml(summary.label)}</div>
        </div>
        ${rows.length ? rows.map(raw => `
          <div style="display:grid;gap:2px;border-top:1px solid var(--line);padding-top:8px">
            <div class="name" style="font-size:13px">${escHtml(ingestOriginLabel(rawIngestOrigin(raw)))} · ${escHtml(raw.sender || raw.app || raw.source || 'raw')}</div>
            <div class="desc">${escHtml(rawIngestMeta(raw))}</div>
          </div>
        `).join('') : '<div class="desc" style="padding-top:8px">최근 raw 메시지가 없습니다.</div>'}
      </div>
    </div>
  `;
}

function summarizeIngestTrace(rawMessages = []) {
  const rows = Array.isArray(rawMessages) ? rawMessages : [];
  const counts = rows.reduce((acc, raw) => {
    const origin = rawIngestOrigin(raw);
    acc[origin] = (acc[origin] || 0) + 1;
    return acc;
  }, {});
  const label = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([origin, count]) => `${ingestOriginLabel(origin)} ${count}`)
    .join(' · ') || '기록 없음';
  return { total: rows.length, label };
}

function rawIngestOrigin(raw) {
  const meta = raw?.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const ingest = raw?.ingest && typeof raw.ingest === 'object' ? raw.ingest : {};
  const source = String(raw?.source || '').trim();
  const explicit = raw?.ingestOrigin || ingest.origin || meta.ingestOrigin || meta.ingest_origin || meta.origin;
  if (explicit) return String(explicit);
  if (meta.nativeIngest === true || meta.nativeIngest === 'true' || source === 'native_notification') return 'android_native';
  if (source === 'sms' || source === 'notif' || source === 'notification') return 'macrodroid';
  if (source === 'gmail_receipt' || source === 'gmail') return 'gmail';
  if (source === 'browser_fallback' || source === 'client_parse') return 'browser_fallback';
  return source || 'unknown';
}

function rawIngestMeta(raw) {
  const parts = [];
  const meta = raw?.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const ingest = raw?.ingest && typeof raw.ingest === 'object' ? raw.ingest : {};
  const channel = raw?.ingestChannel || ingest.channel || meta.ingestChannel || meta.ingest_channel || raw?.source;
  const client = raw?.ingestClient || ingest.client || meta.ingestClient || meta.ingest_client;
  const createdAt = raw?.createdAt?.toDate ? raw.createdAt.toDate() : raw?.createdAt;
  if (createdAt) parts.push(nativeLogTime(createdAt));
  if (channel) parts.push(channelLabel(channel));
  if (client) parts.push(String(client));
  if (raw?.status) parts.push(statusLabel(raw.status));
  if (raw?.txId) parts.push(`tx ${String(raw.txId).slice(0, 8)}`);
  if (raw?.lastError) parts.push(String(raw.lastError).slice(0, 80));
  return parts.join(' · ') || '상세 없음';
}

function ingestOriginLabel(origin) {
  const value = String(origin || '').toLowerCase();
  if (value === 'android_native') return '앱 자체';
  if (value === 'macrodroid') return 'MacroDroid';
  if (value === 'browser_fallback') return '브라우저 보조';
  if (value === 'gmail') return 'Gmail';
  if (value === 'api_bridge') return 'API';
  return origin || '미확인';
}

function channelLabel(channel) {
  const value = String(channel || '').toLowerCase();
  if (value === 'sms') return 'SMS';
  if (value === 'mms') return 'MMS';
  if (value === 'notif' || value === 'notification' || value === 'native_notification') return '알림';
  return channel;
}

function statusLabel(status) {
  if (status === 'parsed') return '파싱됨';
  if (status === 'pending') return '대기';
  if (status === 'skipped') return '건너뜀';
  if (status === 'failed') return '실패';
  return status;
}

function nativeLogTitle(log) {
  const status = nativeLogStatusLabel(log?.status);
  const app = log?.appLabel || log?.packageName || 'Android';
  return `${status} · ${app}`;
}

function nativeLogMeta(log) {
  const bits = [];
  if (log?.updatedAt) bits.push(nativeLogTime(log.updatedAt));
  if (log?.httpStatus) bits.push(`HTTP ${log.httpStatus}`);
  if (log?.attempts) bits.push(`${log.attempts}회`);
  if (log?.message) bits.push(log.message);
  if (log?.preview) bits.push(log.preview);
  return bits.join(' · ');
}

function nativeLogStatusLabel(status) {
  if (status === 'sent') return '전송됨';
  if (status === 'failed') return '실패';
  if (status === 'queued') return '대기';
  return status || '상태 없음';
}

function nativeLogTime(value) {
  const date = value instanceof Date ? value : new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function bindSharedRuleControls() {
  $('#shared-rule-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await saveSharedPaymentRule({
        merchant: fd.get('merchant'),
        peopleCount: fd.get('peopleCount'),
      });
      showToast('공동 결제처 저장됨', 1500, 'success');
      renderSettings();
    } catch (err) {
      showToast(err.message, 3000, 'error');
    }
  });

  document.querySelectorAll('[data-delete-shared-rule]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await deleteSharedPaymentRule(btn.dataset.deleteSharedRule);
        showToast('삭제됨', 1500, 'success');
        renderSettings();
      } catch (err) {
        showToast(err.message, 3000, 'error');
      }
    });
  });
}

function budgetGoalGroups(categories, monthKey) {
  const groups = {};
  for (const cat of categories) {
    const parent = cat.parent || '기타';
    if (!groups[parent]) groups[parent] = [];
    groups[parent].push(cat);
  }
  return Object.entries(groups).map(([parent, rows]) => {
    const total = rows.reduce((sum, cat) => sum + currentTarget(cat, monthKey), 0);
    return `
      <div class="budget-goal-group">
        <div class="budget-goal-parent">
          <strong>${escHtml(parent)}</strong>
          <span>${fmtKRW(total)}</span>
        </div>
        ${rows.map(cat => `
          <div class="budget-goal-row rhythm editable">
            <span>${cat.emoji || ''} ${escHtml(cat.name)}</span>
            <input class="tds-input budget-goal-input" data-category-id="${cat.id}" inputmode="numeric" value="${Math.round(currentTarget(cat, monthKey) / 10000)}">
            <select class="tds-select budget-rhythm-select" data-rhythm-category-id="${cat.id}">
              ${['fixed', 'front_loaded', 'spread'].map(value => `<option value="${value}" ${currentRhythm(cat) === value ? 'selected' : ''}>${rhythmLabel(value)}</option>`).join('')}
            </select>
            <button type="button" class="tds-icon-btn sm budget-category-edit" onclick="openCategoryModal('${cat.id}')" title="카테고리 수정">✎</button>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function currentTarget(cat, monthKey) {
  return Number(cat.monthlyTargets?.[monthKey] ?? cat.target ?? 0) || 0;
}

function normalizeRewardSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const allocationRate = normalizeAllocationRate(source.allocationRate);
  return {
    ...DEFAULT_REWARD_SAVINGS_SETTINGS,
    ...source,
    enabled: source.enabled !== false && source.enabled !== 'false',
    lookbackDays: [90, 180, 365].includes(Number(source.lookbackDays)) ? Number(source.lookbackDays) : DEFAULT_REWARD_SAVINGS_SETTINGS.lookbackDays,
    allocationRate: Number.isFinite(allocationRate) ? allocationRate : DEFAULT_REWARD_SAVINGS_SETTINGS.allocationRate,
    dailyPointCap: Math.max(0, Math.round(Number(source.dailyPointCap) || DEFAULT_REWARD_SAVINGS_SETTINGS.dailyPointCap)),
    monthPointCap: Math.max(0, Math.round(Number(source.monthPointCap) || DEFAULT_REWARD_SAVINGS_SETTINGS.monthPointCap)),
    baselineMethod: ['trimmed_weekly', 'simple_daily'].includes(source.baselineMethod) ? source.baselineMethod : DEFAULT_REWARD_SAVINGS_SETTINGS.baselineMethod,
  };
}

function rewardOption(value, label, selected) {
  return `<option value="${escHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escHtml(label)}</option>`;
}

function normalizeAllocationRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const ratio = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, ratio));
}

function readRewardSettingsForm(form) {
  const fd = new FormData(form);
  return normalizeRewardSettings({
    enabled: fd.get('enabled') === 'on',
    lookbackDays: Number(fd.get('lookbackDays')),
    baselineMethod: fd.get('baselineMethod'),
    allocationRate: parsePercentInput(fd.get('allocationRatePct')) / 100,
    dailyPointCap: parseKRWInput(fd.get('dailyPointCap')),
    monthPointCap: parseKRWInput(fd.get('monthPointCap')),
  });
}

function parsePercentInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const n = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

function parseKRWInput(value) {
  return Math.max(0, Math.round(Number(String(value || '').replace(/[^\d.-]/g, '')) || 0));
}

function formatRewardRatePct(value) {
  const pct = normalizeAllocationRate(value) * 100;
  if (!Number.isFinite(pct)) return '0';
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
}

function currentRhythm(cat) {
  return cat.budgetRhythm || 'spread';
}

function rhythmLabel(value) {
  if (value === 'fixed') return '고정비';
  if (value === 'front_loaded') return '월초 집중';
  return '변동비';
}

function bindBudgetGoalControls(monthKey) {
  document.querySelectorAll('[data-category-id]').forEach(input => {
    input.addEventListener('change', async () => {
      const manwon = Math.max(0, Math.round(Number(String(input.value).replace(/[^\d.-]/g, '')) || 0));
      input.value = manwon;
      try {
        await saveCategoryMonthlyTarget(input.dataset.categoryId, monthKey, manwon * 10000);
        showToast('월 목표 저장됨', 1200, 'success');
        renderSettings();
        if (window.refreshCurrentTab) window.refreshCurrentTab();
      } catch (err) {
        showToast(err.message, 2600, 'error');
      }
    });
  });

  document.querySelectorAll('[data-rhythm-category-id]').forEach(select => {
    select.addEventListener('change', async () => {
      try {
        await saveCategoryBudgetRhythm(select.dataset.rhythmCategoryId, select.value);
        showToast('비용 성격 저장됨', 1200, 'success');
        renderSettings();
        if (window.refreshCurrentTab) window.refreshCurrentTab();
      } catch (err) {
        showToast(err.message, 2600, 'error');
      }
    });
  });
}
