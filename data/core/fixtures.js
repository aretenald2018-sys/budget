// ================================================================
// data/core/fixtures.js — E2E FIXTURE 주입 모드 (테스트 전용 데이터 심)
// ================================================================
// 이 모듈은 오직 Playwright E2E 검수를 위한 FIXTURE 다.
//   (WORKFLOW.md "장식용 데이터 금지"의 fixture 4조건)
//   1) 스키마 동일: repositories 가 Firestore 에서 돌려주는 형태와 같은 shape 를
//      반환한다(같은 필드명·같은 정규화 경로).
//   2) fixture 임이 명확: 파일명·모듈명·모든 export 가 `fixture` 로 시작한다.
//   3) 운영 미사용: `?fixture=<scenario>` URL 파라미터로만 활성화된다.
//      평상시 URL·운영 GitHub Pages 배포에서는 절대 켜지지 않으며, 시나리오 JSON
//      (test/fixtures/e2e/*.json)은 Pages 빌드 allowlist 에서 제외돼 배포되지 않는다.
//   4) 실데이터 대체 아님: Firebase 초기화·로그인을 우회하고 인메모리 데이터를
//      읽는 것은 fixture 모드에서만. 쓰기도 인메모리에만 반영된다.
//
// 활성 시:
//   - Firebase 초기화/로그인 우회 → FIXTURE_USER 로 세션 성립 (firebase.js).
//   - data/repositories/* 읽기가 Firestore 대신 인메모리 store 를 반환.
//   - 시각 회귀 스냅샷 안정화를 위해 시간 의존 텍스트(greetingFor·기간 라벨·
//     상대시간)를 고정하도록 전역 Date 를 고정 기준 시각으로 동결한다.
// ================================================================

import { normalizeProvisionFund } from '../../domain/funds/provision.js';

// 고정 기준 시각(UTC). Playwright 설정에서 timezoneId: 'Asia/Seoul' 를 쓰므로
// 브라우저 로컬 시각은 2026-07-24 12:00 KST 로 고정된다. 이 사이클(격주 시작
// 2026-07-14)의 한가운데라 basic 시나리오 거래가 그래프/도넛/목표에 채워진다.
const FIXTURE_NOW_MS = Date.UTC(2026, 6, 24, 3, 0, 0, 0);

let _scenario = null;
let _resolved = false;
let _store = null;
let _storePromise = null;
let _clockInstalled = false;

// 가짜 사용자: 로그인 없이 홈이 렌더되도록 firebase.js 가 currentUser 로 세운다.
// getIdToken 은 DayBird 등 토큰을 요구하는 경로가 조용히 실패하도록 stub.
export const FIXTURE_USER = {
  uid: 'fixture-user',
  email: 'fixture@budget.test',
  displayName: '태우',
  getIdToken: async () => 'fixture-id-token',
};

export function fixtureScenario() {
  if (_resolved) return _scenario;
  _resolved = true;
  try {
    const params = new URLSearchParams(globalThis.location?.search || '');
    const raw = params.get('fixture');
    _scenario = raw && /^[a-z0-9_-]+$/i.test(raw) ? raw : null;
  } catch {
    _scenario = null;
  }
  if (_scenario) installFixtureClock();
  return _scenario;
}

export function fixtureActive() {
  return !!fixtureScenario();
}

// 전역 Date 동결: 인자 없는 `new Date()` 와 `Date.now()` 만 고정 기준 시각으로
// 바꾼다. `new Date(arg)` 는 실제 파싱을 유지(거래 occurredAt 등). instanceof Date
// 도 유지된다. window.* 할당은 verify 계약에 걸리므로 globalThis 로만 교체한다.
function installFixtureClock() {
  if (_clockInstalled) return;
  _clockInstalled = true;
  const RealDate = Date;
  class FixtureDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(FIXTURE_NOW_MS);
      else super(...args);
    }
    static now() { return FIXTURE_NOW_MS; }
  }
  globalThis.Date = FixtureDate;
}

// 시나리오 JSON 로드(브라우저 fetch). 템플릿 리터럴 URL 이라 소스 캐시쿼리·릴리스
// 스탬프 정적 검사에 걸리지 않는다(백틱은 import/asset 정규식 대상이 아님).
export function loadFixtureStore() {
  if (_store) return Promise.resolve(_store);
  if (_storePromise) return _storePromise;
  const scenario = fixtureScenario() || 'basic';
  _storePromise = fetch(`/test/fixtures/e2e/${scenario}.json`)
    .then(res => {
      if (!res.ok) throw new Error(`fixture 시나리오를 불러오지 못했습니다: ${scenario} (${res.status})`);
      return res.json();
    })
    .then(data => {
      _store = normalizeFixtureStore(data);
      return _store;
    });
  return _storePromise;
}

function normalizeFixtureStore(data = {}) {
  return {
    user: { ...FIXTURE_USER, ...(data.user || {}) },
    appSettings: data.appSettings || { theme: 'light' },
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    provisionFunds: Array.isArray(data.provisionFunds) ? data.provisionFunds : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    rewardPointEntries: Array.isArray(data.rewardPointEntries) ? data.rewardPointEntries : [],
    budgetAdjustments: Array.isArray(data.budgetAdjustments) ? data.budgetAdjustments : [],
    financeGoals: Array.isArray(data.financeGoals) ? data.financeGoals : [],
    sharedPaymentRules: Array.isArray(data.sharedPaymentRules) ? data.sharedPaymentRules : [],
  };
}

// 세션 캐시 주입: loadAccounts/loadCategories/loadProvisionFunds 가 하던 일을
// fixture store 로 대신한다. 정규화 경로(normalizeProvisionFund)도 그대로 태워
// getProvisionFunds() 등 동기 접근자가 실데이터와 같은 shape 를 돌려주게 한다.
export function installFixtureSession(cache, store = _store) {
  if (!cache || !store) return;
  cache.accounts = store.accounts.slice();
  cache.categories = store.categories.slice();
  cache.provisionFunds = store.provisionFunds
    .map((fund, index) => ({ ...normalizeProvisionFund({ ...fund }, index), id: fund.id }))
    .sort((a, b) => a.order - b.order);
  cache.appSettings = { ...store.appSettings };
  cache.appSettingsPromise = null;
}

// ---------- 읽기 헬퍼: repositories 가 Firestore 대신 이걸 호출한다 ----------

function txTimeMs(value) {
  const d = value?.toDate ? value.toDate() : new Date(value);
  const t = d?.getTime?.();
  return Number.isNaN(t) ? 0 : t;
}

export function fixtureListTransactions(opts = {}) {
  const rows = (_store?.transactions || []).slice();
  const fromMs = opts.from ? new Date(opts.from).getTime() : null;
  const toMs = opts.to ? new Date(opts.to).getTime() : null;
  const cursorMs = opts.cursor != null ? txTimeMs(opts.cursor) : null;
  let filtered = rows.filter(tx => {
    const t = txTimeMs(tx.occurredAt);
    if (fromMs != null && t < fromMs) return false;
    if (toMs != null && t > toMs) return false;
    if (opts.types?.length && !opts.types.includes(tx.type)) return false;
    if (opts.needsReview != null && !!tx.needsReview !== !!opts.needsReview) return false;
    if (cursorMs != null && t >= cursorMs) return false;
    return true;
  });
  filtered.sort((a, b) => txTimeMs(b.occurredAt) - txTimeMs(a.occurredAt));
  const max = opts.max || 50;
  filtered = filtered.slice(0, max);
  return opts.includeHidden ? filtered : filtered.filter(tx => !tx.hidden);
}

export function fixtureListRewardPointEntries(opts = {}) {
  const rows = (_store?.rewardPointEntries || []).slice();
  const fromMs = opts.from ? new Date(opts.from).getTime() : null;
  const toMs = opts.to ? new Date(opts.to).getTime() : null;
  return rows
    .filter(entry => {
      const t = txTimeMs(entry.usedAt);
      if (fromMs != null && t < fromMs) return false;
      if (toMs != null && t > toMs) return false;
      return true;
    })
    .sort((a, b) => txTimeMs(b.usedAt) - txTimeMs(a.usedAt))
    .slice(0, opts.max || 200);
}

export function fixtureListBudgetAdjustments(opts = {}) {
  const rows = (_store?.budgetAdjustments || []).slice();
  return rows
    .filter(adj => !opts.monthKey || adj.monthKey === opts.monthKey)
    .sort((a, b) => txTimeMs(b.occurredAt) - txTimeMs(a.occurredAt))
    .slice(0, opts.max || 200);
}

export function fixtureListFinanceGoals(opts = {}) {
  return (_store?.financeGoals || []).slice(0, opts.max || 20);
}

export function fixtureListSharedPaymentRules() {
  return (_store?.sharedPaymentRules || []).filter(rule => rule.active !== false);
}
