// ================================================================
// 설정 09 데이터 백업/복원 — 액션형 화면
// 백업 = 로컬 JSON 스냅샷 다운로드 (목업의 iCloud는 웹앱이라 불가 — 편차).
// 복원 = 파일 선택 → 확인 → 복원 직전 현재 데이터 안전 백업 → 반영.
// 거래 내역 복원은 중복 위험이 커서 1차 범위에서 제외(백업에는 포함).
// 흐름: docs/ai/flows/2026-07-24-settings-10-screens.md §2-09
// ================================================================

import {
  getAppSettings, saveAppSettings, getCategories, saveCategory,
  listTransactions, listRewardPointEntries, getProvisionFunds, saveProvisionFund,
} from '../../../data.js';
import { showToast } from '../../../utils/toast.js';
import { escHtml, switchHtml, sectionHtml, downloadBlob, localISODateTime } from './shared.js';

const BACKUP_MARKER = 'budget-app-backup';
const BACKUP_VERSION = 1;

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function buildBackupPayload(scope) {
  const from = new Date(2000, 0, 1);
  const [txs, entries, appSettings] = await Promise.all([
    scope.transactions ? listTransactions({ from, to: new Date(), max: 5000, includeHidden: true }).catch(() => []) : [],
    listRewardPointEntries({ max: 500 }).catch(() => []),
    getAppSettings(),
  ]);
  return {
    __marker: BACKUP_MARKER,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    scope,
    transactions: scope.transactions ? txs : [],
    categories: scope.budgets ? getCategories() : [],
    funds: scope.budgets ? getProvisionFunds() : [],
    rewardPointEntries: entries,
    appSettings: (scope.rules || scope.homeSettings) ? appSettings : null,
  };
}

async function runBackup(ctx) {
  const appSettings = await getAppSettings();
  const payload = await buildBackupPayload(appSettings.backup.scope);
  const json = JSON.stringify(payload);
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = downloadBlob(json, `budget-backup-${stamp}.json`, 'application/json');
  await saveAppSettings({
    backup: {
      ...appSettings.backup,
      lastBackupAt: localISODateTime(),
      lastBackupSize: blob.size,
    },
  });
  showToast('백업 파일을 저장했어요.', 1600, 'success');
  ctx.refresh();
}

async function runRestore(file, ctx) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    showToast('백업 파일을 읽을 수 없어요.', 2400, 'error');
    return;
  }
  if (payload?.__marker !== BACKUP_MARKER) {
    showToast('이 앱의 백업 파일이 아니에요.', 2400, 'error');
    return;
  }
  const summary = [
    payload.categories?.length ? `카테고리 ${payload.categories.length}개` : '',
    payload.funds?.length ? `충당금 ${payload.funds.length}개` : '',
    payload.appSettings ? '앱 설정' : '',
  ].filter(Boolean).join(' · ') || '설정 없음';
  if (!window.confirm(`${payload.createdAt?.slice(0, 16).replace('T', ' ') || '?'} 백업을 복원할까요?\n(${summary})\n\n복원 직전에 현재 데이터를 안전 백업 파일로 먼저 내려받아요.\n거래 내역은 중복 방지를 위해 복원 대상에서 제외돼요.`)) return;

  // 복원 직전 안전 백업 (흐름도 §2-09 5단계)
  const current = await getAppSettings();
  const safety = await buildBackupPayload(current.backup.scope);
  downloadBlob(JSON.stringify(safety), `budget-backup-safety-${Date.now()}.json`, 'application/json');

  try {
    if (Array.isArray(payload.categories)) {
      for (const cat of payload.categories) {
        if (cat?.id) await saveCategory(cat);
      }
    }
    if (Array.isArray(payload.funds)) {
      for (const fund of payload.funds) {
        if (fund?.id) await saveProvisionFund({ ...fund });
      }
    }
    if (payload.appSettings && typeof payload.appSettings === 'object') {
      const { backup: _ignored, ...rest } = payload.appSettings;
      await saveAppSettings(rest);
    }
    showToast('복원을 완료했어요.', 2000, 'success');
    window.refreshCurrentTab?.();
    ctx.refresh();
  } catch (err) {
    showToast(err.message || '복원 실패', 2600, 'error');
  }
}

export const backupScreen = {
  id: 'settings-screen-backup',
  title: '데이터 백업/복원',

  async render() {
    const appSettings = await getAppSettings();
    const backup = appSettings.backup;
    return `
      ${sectionHtml('백업 상태', `
        <div class="settings-row">
          <div class="l"><div class="ico">☁️</div><div>
            <div class="name">마지막 백업</div>
            <div class="desc">${backup.lastBackupAt ? `${escHtml(backup.lastBackupAt)} · ${fmtSize(backup.lastBackupSize)} · 로컬 파일` : '아직 백업이 없어요'}</div>
          </div></div>
          ${backup.lastBackupAt ? '<span class="settings-badge ok">✓ 정상</span>' : ''}
        </div>
      `)}

      ${sectionHtml('자동 백업', `
        <div class="settings-toggle-list">
          <div class="settings-toggle-row"><span>자동 백업</span>${switchHtml('auto', backup.auto)}</div>
          <div class="settings-toggle-row"><span>백업 주기</span>
            <select class="tds-select" data-screen-field="intervalDays" aria-label="백업 주기">
              <option value="1" ${backup.intervalDays === 1 ? 'selected' : ''}>매일</option>
              <option value="7" ${backup.intervalDays === 7 ? 'selected' : ''}>매주</option>
              <option value="30" ${backup.intervalDays === 30 ? 'selected' : ''}>매월</option>
            </select>
          </div>
          <div class="settings-toggle-row"><span>Wi-Fi에서만 실행</span>${switchHtml('wifiOnly', backup.wifiOnly)}</div>
          <div class="settings-toggle-row"><span>배터리 부족 시 실행 안 함</span>${switchHtml('skipLowBattery', backup.skipLowBattery)}</div>
        </div>
        <small class="settings-screen-note">웹앱 특성상 자동 백업은 앱 사용 중 주기가 지나면 안내로 대신해요.</small>
      `)}

      ${sectionHtml('수동 작업', `
        <div class="settings-screen-cta-row">
          <button type="button" class="tds-btn" data-screen-action="backup-now">지금 백업</button>
          <button type="button" class="tds-btn secondary" data-screen-action="restore">백업에서 복원</button>
          <input type="file" accept="application/json" data-restore-file hidden>
        </div>
      `)}

      ${sectionHtml('백업 범위', `
        <div class="settings-toggle-list">
          <div class="settings-toggle-row"><span>거래 내역</span>${switchHtml('scope-transactions', backup.scope.transactions)}</div>
          <div class="settings-toggle-row"><span>예산 및 목표</span>${switchHtml('scope-budgets', backup.scope.budgets)}</div>
          <div class="settings-toggle-row"><span>카테고리 규칙</span>${switchHtml('scope-rules', backup.scope.rules)}</div>
          <div class="settings-toggle-row"><span>홈 화면 설정</span>${switchHtml('scope-homeSettings', backup.scope.homeSettings)}</div>
        </div>
      `)}
    `;
  },

  bind(body, ctx) {
    const saveBackupSettings = async () => {
      const field = name => body.querySelector(`[data-screen-field="${name}"]`);
      try {
        const current = await getAppSettings();
        await saveAppSettings({
          backup: {
            ...current.backup,
            auto: !!field('auto')?.checked,
            intervalDays: Number(field('intervalDays')?.value) || 7,
            wifiOnly: !!field('wifiOnly')?.checked,
            skipLowBattery: !!field('skipLowBattery')?.checked,
            scope: {
              transactions: !!field('scope-transactions')?.checked,
              budgets: !!field('scope-budgets')?.checked,
              rules: !!field('scope-rules')?.checked,
              homeSettings: !!field('scope-homeSettings')?.checked,
            },
          },
        });
        showToast('백업 설정을 저장했어요.', 1000, 'success');
      } catch (err) {
        showToast(err.message || '백업 설정 저장 실패', 2400, 'error');
      }
    };
    body.querySelectorAll('[data-screen-field]').forEach(input => {
      input.addEventListener('change', saveBackupSettings);
    });

    body.querySelector('[data-screen-action="backup-now"]')?.addEventListener('click', async () => {
      try {
        await runBackup(ctx);
      } catch (err) {
        showToast(err.message || '백업 실패', 2600, 'error');
      }
    });

    const fileInput = body.querySelector('[data-restore-file]');
    body.querySelector('[data-screen-action="restore"]')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) runRestore(file, ctx);
      fileInput.value = '';
    });
  },
};
