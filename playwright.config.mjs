// ================================================================
// playwright.config.mjs — E2E 스모크 + 시각 회귀 설정
// ================================================================
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 4321;
const BASE_URL = `http://localhost:${PORT}`;

// 이 실행 환경은 Chromium 이 /opt/pw-browsers 에 사전 설치돼 있고 버전이
// Playwright 기본 리비전과 어긋날 수 있다. 사전 설치 바이너리가 있으면 그걸
// 직접 쓰고(절대 `playwright install` 금지), 없으면(CI ubuntu) 기본 경로를 쓴다.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined;

// 4개 프로젝트 = viewport 너비 320/360/390/412 (높이 ~740). 모바일 UA 불필요.
const WIDTHS = [320, 360, 390, 412];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  // 시각 회귀 픽셀 diff 게이팅: 폰트/안티에일리어싱 미세차를 소량 흡수.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    baseURL: BASE_URL,
    timezoneId: 'Asia/Seoul',
    locale: 'ko-KR',
    reducedMotion: 'reduce',
    trace: 'on-first-retry',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: WIDTHS.map(width => ({
    name: `w${width}`,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width, height: 740 },
      launchOptions: executablePath ? { executablePath } : {},
    },
  })),
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
