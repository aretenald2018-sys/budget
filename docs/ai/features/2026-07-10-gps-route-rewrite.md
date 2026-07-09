# GPS 궤적 전체 경로 재작성 계획

## 요청

- GPS 궤적 표시가 계속 stale 상태로 실패하므로 관련 경로 표시를 기존 가정 없이 처음부터 작성한다.
- 갤럭시워치 기록이든 모바일 기록이든 사진 2처럼 시작점/끝점만이 아니라 전체 궤적이 보여야 한다.
- 몇 km 달렸는지 거리 데이터가 보여야 한다.

## 진단 우선 적용

버그/회귀 요청이므로 `/diagnose`를 우선 적용한다.

### 재현 루프

1. `npm.cmd run verify`
   - Galaxy Watch형 fixture와 mobile형 fixture를 넣고 route normalizer가 전체 좌표와 거리 값을 만들지 못하면 실패한다.
2. Playwright fixture QA
   - 390x844 모바일 viewport에서 실제 앱 entrypoint를 열고 running detail 화면에 full polyline, 시작/끝 marker, `킬로미터` 수치가 표시되는지 확인한다.
3. `npm.cmd run pages:build`
   - GitHub Pages artifact에 새 JS/CSS와 cache-bust query가 반영되는지 확인한다.

### 가설

1. 현재 HEAD에는 GPS/workout route 전용 코드가 없다.
   - 근거: `rg`와 bounded git history에서 `gps`, `polyline`, `latitude`, `longitude`, `workout`, `궤적` UI 코드가 발견되지 않았다.
   - 의미: “기존 stale 코드 삭제”는 현재 브랜치 기준으로 낡은 route assumptions를 재사용하지 않고 새 route module을 만든다는 뜻이다.
2. 이전 실패는 시작/끝 좌표만 metric/marker로 보존하고 중간 route point 배열을 표준화하지 못한 데이터 계약 문제일 가능성이 높다.
   - 검증: 3개 이상 좌표 fixture에서 normalized route point count와 SVG/polyline path point count가 모두 3 이상인지 확인한다.
3. 배포 stale은 root `index.html` → `app.js` → route renderer/import cache-bust 불일치에서 재발할 수 있다.
   - 검증: `scripts/verify-project.mjs`에 GPS route cache-bust 계약을 추가한다.

## 그릴 결과

- 핵심 질문: 기존 화면을 고칠지, 새 route surface를 만들지?
- 코드 확인 결과: 현재 브랜치에는 GPS/workout route surface가 없다.
- 결정: 새 `run`/`activity` detail surface를 추가하고 기존 예산/거래 기능과 분리한다.
- 남은 가정: 실제 운영 데이터의 Firestore collection 이름은 아직 없다. 이번 slice는 `users/{uid}/run_activities`를 data boundary로 추가하고, fixture QA로 Galaxy Watch/mobile payload shape를 고정한다.

## 실행 슬라이스 1

### 목표

새 GPS route pipeline을 한 번에 구현하되 범위는 “running activity detail 표시”로 제한한다.

### 변경 후보 파일

- `data.js`
  - `listRunActivities()`, `getRunActivity()` 추가.
  - Firestore 직접 접근 규칙을 지키기 위해 browser read는 이 파일로만 통과시킨다.
- `utils/gps-route.js`
  - Galaxy Watch/mobile/raw route payload를 표준 route point 배열로 normalize한다.
  - Haversine 거리, kilometer markers, bounds, stat formatting을 계산한다.
- `render-run.js`
  - run activity 목록/detail UI와 full route map SVG renderer를 새로 작성한다.
- `styles/90-run.css`
  - 사진 2의 핵심 정보 구조를 앱 디자인 시스템 토큰으로 구현한다.
- `app.js`, `index.html`, `style.css`, `scripts/build-pages.mjs`
  - 새 tab/module/CSS를 연결하고 cache-bust한다.
- `scripts/verify-project.mjs`
  - route contract와 cache-bust 계약을 RED→GREEN verifier로 추가한다.
- `docs/design-system.md`
  - run activity detail primitive와 GPS route map 규칙을 기록한다.

### 구현하지 않는 것

- 실제 갤럭시워치/모바일 Health Connect 수집기.
- 외부 지도 SDK(Google/Naver/Kakao) 연동.
- 운영 Firestore 데이터 생성/수정.
- 실제 사용자 운동 기록 삭제/마이그레이션.

### 성공 기준

1. Galaxy Watch형 fixture와 mobile형 fixture 모두에서 전체 route point가 3개 이상 보존되고 거리 `distanceKm > 0`가 계산된다.
2. 실제 앱 entrypoint의 running detail 화면에서 시작/끝 marker만이 아니라 연속 route line이 보이고 `킬로미터` 수치가 0이 아니다.
3. no-route/two-point input은 콘솔 오류 없이 빈 상태 또는 최소 marker/line 상태로 graceful하게 표시된다.
4. 새 JS/CSS 파일은 Pages artifact에 포함되고 cache-bust query가 검증된다.

### 검증 명령

```bash
npm.cmd run verify
npm.cmd run pages:build
```

### 브라우저 QA

- 390x844 viewport에서 fixture route detail을 열고 screenshot을 저장한다.
- PASS 조건:
  - stat 영역에 `킬로미터`가 `0.00`이 아닌 값으로 표시된다.
  - route SVG 또는 DOM polyline의 point count가 3 이상이다.
  - 시작/끝 marker가 서로 다른 위치에 있고 full route path가 marker 사이를 연결한다.
  - console error/pageerror가 없다.

## 다음 자동 액션

이 계획은 사용자의 `$omo:ulw-loop` 요청에 의해 같은 세션에서 실행 슬라이스 1로 자동 진행한다.
