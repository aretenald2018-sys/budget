// ================================================================
// e2e/helpers.mjs — 공용 E2E 유틸 (fixture 진입 + 스냅샷 안정화)
// ================================================================

// firebase.js / repositories 는 최상위에서 gstatic Firebase SDK 를 정적 import
// 한다. fixture 모드에선 이 SDK 를 실제로 호출하지 않지만, 모듈 평가가 성공하려면
// import 이름들이 존재해야 한다. 외부 CDN 의존(네트워크 불안정·콘솔 소음)을 없애기
// 위해 gstatic 요청을 로컬 stub 모듈로 가로챈다. 아래 이름은 세 SDK 모듈이 import
// 하는 이름의 합집합이며, fixture 경로에서는 어느 것도 실제로 호출되지 않는다.
const FIREBASE_STUB = `
const noop = () => ({});
export const initializeApp = noop;
export const getFirestore = noop;
export const getAuth = noop;
export const collection = noop;
export const doc = noop;
export const getDoc = noop;
export const getDocs = noop;
export const query = noop;
export const where = noop;
export const orderBy = noop;
export const limit = noop;
export const startAfter = noop;
export const serverTimestamp = noop;
export const setDoc = noop;
export const updateDoc = noop;
export const deleteDoc = noop;
export const addDoc = noop;
export const arrayUnion = noop;
export const writeBatch = noop;
export const onAuthStateChanged = noop;
export const signInWithEmailAndPassword = noop;
export const signOut = noop;
export const Timestamp = { fromDate: (d) => ({ toDate: () => d }) };
`;

const STABILIZE_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
`;

// 콘솔 error 수집기: 무해한 알려진 소음은 allowlist 로 제외한다.
const CONSOLE_ERROR_ALLOWLIST = [
  'DayBird',            // fixture 사용자는 외부 DayBird API 에 접근하지 못함(캐치됨)
  'daybird',
  'favicon',
];

export function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CONSOLE_ERROR_ALLOWLIST.some(token => text.includes(token))) return;
    errors.push(text);
  });
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
  return errors;
}

// fixture 시나리오로 앱 진입 → 홈이 렌더돼 안정될 때까지 대기 → 애니메이션 비활성.
export async function openApp(page, scenario = 'basic') {
  await page.route('**/www.gstatic.com/firebasejs/**', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript; charset=utf-8',
    body: FIREBASE_STUB,
  }));

  // 외부 Vercel API(백그라운드 동기화·DayBird 상태 조회)를 로컬에서 즉시 응답
  // 처리한다. fixture 모드는 외부 데이터가 필요 없고, 실제 원격 호출은 지연·404
  // 리소스 콘솔 error 를 유발한다. 200 빈 JSON 으로 조용히 무력화한다.
  await page.route('**/budget-snowy-iota.vercel.app/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: '{}',
  }));

  await page.goto(`/?fixture=${scenario}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#app:not(.hidden)').waitFor({ state: 'attached', timeout: 15_000 });
  await page.locator('.hd-hero').waitFor({ timeout: 15_000 });
  // 진입 직후 syncAppSettingsOnce 로 홈이 한 번 재렌더될 수 있어 잠깐 안정화.
  await page.waitForTimeout(300);
  await page.addStyleTag({ content: STABILIZE_CSS });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(100);
}

// 탭 진입 트리거는 탭마다 다르다: tx/home/review 는 하단 내비, settings 는 헤더
// 톱니(#btn-settings), report 는 홈 히어로의 '분석 보기'(.hd-analyze) 버튼.
const TAB_TRIGGERS = {
  home: '.bottom-nav button[data-tab="home"]',
  tx: '.bottom-nav button[data-tab="tx"]',
  review: '.bottom-nav button[data-tab="review"]',
  finance: '.bottom-nav button[data-tab="finance"]',
  settings: '#btn-settings',
  report: '.hd-analyze',
};

// 프로그램적 탭 전환(앱의 window.switchTab 사용). 헤더 톱니가 홈 탭에서 숨겨지는
// 등 트리거 가시성 이슈와 무관하게 안정적이라 시각 회귀 진입에 쓴다.
export async function gotoTab(page, tab, readySelector) {
  await page.evaluate(t => window.switchTab(t), tab);
  await page.locator(`#tab-${tab}:not(.hidden)`).waitFor({ timeout: 10_000 });
  if (readySelector) await page.locator(readySelector).first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);
}

// 지정 탭으로 전환 후 탭 컨텐츠가 렌더돼 안정될 때까지 대기.
export async function switchToTab(page, tab, readySelector) {
  const trigger = TAB_TRIGGERS[tab];
  if (!trigger) throw new Error(`알 수 없는 탭 트리거: ${tab}`);
  await page.locator(trigger).first().click();
  await page.locator(`#tab-${tab}:not(.hidden)`).waitFor({ timeout: 10_000 });
  if (readySelector) await page.locator(readySelector).first().waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
}
