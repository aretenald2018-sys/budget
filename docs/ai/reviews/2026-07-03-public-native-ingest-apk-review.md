# 공개 다운로드 APK native ingest 포함 전환 리뷰

## 결론

- 즉시 수정해야 할 문제는 발견하지 못했다.
- `npm.cmd run apk:build`가 `--native --out public/downloads/budget.apk`를 사용하므로, GitHub Pages workflow가 만드는 공개 다운로드 APK에 notification listener/native ingest bridge가 포함된다.
- 설정 하단 다운로드 버튼은 그대로 `./downloads/budget.apk`를 가리키며, cache-bust가 `20260703-public-native-v5`로 갱신됐다.
- `versionCode=5`라 기존 `versionCode=4` 설치본 위에 같은 signing key로 업데이트될 수 있다.

## 검증 상태

- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `_site` artifact의 `index.html`, `app.js`, `render-settings.js`에 새 cache-bust와 APK 문구 반영 확인.
- 로컬 `npm.cmd run apk:build`: not verified yet. 이 환경에 `ANDROID_HOME` 또는 `ANDROID_SDK_ROOT`가 없어 Android APK 빌드가 중단됐다.

## 남은 리스크

- Play Protect를 다시 켜면 notification listener 포함 APK가 다시 차단될 수 있다.
- 같은 package name이더라도 과거에 다른 signing key로 설치한 APK가 있으면 Android가 덮어설치를 거부할 수 있다.
- production 배포 후 `downloads/budget-apk.json`에서 `nativeIngestEnabled=true`를 확인해야 한다.

## NEXT_ACTION.md 업데이트

- 상태: `complete`
- 다음 액션: 없음
