// ================================================================
// e2e/visual.spec.mjs — 시각 회귀 (픽셀 diff CI 게이팅)
// fixture=basic 으로 홈·거래·설정·리포트 탭 전체 페이지 스냅샷.
// 시간 의존 텍스트는 fixture 심의 고정 기준 시각(2026-07-24 12:00 KST)으로
// 결정론화된다. 애니메이션/트랜지션은 openApp 에서 비활성.
// ================================================================
import { test, expect } from '@playwright/test';
import { openApp, gotoTab } from './helpers.mjs';

test('홈 탭 전체 페이지 스냅샷', async ({ page }) => {
  await openApp(page, 'basic');
  await expect(page.locator('.hd-hero')).toBeVisible();
  await expect(page).toHaveScreenshot('home.png', { fullPage: true });
});

test('거래(tx) 탭 전체 페이지 스냅샷', async ({ page }) => {
  await openApp(page, 'basic');
  await gotoTab(page, 'tx', '#tx-hero-summary');
  await expect(page).toHaveScreenshot('tx.png', { fullPage: true });
});

test('설정(settings) 탭 전체 페이지 스냅샷', async ({ page }) => {
  await openApp(page, 'basic');
  await gotoTab(page, 'settings', '.settings-section');
  await expect(page).toHaveScreenshot('settings.png', { fullPage: true });
});

test('리포트(report) 탭 전체 페이지 스냅샷', async ({ page }) => {
  await openApp(page, 'basic');
  await gotoTab(page, 'report', '#tab-report .report-hero-card');
  await expect(page).toHaveScreenshot('report.png', { fullPage: true });
});

// 설정 10화면 drill-in 대표 스냅샷 (01 전체 예산 · 06 주간 리포트).
// 나머지 화면은 동일 프레임(스크린 레지스트리)을 공유하므로 대표 2종으로 게이팅.
async function openSettingsDrillScreen(page, id) {
  await gotoTab(page, 'settings', '.settings-section');
  await page.click(`[data-open-settings-modal="${id}"]`);
  const overlay = page.locator(`#${id}`);
  await overlay.locator('.settings-screen-section').first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
  return overlay;
}

test('설정 01 전체 예산 화면 스냅샷', async ({ page }) => {
  await openApp(page, 'basic');
  const overlay = await openSettingsDrillScreen(page, 'settings-screen-budget');
  await expect(overlay.locator('.tds-modal-sheet')).toHaveScreenshot('settings-screen-budget.png');
});

test('설정 06 주간 리포트 화면 스냅샷', async ({ page }) => {
  await openApp(page, 'basic');
  const overlay = await openSettingsDrillScreen(page, 'settings-screen-weekly');
  await expect(overlay.locator('.tds-modal-sheet')).toHaveScreenshot('settings-screen-weekly.png');
});
