# data.js 인증 싱글턴 진단

## 증상

- 로그인되어 있는데 거래 탭에서 `거래 내역 로드 실패 / 로그인 필요`가 표시된다.
- 목표 탭은 `실적 입력`, `목표 -`처럼 기존 데이터가 없는 것처럼 표시된다.

## 반증 가능한 가설

1. Firestore 데이터가 실제로 삭제되었다.
2. APK 설치 과정에서 WebView storage가 지워져 인증 상태가 사라졌다.
3. 브라우저 모듈 cache-bust 불일치로 `data.js`가 여러 인스턴스로 로드되어 탭별 인증 상태가 갈라졌다.
4. 금융 목표 프리셋 보정 코드가 기존 목표를 덮어썼다.

## 확인 결과

- Android `MainActivity`는 WebView storage를 명시적으로 지우지 않는다.
- `data.js`는 `_user`를 module scope 변수로 보관하고 `_scope()`에서 없으면 `로그인 필요`를 던진다.
- 실제 import 목록에서 `data.js?v=20260703-reward-rate-css-fix`, `data.js?v=20260702-reward-settings-system`, `data.js?v=20260701-toss-kim-taewoo`가 혼재한다.
- 이는 같은 파일이라도 ES module URL이 다르면 다른 인스턴스로 로드되는 조건과 맞아떨어진다.
- `render-finance.js`는 일부 목록 조회 실패를 빈 배열로 대체하므로, 로그인 오류가 데이터 소실처럼 보일 수 있다.
- `runFinanceScenarioPresetEnsure()`는 기존 `finance_goals` 첫 문서를 프리셋으로 merge할 수 있어 별도 데이터 보존 위험이 있다.

## 결론

직접 원인은 `data.js` query 불일치로 인한 인증 상태 분리다. 추가로 금융 목표 프리셋 보정의 기존 문서 덮어쓰기 위험을 같은 슬라이스에서 차단한다.
