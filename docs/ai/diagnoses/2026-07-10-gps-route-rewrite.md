# GPS 궤적 표시 실패 진단

## 증상

- 사진 1처럼 시작점과 끝점만 표시되고 전체 GPS 궤적이 보이지 않는다.
- 거리도 `0.00 킬로미터`처럼 의미 없는 값으로 남는다.
- 사용자는 갤럭시워치 기록과 모바일 기록 모두 사진 2처럼 전체 경로와 거리 데이터가 표시되기를 요구했다.

## 현재 코드 확인

- `rg` 검색 대상: `gps`, `route`, `polyline`, `workout`, `running`, `latitude`, `longitude`, `궤적`, `러닝`, `지도`.
- 현재 HEAD와 `origin/main` tree에는 GPS/workout route 전용 JS/CSS 파일이 없다.
- bounded git history에서도 실제 route renderer는 확인되지 않았고, `러닝` 관련 hit는 상품 이미지 검색/문서의 러닝화 문맥이었다.
- repo root에 `sw.js`는 없다. 기존 리뷰 문서들도 `STATIC_ASSETS`/`CACHE_VERSION` 대상 없음으로 기록해 왔다.

## 반증 가능한 가설

1. **구현 부재/분리 실패**
   - 현재 브랜치 기준 route detail surface가 없어서 어떤 데이터를 넣어도 full path가 그려질 수 없다.
   - 확인 방법: 새 verifier가 `utils/gps-route.js`와 `render-run.js` 계약 부재로 RED가 나야 한다.
2. **중간 좌표 배열 유실**
   - 이전 구현이 있었다면 `startLocation`/`endLocation`만 읽고 `route`, `path`, `samples`, `locations` 같은 배열을 표준화하지 못했을 가능성이 높다.
   - 확인 방법: Galaxy Watch/mobile fixture의 중간 좌표가 normalized route point count에 포함되는지 본다.
3. **거리 계산 부재**
   - 데이터에 `distanceMeters`가 없거나 0인 경우 route point 배열에서 거리를 다시 계산하지 않아 `0.00km`가 표시될 수 있다.
   - 확인 방법: fixture에 explicit distance가 없어도 Haversine 합산으로 `distanceKm > 0`가 나와야 한다.
4. **배포 stale**
   - 새 파일을 작성해도 `index.html`, `app.js`, `style.css` query string이 갱신되지 않으면 GitHub Pages/mobile browser가 이전 bundle을 계속 볼 수 있다.
   - 확인 방법: `scripts/verify-project.mjs`가 새 GPS route cache-bust 토큰을 검사한다.

## 결정

- 기존 GPS route code를 찾아 고치는 방식은 현재 HEAD에서 성립하지 않는다.
- 새 route data normalizer, route detail renderer, style module, verifier, browser QA harness를 작성한다.
- 외부 지도 SDK 없이도 전체 궤적을 반드시 보여주기 위해 SVG route canvas를 자체 렌더링한다.

## 검증 기준

- RED: 구현 전 verifier가 route normalizer/renderer/cache-bust 부재로 실패한다.
- GREEN: `npm.cmd run verify`가 Galaxy Watch/mobile fixture의 full route와 nonzero distance를 통과한다.
- Manual QA: Playwright가 실제 app entrypoint에서 mobile route detail을 열고 full polyline screenshot을 남긴다.
