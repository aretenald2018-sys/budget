# E2E 검수 가이드 (Playwright)

이 문서는 Playwright 기반 브라우저 검수 인프라의 사용법을 설명한다. 스모크(핵심 흐름
동작)와 시각 회귀(픽셀 diff 게이팅)를 함께 다룬다. `docs/ai/DEFINITION_OF_DONE.md`
의 "검수" 항목("AI가 브라우저에서 직접 실행·클릭해서 확인")을 실제로 뒷받침하는 도구다.

## 무엇을 검수하나

- **스모크** (`e2e/home.spec.mjs`): 홈 진입 → 히어로 렌더 → 렌즈(써도 되는 돈 ↔ 쓴
  돈) 전환 → 기간(2주 ↔ 달) 전환 → 하단 내비/헤더로 거래·설정 탭 이동 후 홈 복귀 →
  **콘솔 error 0건 단언**. 빈 상태(`empty` 시나리오) 문구도 확인한다.
- **시각 회귀** (`e2e/visual.spec.mjs`): 홈·거래(tx)·설정(settings)·리포트(report)
  탭 전체 페이지 스냅샷을 `toHaveScreenshot()` 로 비교한다. 픽셀 diff 가 나면 CI 가
  **실패**한다(의도된 게이팅).
- 4개 viewport 너비에서 실행: **320 / 360 / 390 / 412px** (높이 740). 각 너비가
  별도 Playwright 프로젝트(`w320`…`w412`)다.

## 로컬 실행법

```bash
npm run test:e2e            # 스모크 + 시각 회귀 전부 (4개 viewport)
npx playwright test e2e/home.spec.mjs          # 스모크만
npx playwright test --project=w390             # 특정 너비만
npx playwright test -g "빈 상태"                # 이름으로 필터
npx playwright show-report                     # 마지막 실행 HTML 리포트 보기
```

- **Windows 로컬은 최초 1회 브라우저 설치가 필요하다:**

  ```bash
  npx playwright install chromium
  ```

  (원격/CI 실행 환경 중 Chromium 이 사전 설치된 곳에서는 설치하지 말 것. 설정
  `playwright.config.mjs` 가 `/opt/pw-browsers/chromium` 이 있으면 그것을 직접
  쓰고, 없으면 기본 경로를 쓴다.)

- 정적 서버는 `scripts/e2e-server.mjs`(node `http` 모듈, 저장소 루트 서빙)가
  Playwright `webServer` 로 자동 기동된다. python 의존이 없다.

## fixture 모드 (`?fixture=<scenario>`)

이 앱은 실제 Firebase/Firestore + 이메일 로그인을 쓴다. E2E 는 로그인·네트워크 없이
결정론적 데이터로 화면을 그리기 위해 **fixture 주입 모드**를 사용한다.

- URL 파라미터 `?fixture=<scenario>` 로만 활성화된다. 예: `/?fixture=basic`.
  평상시 URL·운영 GitHub Pages 배포에는 **아무 영향이 없다.**
- 활성 시 (`data/core/fixtures.js`):
  1. `data/core/firebase.js` 가 Firebase 초기화·로그인 흐름을 우회하고 가짜 사용자
     (`FIXTURE_USER`)로 세션을 세운다.
  2. `data/repositories/*` 의 읽기(`listTransactions`, `listRewardPointEntries`,
     `listBudgetAdjustments`, `listFinanceGoals`, `listSharedPaymentRules`)가
     Firestore 대신 `test/fixtures/e2e/<scenario>.json` 의 인메모리 데이터를 돌려준다.
     동기 접근자(`getCategories`/`getProvisionFunds`/`getAppSettings`)는 세션 캐시에
     주입된 fixture 데이터를 읽는다.
  3. 쓰기는 인메모리에만 반영된다(운영 데이터에 도달하지 않는다).
- **시간 고정:** 시각 회귀 안정성을 위해 fixture 모드는 전역 `Date` 를 고정 기준
  시각(2026-07-24 12:00 KST)으로 동결한다. 인사말(`greetingFor`)·기간 라벨·상대
  시간 등 시간 의존 텍스트가 결정론화된다. (Playwright 는 `timezoneId: 'Asia/Seoul'`
  로 실행한다.)
- 시나리오 2종:
  - `basic`: 2주 사이클 내 다양한 카테고리의 지출 + 수입 + 예산·충당금·목표 설정.
    그래프·도넛·목표가 채워진다.
  - `empty`: 거래 없음. 빈 상태 확인용.

fixture 파일은 `WORKFLOW.md` "장식용 데이터 금지"의 fixture 4조건(스키마 동일 /
fixture 임 명확 / 운영 미사용 / 실데이터 대체 아님)을 만족한다. 시나리오 JSON 은
Pages 빌드 allowlist 에서 제외돼 운영 산출물(`_site`)에 포함되지 않는다.

## 시나리오 추가법

1. `test/fixtures/e2e/<이름>.json` 을 만든다. 스키마는 `basic.json` / `empty.json`
   을 복제해 맞춘다. 필드명은 리포지토리가 돌려주는 형태와 동일해야 한다
   (`transactions[].type`/`amount`/`occurredAt`/`category`, `categories[]`,
   `provisionFunds[]`, `financeGoals[]`, `appSettings`, …).
   - `occurredAt` 은 고정 기준 시각(2026-07-24) 근처의 ISO 문자열로 둔다. 홈 2주
     사이클은 `appSettings.biweeklyStartDate` 기준이다.
2. 스펙에서 `openApp(page, '<이름>')` 로 진입한다.
3. 시각 스냅샷이 필요하면 아래 "베이스라인 갱신"으로 스냅샷을 생성한다.

## 시각 회귀 베이스라인 갱신

베이스라인 PNG 는 `e2e/*.spec.mjs-snapshots/` 아래에 플랫폼 suffix(`-linux`)와 함께
저장돼 **저장소에 커밋된다**. CI(ubuntu)와 같은 Linux 플랫폼에서 생성한 것이다.

- **의도한 시각 변경**(디자인/레이아웃을 일부러 바꾼 경우)일 때만 갱신한다:

  ```bash
  npx playwright test --update-snapshots            # 전체 갱신
  npx playwright test e2e/visual.spec.mjs --update-snapshots --project=w390   # 일부만
  ```

  갱신된 스냅샷을 커밋하고, 커밋 메시지에 "의도한 시각 변경"임을 남긴다
  (`DEFINITION_OF_DONE.md` 테스트 항목).

- **의도치 않은 diff** 는 회귀다. 코드를 고쳐 diff 를 없앤다(스냅샷을 갱신해 덮지
  말 것).

### CI 에서 diff 가 났을 때 (아티팩트 활용)

이 실행 환경과 CI `ubuntu-latest` 의 **폰트 렌더링 차이**로 베이스라인이 어긋날 수
있다. `playwright.config.mjs` 의 `maxDiffPixelRatio: 0.02` 로 미세차를 흡수하지만,
그 이상 벌어지면 CI 가 실패한다. 그럴 때:

1. 실패한 CI 실행의 Artifacts 에서 `playwright-test-results`(실제/기대/diff PNG)와
   `playwright-report`(HTML 리포트)를 내려받는다.
2. diff 를 확인한다.
   - 폰트 차이로 인한 무해한 어긋남이면 → CI(Linux) 환경에서 생성한 `actual` PNG 로
     베이스라인을 교체한다. 가장 확실한 방법은 CI 러너/원격 세션에서
     `npx playwright test --update-snapshots` 를 실행해 새 베이스라인을 커밋하는 것.
   - 실제 회귀면 → 코드를 고친다.

> 로컬 Windows 는 렌더링이 달라 `-linux` 스냅샷과 어긋난다. **시각 회귀 베이스라인은
> Linux 전용**으로 다룬다. Windows 에서는 스모크(`e2e/home.spec.mjs`)만 신뢰하고,
> 시각 스냅샷 갱신은 CI/원격 Linux 세션에서 수행한다.

## WORKFLOW.md Review 세션과의 연결

- Review 세션에서 UI 가 걸린 슬라이스를 마무리할 때 `npm run test:e2e` 를 실제로
  실행해 스모크 통과 + 시각 회귀 무변화(또는 의도한 변경이면 베이스라인 갱신)를
  증거로 남긴다.
- 새 화면·핵심 흐름을 추가했다면 그에 맞는 스모크 단언과 시각 스냅샷을 이 인프라에
  추가한다. 화면 계약서(`docs/ai/contracts/<screen>.contract.md`)의 "완료 기준
  연결" 섹션이 이 스펙들을 가리키게 한다.
- 완료의 증거는 설명이 아니라 실행 결과다: 테스트 출력, 스냅샷, 변경 파일 목록.
```
