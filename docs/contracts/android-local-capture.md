# Android 로컬 수집 계약

## 경계

```text
NotificationListenerService / SMS inbox scan
  -> PaymentNotificationParser
  -> NotificationCaptureStore (기기 로컬 큐)
  -> BudgetAndroidBridge
  -> utils/android-flush.js
  -> data.js saveTransaction
```

- Android는 결제 후보를 파싱하고 로컬 큐에 보관한다. 네트워크 API나 Firestore에 직접 쓰지 않는다.
- WebView는 로그인된 사용자에게만 큐를 flush한다. 로그아웃 상태에서는 SMS scan, 큐 조회, ack를 수행하지 않는다.
- 원본 capture는 status를 바꿀 뿐 삭제하지 않는다. 진단 log만 별도 상한으로 압축할 수 있다.

## Capture payload v1

- `schemaVersion`: `1`
- 필수: `id`, `schemaVersion`, `type`, `amount`, `merchant`, `occurredAt`, `capturedAt`, `source`
- `type`: `card_payment`, `transfer_out`, `transfer_in`
- `source`: `android_local_notification`, `android_local_sms`
- 원본 추적 필드: `notificationKey`, `packageName`, `appLabel`, `title`, `text`, `bigText`, `lines`, `raw`, `postTime`
- 선택 결제 필드: `paymentRail`, `paymentRailResolved`, `actualMerchant`, `reason`

Web은 알 수 없는 schema version, 빈 id, 0원 이하 금액, 잘못된 날짜·source를 저장하지 않고 해당 큐 항목을 실패 처리한다.

## 로컬 큐

- 상태: `queued` → `saved | duplicate | merged`, 또는 `failed`.
- 동일 `id`는 상태와 관계없이 다시 enqueue하지 않는다. SMS 재스캔과 listener 재연결이 시도 횟수나 backoff를 초기화하지 않는다.
- 실패는 최대 3회 시도한다. 다음 시도까지 30초, 2분, 10분 backoff를 기록한다.
- `saved`, `duplicate`, `merged`만 terminal ack다. 실패한 capture와 원본 payload는 진단과 수동 복구를 위해 남긴다.

## 로그인 전후 flush

- 로그인 전: native queue를 그대로 보존하며 scan/list/save/ack하지 않는다.
- 로그인 직후: SMS inbox fallback scan 후 pending capture를 최대 10건 읽는다.
- 저장 성공: transaction id와 `saved` ack.
- 기존 거래 발견: 필요하면 네이버페이 metadata를 merge한 뒤 `duplicate` 또는 `merged` ack.
- 저장 실패: 오류와 시도 횟수, `nextAttemptAt`을 기록하고 다음 주기에 재시도한다.

## Reward widget snapshot v2

- Web의 `buildRewardWidgetSnapshot`과 Java `RewardWidgetStore`는 schema version `2`와 동일한 필드 집합을 사용한다.
- snapshot 최상위 필드, `dailyReward`, `pointBuckets` 필드는 `test/fixtures/android-contracts.json`이 기준이다.
- Java는 다른 widget schema version을 저장하지 않으며 최대 4개 point bucket만 정규화한다.

## 보안과 폐기된 경로

- APK/browser에 Gemini, Firebase service account, Gmail, GitHub secret을 저장하지 않는다.
- 폐기한 자동화 앱, 서버 수집 endpoint, native HTTP 전송, server raw-message parser를 다시 연결하지 않는다.
