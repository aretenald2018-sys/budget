import {
  saveSharedPaymentRule,
  deleteSharedPaymentRule,
  saveCategoryMonthlyTarget,
  saveCategoryBudgetRhythm,
  saveAppSettings,
} from '../../data.js';
import {
  DEFAULT_REWARD_SAVINGS_SETTINGS,
  appendRewardPointRow,
  readRewardSettingsForm,
} from './rewards/index.js';
import { bindSettingsEvents } from './events.js';
import { settingsState as STATE } from './state.js';
import { androidBridge, androidFlushResultText } from './android-capture.js';
import { $ } from '../../utils/dom.js';
import { showToast } from '../../utils/toast.js';

let renderSettings = async () => {};
let refreshRewardWidgetSnapshot = async () => {};

export function bindSettingsController(root, budgetMonth, callbacks = {}) {
  renderSettings = callbacks.renderSettings || renderSettings;
  refreshRewardWidgetSnapshot = callbacks.refreshRewardWidgetSnapshot || refreshRewardWidgetSnapshot;
  bindSettingsEvents(root, handleSettingsAction);
  bindBudgetGoalControls(budgetMonth);
  bindSharedRuleControls();
  bindAppSettingControls();
}

function handleSettingsAction(action, target) {
  document.dispatchEvent(new CustomEvent('budget:app-action', {
    detail: action === 'navigate'
      ? { action, tab: target.dataset.tab }
      : { action },
  }));
}

function bindAppSettingControls() {
  document.querySelector('[data-category-add]')?.addEventListener('click', () => {
    window.openCategoryModal?.();
  });
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
      const current = new Set(STATE.managedCategoryIds);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      const homeManagedCategoryIds = Array.from(current).slice(0, 8);
      try {
        STATE.managedCategoryIds = homeManagedCategoryIds;
        await saveAppSettings({ homeManagedCategoryIds });
        showToast('홈 관리 카테고리를 저장했어요.', 1200, 'success');
        renderSettings();
        if (window.refreshCurrentTab) window.refreshCurrentTab();
      } catch (err) {
        showToast(err.message || '홈 카테고리 저장 실패', 2200, 'error');
      }
    });
  });

  const rewardForm = $('#reward-settings-form');
  rewardForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const rewardSavings = readRewardSettingsForm(event.currentTarget);
    try {
      await saveAppSettings({ rewardSavings });
      await refreshRewardWidgetSnapshot();
      showToast('보상 적립 설정을 저장했어요.', 1400, 'success');
      renderSettings();
      window.refreshCurrentTab?.();
    } catch (err) {
      showToast(err.message || '보상 적립 설정 저장 실패', 2200, 'error');
    }
  });
  rewardForm?.addEventListener('click', (event) => {
    const actionTarget = event.target?.closest?.('[data-reward-point-action]');
    if (!actionTarget || !rewardForm.contains(actionTarget)) return;
    event.preventDefault();
    if (actionTarget.dataset.rewardPointAction === 'add') {
      appendRewardPointRow(rewardForm);
      return;
    }
    if (actionTarget.dataset.rewardPointAction === 'delete') {
      const row = actionTarget.closest('[data-reward-point-row]');
      const list = row?.closest('[data-reward-point-list]');
      row?.remove();
      if (list && !list.querySelector('[data-reward-point-row]')) {
        list.innerHTML = '<div class="reward-point-empty" data-reward-point-empty>포인트 항목이 없습니다.</div>';
      }
    }
  });
  $('#reward-settings-reset')?.addEventListener('click', async () => {
    try {
      await saveAppSettings({ rewardSavings: DEFAULT_REWARD_SAVINGS_SETTINGS });
      await refreshRewardWidgetSnapshot();
      showToast('보상 적립 설정을 초기화했어요.', 1400, 'success');
      renderSettings();
      window.refreshCurrentTab?.();
    } catch (err) {
      showToast(err.message || '보상 적립 초기화 실패', 2200, 'error');
    }
  });

  $('#android-open-notification-settings')?.addEventListener('click', () => {
    const bridge = androidBridge();
    if (!bridge?.openNotificationAccessSettings) {
      showToast('Android APK에서만 열 수 있어요.', 1800, 'error');
      return;
    }
    bridge.openNotificationAccessSettings();
  });

  $('#android-capture-flush')?.addEventListener('click', async () => {
    try {
      const result = await window.flushAndroidNotificationCaptures?.({ silent: true });
      if (!result) throw new Error('Android bridge 없음');
      const message = androidFlushResultText(result);
      showToast(message, 2200, result.failed ? 'error' : (result.saved || result.duplicate ? 'success' : 'info'));
      setTimeout(renderSettings, 300);
    } catch (err) {
      showToast(err.message || '알림 반영 실패', 2200, 'error');
    }
  });

  $('#android-sms-permission')?.addEventListener('click', () => {
    const bridge = androidBridge();
    if (!bridge?.requestSmsReadPermission) {
      showToast('Android APK에서만 요청할 수 있어요.', 1800, 'error');
      return;
    }
    bridge.requestSmsReadPermission();
  });
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
  document.querySelectorAll('[data-category-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.openCategoryModal?.(btn.dataset.categoryEditId);
    });
  });
}
