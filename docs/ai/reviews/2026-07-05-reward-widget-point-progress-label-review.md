# Android 위젯 포인트/퍼센트 표시 확대 리뷰

## 결과

- 결과: PASS
- 범위: `RewardWidgetProvider`, Android widget layout, APK version/cache-bust, Settings download link, verifier

## 확인 사항

- row value는 `monthPoints`와 `progressPercent(monthPoints, targetAmount)`를 함께 표시한다.
- `targetAmount <= 0`이면 `progressPercent()`가 `0`을 반환하므로 `누적p/0%`로 표시된다.
- empty bucket은 기존 `-` 표시를 유지한다.
- layout은 기존보다 커졌고, emulator widget host hierarchy에서 세 row가 모두 row bounds 안에 표시됐다.
- APK version/cache-bust와 Settings download link가 `2.1.4/15`, `20260705-reward-widget-point-progress-label-v1`로 일치한다.
- 위젯 provider/store에 network, Firestore, secret 경로가 추가되지 않았다.

## 남은 운영 확인

- GitHub Pages workflow가 성공해야 production URL에서 새 APK metadata가 보인다.
- production metadata 확인 URL: `https://aretenald2018-sys.github.io/budget/downloads/budget-apk.json`
