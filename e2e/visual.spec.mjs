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
