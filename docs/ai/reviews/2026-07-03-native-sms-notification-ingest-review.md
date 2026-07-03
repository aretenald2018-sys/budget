# 네이티브 알림/SMS 병행 수집 리뷰

## 결과

추가 재검토에서 실제 수집 실패로 이어질 수 있는 문제를 발견했고 수정했다.

## 확인한 점

- Android native 기본 endpoint가 현재 bridge인 `https://budget-api-liart.vercel.app/api/ingest`로 정리됐다.
- 폐기 endpoint 전체 문자열은 Android/브라우저 코드에 남지 않으며, `verify-project`가 이후 회귀를 잡는다.
- SMS 직접 수신은 `RECEIVE_SMS` runtime permission을 별도 요청하고, 금융/결제 후보 본문만 queue에 넣는다.
- 새 APK 실행 시 WebView 설정 UI 배포 여부와 무관하게 `RECEIVE_SMS` runtime permission을 요청한다.
- SMS receiver는 `goAsync()`로 큐 저장/전송 처리 생존성을 높였다.
- SMS/알림 후보 필터를 완화해 실제 카드사/금융앱 문구 차이로 앱 안에서 조용히 버려지는 가능성을 줄였다.
- 알림 수집과 SMS 수집은 같은 `NativeIngestClient`를 쓰되 `ingestChannel`/`ingestClient`로 구분된다.
- 설정 화면에서 알림 접근, SMS 권한, token 상태를 함께 확인할 수 있다.
- APK 빌드가 매번 새 debug signing key를 만드는 구조를 고쳐 `.android-signing`을 재사용하고, GitHub Actions에서도 cache하도록 했다.
- 새 APK는 Android SDK/JBR 경로를 명시했을 때 정상 생성됐다.

## 남은 리스크

- Android 13+ 기기에서 SMS runtime permission prompt와 receiver 동작은 실제 기기에서 확인해야 한다.
- 이전 APK가 이미 매번 새 키로 서명된 빌드였다면 새 안정 서명 APK로 바로 업데이트 설치가 안 될 수 있다. 그 경우 한 번은 기존 앱 삭제 후 새 APK 설치가 필요하다. 이후 같은 `.android-signing`/Actions cache가 유지되면 업데이트 설치가 가능하다.
- 같은 결제가 SMS receiver와 알림 listener 양쪽에서 들어오면 raw는 2건 생길 수 있다. 거래 저장 단계는 amount/time/party 기준 중복 병합을 시도하므로 거래 중복 가능성은 낮지만, 운영 raw 로그에서는 두 경로가 보일 수 있다.
- MMS 본문 다운로드/과거 문자함 backfill은 구현하지 않았다. 현재 범위는 새 SMS 직접 수신과 PUSH 알림 수집 병행이다.
- production deploy는 unrelated dirty/untracked worktree 때문에 수행하지 않았다.

## 검증

- `npm.cmd run verify`: 통과
- `npm.cmd run pages:build`: 통과
- `$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"; $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; npm.cmd run apk:build`: 통과
- 새 APK 생성 후 `npm.cmd run pages:build`: 통과
- 최종 `npm.cmd run verify`: 통과
- 재검토 후 `node --check scripts/build-android-apk.mjs; node --check scripts/verify-project.mjs; node --check render-settings.js; node --check app.js; npm.cmd run verify`: 통과
- 재검토 후 `$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"; $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; npm.cmd run apk:build; npm.cmd run pages:build; npm.cmd run verify`: 통과
