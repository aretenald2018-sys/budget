# PWA Share Target 공유 목록 노출 복구 리뷰

## 결과

- 상태: 조건부 통과
- 범위: Android Chrome PWA/WebAPK installability와 다운로드용 Android APK 공유 intent 등록

## 확인한 것

- Chrome Web Share Target은 설치된 PWA만 OS 공유 대상에 노출한다.
- Chrome installability 기준에는 manifest의 192px/512px 아이콘이 필요하다.
- 기존 manifest는 SVG `sizes: "any"` 아이콘만 있어 WebAPK/share target 등록 조건이 약했다.
- 새 manifest는 `app-icon-192.png`, `app-icon-512.png`, 기존 SVG 보조 아이콘을 제공한다.
- `share_target.action`은 GitHub Pages 하위 경로에서도 scope 안에 남는 상대 URL `./index.html?shareTarget=cart`를 유지한다.
- Pages artifact에 새 PNG 아이콘이 포함된다.
- 다운로드용 APK는 `ACTION_SEND text/plain` intent-filter를 등록하고, 공유 텍스트/제목을 기존 웹 share target query로 전달한다.
- `scripts/verify-project.mjs`에 manifest와 Android share intent 회귀 검사를 추가했다.

## 검증

- `node --check scripts/build-pages.mjs`: 통과
- `node --check scripts/verify-project.mjs`: 통과
- `npm.cmd run verify`: 통과 (`verify-project passed`, 96 JS files checked)
- `_site/manifest.webmanifest`: 존재
- `_site/app-icon-192.png`: 존재
- `_site/app-icon-512.png`: 존재
- `git diff --check`: 통과

## 잔여 리스크

- Android APK build는 프로젝트 규칙상 sandbox에서 실행하지 않았다.
- Android Chrome/WebAPK는 manifest 업데이트가 기존 설치에 바로 반영되지 않을 수 있으므로, 사용자는 배포 후 기존 PWA를 삭제하고 Chrome에서 다시 설치해야 한다.
- Instagram 실제 공유 시트 노출은 배포된 HTTPS origin과 실기기에서만 최종 확인할 수 있다.
- 사용자가 다운로드용 APK를 쓰는 경우에도 새 APK를 다시 설치해야 `ACTION_SEND` intent-filter가 반영된다.

## 결론

코드와 정적 산출물 기준으로 공유 대상 등록 누락 원인 후보를 보강했다. 최종 완료 판정은 production 배포 후 PWA 재설치 또는 APK 재설치 뒤 Instagram 공유 시트에 `가계부`가 나타나는지 확인해야 한다.
