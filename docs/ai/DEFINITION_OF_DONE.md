# Definition of Done

기능 하나(실행 세션 한 슬라이스)가 "완료"라고 판단하려면 아래 조건을 모두 만족해야 한다.
이 문서는 이 프로젝트에 실제로 존재하는 도구만 기준으로 삼는다. 여기 없는 검증(예: 타입 검사)을 완료 증거로 주장하지 않는다.

## 기능

- 화면에 보이는 모든 버튼·입력 요소가 실제로 동작한다. 동작이 정의되지 않은 요소는 그리지 않거나 명확히 비활성 처리한다.
- 저장·취소·뒤로 가기(탭 재진입)가 자연스럽다. 취소하면 기존 값이 유지된다.
- 정상·로딩·빈 상태·오류 상태가 화면 계약서(`docs/ai/contracts/`)에 정의된 대로 존재한다.
- 계산 결과가 계약서의 데이터 계약과 일치한다.
- 장식용 데이터·빈 핸들러가 남아 있지 않다. (fixture 규칙은 `WORKFLOW.md`의 "장식용 데이터 금지" 참조)

## 디자인

- `docs/design-system.md`의 토큰·컴포넌트 규칙을 따르고, 같은 역할의 요소를 화면마다 다르게 새로 만들지 않는다.
- 신규 스타일을 추가하기 전에 `styles/` 기존 클래스 재사용을 먼저 검토한다.
- 320 / 360 / 390 / 412px에서 잘림·겹침이 없다.
- 하단 안전 영역과 키보드 노출 상태에서 하단 내비게이션이 정상이다.

## 코드

- `npm run lint` 통과.
- `npm test` 통과 (기존 테스트 포함 전부).
- `npm run verify` 통과.
- 계산 로직(model)과 렌더링(view/dashboard)이 분리되어 있다 — `features/home/model.js` + `features/home/dashboard.js` 패턴.
- 요구 범위와 무관한 파일 변경이 없다.

## 테스트

- 새 계산 로직에는 단위 테스트(`test/*.test.mjs`)가 있다.
- 버그 수정은 그 버그를 재현하는 회귀 테스트를 먼저 추가한 뒤 고친다.
- 핵심 사용자 흐름 변경 시 `npm run test:e2e` 스모크가 통과한다.
- 시각 회귀 스냅샷(`npm run test:e2e`의 `toHaveScreenshot`)이 통과하거나, 의도된 시각 변경이면 베이스라인을 갱신하고 그 사실을 커밋 메시지에 남긴다.

## 검수

- AI가 브라우저에서 직접 실행·클릭해서 확인했다 (Playwright 또는 운영 Pages 확인). "코드상 맞을 것"은 검수가 아니다.
- 완료의 증거는 AI의 설명이 아니라 실행 결과다: 테스트 출력, 스크린샷, 변경 파일 목록, 남은 위험 요소.
- 검증이 막히면 `not verified yet`과 정확한 차단 사유를 남긴다 (`WORKFLOW.md` 규칙과 동일).
- 배포까지 포함하는 슬라이스면 운영 URL(`https://aretenald2018-sys.github.io/budget/`)에서 실제 상태를 확인한다.

## 배포 (UI 자산이 바뀐 슬라이스)

- **UI(마크업·JS·CSS)를 바꿔 배포하면 `release.json`의 `releaseId`와 `cache.*`(apk 제외) stamp를 반드시 올린다.**
  - 이유: `scripts/build-pages.mjs`가 모든 로컬 자산 참조에 `?release=<releaseId>`를 찍는다. stamp를 안
    올리면 서버 파일은 새 버전이어도 URL이 동일해 **브라우저·CDN이 옛 캐시를 계속 서빙**한다(코드는
    배포됐는데 화면이 안 바뀌는 함정).
  - `cache.apk`와 `android/apk-version.json`의 `cacheBust`는 APK를 실제로 재빌드할 때만 함께 올린다.
- 배포 후 운영 URL에서 실제로 새 화면이 보이는지 확인한다. `curl -s '<url>/index.html' | grep 'app.js?release='`로
  서버가 새 stamp를 서빙하는지 검증할 수 있다.
