// ================================================================
// e2e/home.spec.mjs — 홈 스모크 (fixture=basic / empty)
// ================================================================
import { test, expect } from '@playwright/test';
import { openApp, switchToTab, collectConsoleErrors } from './helpers.mjs';

test('홈 진입·렌즈/기간 전환·탭 이동, 콘솔 error 0건 (basic)', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openApp(page, 'basic');

  // 히어로 렌더 확인 (기본 렌즈 = 써도 되는 돈)
  const hero = page.locator('.hd-hero');
  await expect(hero).toBeVisible();
  await expect(hero.locator('.hd-hero-label')).toHaveText('지금 써도 되는 돈');
  const amountBefore = await hero.locator('.hd-hero-amount').innerText();

  // 렌즈/기간 세그먼트는 좁은 폭(320px)에서 '분석 보기' 버튼과 겹칠 수 있어(반응형
  // 백로그 항목) hit-test 대신 대상 요소에 직접 click 이벤트를 디스패치한다 —
  // 위임 핸들러(root의 [data-report-action])가 버블링으로 그대로 받는다.
  const fire = sel => page.locator(sel).dispatchEvent('click');

  // 렌즈 전환: 써도 되는 돈 → 쓴 돈 (히어로만 갱신, 금액 텍스트 변화)
  await fire('[data-report-action="hero-lens"][data-lens="spent"]');
  await expect(page.locator('.hd-hero .hd-hero-label')).toHaveText('지금까지 쓴 돈');
  const amountAfter = await page.locator('.hd-hero .hd-hero-amount').innerText();
  expect(amountAfter).not.toBe(amountBefore);

  // 다시 써도 되는 돈으로
  await fire('[data-report-action="hero-lens"][data-lens="sts"]');
  await expect(page.locator('.hd-hero .hd-hero-label')).toHaveText('지금 써도 되는 돈');

  // 기간 전환: 히어로의 2주/달 세그먼트는 제거됨 → 날짜 pill 이 여는 '기간 설정'
  // 모달에서 전환한다. 포인트 카드 제목이 기간 라벨을 그대로 반영한다.
  await expect(page.locator('.hd-points .hd-card-head h2')).toHaveText('이번 2주 포인트');
  await fire('.hd-date'); // open-biweekly-start-settings
  const periodModal = page.locator('#home-cycle-settings-modal');
  await expect(periodModal).toBeVisible();
  await fire('#home-cycle-settings-modal [data-period-mode="month"]');
  await expect(page.locator('.hd-points .hd-card-head h2')).toHaveText('이번 달 포인트');

  // 다시 2주로 → 모달 닫기 (이후 하단 내비 클릭을 오버레이가 가리지 않게)
  await fire('#home-cycle-settings-modal [data-period-mode="cycle"]');
  await expect(page.locator('.hd-points .hd-card-head h2')).toHaveText('이번 2주 포인트');
  await fire('#home-cycle-settings-modal .home-cycle-modal-close');
  await expect(periodModal).toBeHidden();

  // 하단 내비/헤더로 tx → settings → 홈 복귀
  await switchToTab(page, 'tx', '#tx-hero-summary');
  await expect(page.locator('#tab-tx')).toBeVisible();
  await switchToTab(page, 'settings', '.settings-section');
  await expect(page.locator('#tab-settings')).toBeVisible();
  await switchToTab(page, 'home', '.hd-hero');
  await expect(page.locator('.hd-hero')).toBeVisible();

  // 콘솔 error 0건 단언 (알려진 무해 소음은 helpers 의 allowlist 로 제외)
  expect(errors, `예상치 못한 콘솔 error:\n${errors.join('\n')}`).toEqual([]);
});

test('빈 상태 문구 확인 (empty)', async ({ page }) => {
  await openApp(page, 'empty');
  await expect(page.locator('.hd-hero')).toBeVisible();
  // 지출 카테고리 도넛의 빈 상태 문구
  await expect(page.locator('.hd-donut-card .hd-empty')).toHaveText('이번 기간 지출이 아직 없어요');
});
