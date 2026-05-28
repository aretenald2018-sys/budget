# PWA Share Target 공유 목록 노출 복구 계획

## 요청

Instagram에서 공유 버튼을 눌렀을 때 다른 앱은 보이지만 가계부 PWA가 공유 가능 목록에 나오지 않는다. Reels caption 파싱 이전에 Android 공유 시트에 PWA가 share target으로 등록되도록 보강한다.

## 진단

- Chrome Web Share Target은 설치된 PWA만 OS 공유 대상에 노출한다.
- Chrome installability 기준에는 manifest의 `icons`에 192px과 512px 아이콘이 필요하다.
- 현재 `manifest.webmanifest`는 `app-icon.svg` 한 개만 제공하며 `sizes: "any"`로 되어 있다.
- repo root에는 `sw.js`가 없고 `STATIC_ASSETS`/`CACHE_VERSION`도 없다.
- `share_target`의 GET 파라미터 구조 자체는 `title`, `text`, `url`을 받고 있어 흐름과 맞다.

## 실행 슬라이스

### 슬라이스 1: Android WebAPK/APK share target 등록 조건 보강

- 상태: 실행 완료
- 범위:
  - 192px/512px PNG 앱 아이콘을 생성한다.
  - `manifest.webmanifest`에 PNG 아이콘을 명시하고 기존 SVG는 보조 아이콘으로 유지한다.
  - `start_url`, `id`, `scope`, `share_target.action`을 GitHub Pages 하위 경로에서도 명확한 상대 경로로 정리한다.
  - `index.html` manifest cache-busting query string을 갱신한다.
  - `scripts/build-pages.mjs`가 새 아이콘을 Pages artifact에 복사하게 한다.
  - `scripts/verify-project.mjs`에 manifest 192/512 아이콘과 share_target 기본 검증을 추가한다.
  - 다운로드용 Android APK도 공유 목록에 뜨도록 `ACTION_SEND text/plain` intent-filter를 추가하고, 공유 텍스트를 PWA share URL query로 변환한다.
- 수정하지 말 것:
  - share target caption parsing 로직
  - API/LLM provider
  - 장기 cache service worker 도입

## 검증

- `node --check scripts/build-pages.mjs`
- `node --check scripts/verify-project.mjs`
- `npm.cmd run verify`
- `_site/manifest.webmanifest`, `_site/app-icon-192.png`, `_site/app-icon-512.png` 존재 확인
- Android APK build는 sandbox에서 실행하지 않고, 배포 workflow/normal terminal에서 확인한다.
- 실기기 최종 확인: 배포 후 Android Chrome에서 기존 PWA 삭제 후 재설치, Instagram 공유 시트에서 `가계부`가 보이는지 확인

## 완료 기준

- manifest가 Chrome installability 기준의 192px/512px 아이콘을 제공한다.
- Pages build artifact에 manifest와 아이콘이 함께 포함된다.
- verify 스크립트가 share target 등록에 필요한 manifest 기본 조건을 회귀 방지한다.
- 다운로드용 APK도 `text/plain` 공유 intent를 받아 `?shareTarget=cart&text=...` URL로 앱을 연다.

## 실행 결과

- `app-icon-192.png`, `app-icon-512.png`를 추가했다.
- `manifest.webmanifest`에 `id`, 192px/512px PNG 아이콘, 기존 SVG 보조 아이콘을 명시했다.
- `index.html`의 manifest cache-busting query string을 갱신했다.
- `scripts/build-pages.mjs`가 새 PNG 아이콘을 Pages artifact에 포함한다.
- `scripts/verify-project.mjs`가 manifest 192/512 아이콘, `share_target`, APK `ACTION_SEND` 회귀를 검사한다.
- `android/AndroidManifest.xml`에 `ACTION_SEND text/plain` intent-filter와 `singleTop` launch mode를 추가했다.
- `android/src/com/aretenald/budget/MainActivity.java`가 shared text/title을 `?shareTarget=cart&title=...&text=...` URL로 변환해 WebView를 연다.

## 검증 결과

- `node --check scripts/build-pages.mjs`: 통과
- `node --check scripts/verify-project.mjs`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed`, 96 JS files checked)
- `_site/manifest.webmanifest`, `_site/app-icon-192.png`, `_site/app-icon-512.png` 존재 확인
- `rg`로 manifest share target, Android `ACTION_SEND text/plain`, Java `Intent.EXTRA_TEXT`/`shareTarget=cart` 전달 경로 확인
- `git diff --check`: 통과
- Android APK build와 Instagram 실기기 공유 시트 확인은 normal terminal/실기기에서 아직 수행하지 않았다.
