// ================================================================
// e2e/home.spec.mjs — 홈 스모크 (fixture=basic / empty)
// ================================================================
import { test, expect } from '@playwright/test';
import { openApp, switchToTab, gotoTab, collectConsoleErrors } from './helpers.mjs';

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

// 신규 사용자(데이터 0)에게 지어낸 수치를 보여주지 않는다.
// 예전에는 하드코딩된 소비 곡선과 DEFAULT_MODEL 플레이스홀더가 그대로 렌더됐다.
test('빈 계정에는 가짜 소비 곡선·목업 수치가 없다 (empty)', async ({ page }) => {
  await openApp(page, 'empty');
  await expect(page.locator('.hd-hero')).toBeVisible();
  const body = await page.locator('#tab-home').innerText();
  for (const mock of ['191,323', '941,323', '344,267', '태우']) {
    expect(body, `목업 값이 남아 있음: ${mock}`).not.toContain(mock);
  }
  // '써도 되는 돈'은 지어낸 곡선 대신 와인병으로 보여준다.
  // 이 시나리오는 예산은 있고 지출만 0이라 병이 가득 차 있는 게 맞다.
  await expect(page.locator('.hd-hero .hd-hero-bottle')).toHaveCount(1);
  await expect(page.locator('.hd-bottle-cap')).toHaveText('100% 남음');
  await expect(page.locator('.hd-hero-chart')).toHaveCount(0);
});

// 이전에는 두 CTA 모두 아무 일도 하지 않거나 엉뚱한 탭으로 이동했다.
test('홈 빈 상태 CTA 가 실제 설정 화면을 연다 (empty)', async ({ page }) => {
  await openApp(page, 'empty');
  await page.locator('.hd-fund-empty').dispatchEvent('click');
  await expect(page.locator('#settings-funds-modal')).toHaveClass(/open/);
  await page.locator('#settings-funds-modal [data-close-settings-modal]').first().dispatchEvent('click');

  await switchToTab(page, 'home', '.hd-hero');
  await page.locator('.hd-goals .hd-more').dispatchEvent('click');
  await expect(page.locator('#settings-screen-budget')).toHaveClass(/open/);
});

// 미분류 거래를 소비처 단위로 한 번에 재분류한다.
test('미분류 목표 카드 → 정리하기 → 소비처 일괄 재분류 (basic)', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openApp(page, 'basic');

  const uncatCta = page.locator('[data-goal-name="미분류"] .hd-goal-set');
  await expect(uncatCta).toHaveText('정리하기');
  await uncatCta.dispatchEvent('click');

  const drill = page.locator('#report-category-modal');
  await expect(drill).toHaveClass(/open/);
  const rows = drill.locator('.report-uncat-row');
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);

  await rows.first().locator('[data-uncat-select]').selectOption('카페비용');
  await rows.first().locator('[data-report-action="apply-uncategorized"]').dispatchEvent('click');

  await expect(drill.locator('.report-uncat-row')).toHaveCount(before - 1);
  expect(errors, `예상치 못한 콘솔 error:\n${errors.join('\n')}`).toEqual([]);
});

// 와인 기록은 정식 탭이며 결제 내역·와인구매 포인트와 연결된다.
test('와인 탭: 결제 내역 인박스에서 와인 등록 폼이 채워진다 (basic)', async ({ page }) => {
  await openApp(page, 'basic');
  await page.locator('.bottom-nav button[data-tab="wine"]').click();
  await expect(page.locator('#tab-wine .wine-cellar-screen')).toBeVisible();
  await expect(page.locator('.wine-ledger-card')).toBeVisible();

  const inbox = page.locator('[data-wine-action="bottle-from-tx"]');
  await expect(inbox.first()).toBeVisible();
  const merchant = (await inbox.first().locator('.wine-inbox-main strong').innerText()).trim();
  await inbox.first().click();

  const form = page.locator('[data-wine-bottle-form]');
  await expect(form).toBeVisible();
  await expect(form.locator('[name="name"]')).toHaveValue(merchant);
  await expect(form.locator('[name="pricePaid"]')).not.toHaveValue('');
  await expect(form.locator('[name="purchaseTxId"]')).not.toHaveValue('');
});

// 예산 화면은 '전체 예산 / 카테고리 목표 / 지출 한도' 세 화면을 합친 것이다.
// 같은 값을 두 곳에서 편집하거나 같은 숫자를 두 번 보여주지 않는지 지킨다.
test('예산 화면: 기간·총액·카테고리·한도가 한 화면에 중복 없이 있다 (basic)', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openApp(page, 'basic');
  await gotoTab(page, 'settings', '.settings-section');
  await page.locator('[data-open-settings-modal="settings-screen-budget"]').first().dispatchEvent('click');
  const screen = page.locator('#settings-screen-budget');
  await expect(screen).toHaveClass(/open/);

  // 합쳐진 세 화면의 요소가 모두 한 화면에 있다
  await expect(screen.locator('[data-screen-field="cycle"]')).toHaveCount(2);      // 격주 / 매월
  await expect(screen.locator('[data-screen-field="amount"]')).toHaveCount(1);     // 변동비 예산
  await expect(screen.locator('[data-stage-default]')).toHaveCount(3);             // 한도 3단계
  const rows = await screen.locator('.settings-budget-row').count();
  expect(rows).toBeGreaterThan(0);
  // 카테고리 목록은 한 벌만 — 예전엔 목표/한도 화면이 각각 그렸다
  await expect(screen.locator('[data-goal-target]')).toHaveCount(rows);
  await expect(screen.locator('[data-screen-action="save"]')).toHaveCount(1);
  // 상한을 앱이 다시 나눠주는 '자동 배분'은 없앴다(내가 정한 상한을 덮어썼다)
  await expect(screen.locator('[data-screen-action="auto-allocate"]')).toHaveCount(0);

  // 같은 금액이 화면에 두 번 이상 나오지 않는다
  const duplicated = await screen.evaluate(node => {
    const counts = {};
    (node.innerText.match(/[\d,]{5,}원/g) || []).forEach(n => { counts[n] = (counts[n] || 0) + 1; });
    return Object.entries(counts).filter(([, c]) => c > 1).map(([n]) => n);
  });
  expect(duplicated, `중복 표출된 금액: ${duplicated.join(', ')}`).toEqual([]);

  expect(errors, `예상치 못한 콘솔 error:\n${errors.join('\n')}`).toEqual([]);
});

// 예산은 변동비에만 건다. 고정비 행은 예산 구역이 아니라 '예산 밖' 구역에 있고,
// 상한 합계에도 들어가지 않는다(예전엔 한 목록에 섞여 총액과 홈 숫자가 어긋났다).
test('예산 화면: 고정비는 변동비 예산 밖에 따로 있다 (basic)', async ({ page }) => {
  await openApp(page, 'basic');
  await gotoTab(page, 'settings', '.settings-section');
  await page.locator('[data-open-settings-modal="settings-screen-budget"]').first().dispatchEvent('click');
  const screen = page.locator('#settings-screen-budget');

  const fixedRows = screen.locator('.settings-budget-row.fixed');
  await expect(fixedRows).not.toHaveCount(0);
  // 고정비 행에는 사용률/개별 한도가 없다 — 예산에 걸리지 않으니 한도도 의미가 없다
  await expect(fixedRows.locator('[data-usage-pct]')).toHaveCount(0);
  await expect(fixedRows.locator('[data-stage-override]')).toHaveCount(0);

  // 상한 합계는 변동비 행만 더한 값이다
  const { line, variableSum } = await screen.evaluate(node => {
    const read = el => Math.round(Number(String(el.value || '').replace(/[^\d]/g, '')) || 0);
    return {
      line: node.querySelector('[data-caps-line]').innerText,
      variableSum: [...node.querySelectorAll('.settings-budget-row:not(.fixed) [data-goal-target]')]
        .reduce((sum, el) => sum + read(el), 0),
    };
  });
  expect(line).toContain(variableSum.toLocaleString('ko-KR'));
});

// 격주를 고르면 예산 금액도 2주 단위로 입력한다(저장은 월 기준으로 환산).
test('예산 금액을 선택한 주기 단위로 입력한다 (basic)', async ({ page }) => {
  await openApp(page, 'basic');
  await gotoTab(page, 'settings', '.settings-section');
  await page.locator('[data-open-settings-modal="settings-screen-budget"]').first().dispatchEvent('click');
  const screen = page.locator('#settings-screen-budget');

  await expect(screen.locator('[data-amount-label]')).toHaveText('2주 변동비 예산');
  await screen.locator('[data-screen-field="amount"]').fill('1275000');
  await screen.locator('[data-screen-field="amount"]').dispatchEvent('input');
  await expect(screen.locator('[data-amount-converted]')).toContainText('2,550,000');

  // 매월로 바꾸면 라벨과 시작일 입력이 함께 바뀌고, 월 환산 안내는 사라진다
  await screen.locator('[data-screen-field="cycle"][value="monthly"]').dispatchEvent('click');
  await expect(screen.locator('[data-amount-label]')).toHaveText('월 변동비 예산');
  await expect(screen.locator('[data-amount-converted]')).toHaveText('');
  await expect(screen.locator('[data-cycle-detail="monthly"]')).toBeVisible();
  await expect(screen.locator('[data-cycle-detail="biweekly"]')).toBeHidden();
});

// 포인트: 지난달 일 평균보다 적게 쓴 날마다 '목표 금액 × 하루 적립률'을 적립한다.
// 무지출 데이 같은 주간 미션은 이 규칙과 무관해 전부 걷어냈다.
test('포인트 화면: 성공한 날 정액 적립이고 미션은 없다 (basic)', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openApp(page, 'basic');
  await gotoTab(page, 'settings', '.settings-section');
  await page.locator('[data-open-settings-modal="settings-screen-points"]').first().dispatchEvent('click');
  const screen = page.locator('#settings-screen-points');
  await expect(screen).toHaveClass(/open/);

  // 적립 항목마다 하루 적립률·목표 금액을 직접 정한다
  const rows = screen.locator('[data-point-item-id]');
  await expect(rows).not.toHaveCount(0);
  await expect(rows.first().locator('[data-point-rate]')).toHaveCount(1);
  await expect(rows.first().locator('[data-point-target]')).toHaveCount(1);

  // 성공한 날 적립액 = 목표 금액 × 하루 적립률 (입력을 바꾸면 즉시 따라온다)
  await rows.first().locator('[data-point-rate]').fill('2');
  await rows.first().locator('[data-point-rate]').dispatchEvent('input');
  await rows.first().locator('[data-point-target]').fill('120000');
  await rows.first().locator('[data-point-target]').dispatchEvent('input');
  await expect(rows.first().locator('[data-point-daily]')).toHaveText('2,400P');

  // 걷어낸 미션 UI 가 되살아나지 않는다
  await expect(screen.getByText('무지출', { exact: false })).toHaveCount(0);
  await expect(screen.locator('[data-screen-field="autoJoin"]')).toHaveCount(0);
  await expect(screen.locator('[data-screen-field="difficulty"]')).toHaveCount(0);

  expect(errors, `예상치 못한 콘솔 error:\n${errors.join('\n')}`).toEqual([]);
});

// ── 설정 → 화면 반응 ────────────────────────────────────────────────
// 오늘 가장 비쌌던 결함이 이 유형이다: 설정에 값을 넣어도 홈 숫자가 꿈쩍하지
// 않았다. budget.amount 는 저장되지만 홈이 읽지 않았고, 그 차액이 정체불명의
// '미배정'으로 표시됐다. 구조 검사로는 원리적으로 못 잡으니 여기서 잡는다.
test('설정에서 변동비 예산을 바꾸면 홈 숫자가 따라 움직인다 (basic)', async ({ page }) => {
  await openApp(page, 'basic');

  const heroAmount = () => page.locator('.hd-hero .hd-hero-amount').innerText();
  const before = await heroAmount();

  await gotoTab(page, 'settings', '.settings-section');
  await page.locator('[data-open-settings-modal="settings-screen-budget"]').first().dispatchEvent('click');
  const screen = page.locator('#settings-screen-budget');
  await expect(screen).toHaveClass(/open/);

  // 2주 변동비 예산을 크게 올린다 → '써도 되는 돈'도 그만큼 올라야 한다
  await screen.locator('[data-screen-field="amount"]').fill('900000');
  await screen.locator('[data-screen-field="amount"]').dispatchEvent('input');
  await screen.locator('[data-screen-action="save"]').dispatchEvent('click');
  await expect(screen).not.toHaveClass(/open/);

  await gotoTab(page, 'home', '.hd-hero');
  const after = await heroAmount();
  expect(after, '예산을 바꿨는데 홈 히어로 금액이 그대로다 — 설정이 화면에 연결되지 않았다').not.toBe(before);

  const won = text => Number(String(text).replace(/[^\d-]/g, '')) * (String(text).includes('−') || String(text).includes('-') ? -1 : 1);
  expect(won(after)).toBeGreaterThan(won(before));
});

// 카테고리 추가가 '아무 일도 안 일어남'으로 보였던 진짜 이유: 저장이 네이티브 GET
// 전송으로 나가면서 페이지가 통째로 새로고침됐다(?id=&name=... 로 URL 이 바뀌고 앱이
// 초기화). submit 핸들러가 `event.target.id !== 'category-form'` 로 폼을 가렸는데,
// 이 폼의 <input name="id"> 가 HTMLFormElement 의 named getter 로 form.id 를 덮어써
// 비교가 항상 실패했고 preventDefault 가 걸리지 않았다.
test('예산 화면에서 카테고리를 추가하면 페이지가 새로고침되지 않고 목록에 남는다 (basic)', async ({ page }) => {
  await openApp(page, 'basic');
  await gotoTab(page, 'settings', '.settings-section');
  await page.locator('[data-open-settings-modal="settings-screen-budget"]').first().dispatchEvent('click');
  const screen = page.locator('#settings-screen-budget');
  await expect(screen).toHaveClass(/open/);

  const urlBefore = page.url();
  const rowsBefore = await screen.locator('.settings-budget-row').count();

  await screen.locator('[data-screen-action="add-category"]').dispatchEvent('click');
  const form = page.locator('#category-form');
  await expect(page.locator('#category-modal')).toHaveClass(/open/);
  await form.locator('[name="name"]').fill('테스트항목');
  await form.locator('[name="target"]').fill('30000');
  await form.locator('button[type="submit"]').dispatchEvent('click');

  // 폼 전송이 네이티브로 새어나가면 여기서 URL 이 ?id=&name=... 로 바뀐다
  await expect(page.locator('#category-modal')).not.toHaveClass(/open/);
  expect(page.url(), '카테고리 저장이 네이티브 폼 전송으로 새어나가 페이지가 새로고침됐다').toBe(urlBefore);
  await expect(page.locator('#app')).not.toHaveClass(/hidden/);

  await page.locator('[data-open-settings-modal="settings-screen-budget"]').first().dispatchEvent('click');
  await expect(screen.locator('.settings-budget-row')).toHaveCount(rowsBefore + 1);
  await expect(screen.getByText('테스트항목')).toHaveCount(1);
});

// 홈 '고정비' KPI 와 설정 > 예산의 고정비 구역은 같은 두 숫자(이번 달 나간 돈 ·
// 적어둔 월 고정 금액)를 말해야 한다. 예전에는 홈이 '나간 돈'만, 설정이 '적어둔 금액'만
// 보여줘서 두 화면의 고정비가 영영 어긋나 보였다.
test('홈 고정비 KPI 와 설정 예산의 고정비가 같은 숫자를 말한다 (basic)', async ({ page }) => {
  await openApp(page, 'basic');
  const won = text => Number(String(text).replace(/[^\d]/g, ''));

  await gotoTab(page, 'settings', '.settings-section');
  await page.locator('[data-open-settings-modal="settings-screen-budget"]').first().dispatchEvent('click');
  const summary = page.locator('#settings-screen-budget .settings-fixed-summary');
  await expect(summary).toHaveCount(1);
  const settingsUsed = won(await summary.locator('strong').innerText());
  const settingsPlanned = won(await summary.locator('span').innerText());
  expect(settingsUsed).toBeGreaterThan(0);
  expect(settingsPlanned).toBeGreaterThan(0);

  await page.locator('#settings-screen-budget [data-close-settings-modal]').dispatchEvent('click');
  await gotoTab(page, 'home', '.hd-hero');
  const kpi = page.locator('.hd-kpi', { hasText: '고정비' }).first();
  // KPI 칩은 폭이 좁아 만원 단위로 줄여 쓴다 — 줄인 값이 같은 원본에서 나왔는지 본다.
  const short = n => `${Math.floor(n / 10000)}만원`;
  await expect(kpi.locator('.hd-kpi-value')).toHaveText(short(settingsUsed));
  await expect(kpi.locator('.hd-kpi-sub')).toHaveText(`${short(settingsPlanned).replace('원', '')} 예정`);
});
