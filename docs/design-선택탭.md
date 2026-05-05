# 선택(Choice) 탭 — UX 설계 문서

## 1. 철학 및 목적

선택 탭은 **행동경제학 기반 소비 제어 시스템**이다. 세 가지 메커니즘이 순환한다:

```
충동 발생 → [장바구니] 담기 (마찰) → 기다리다 포기 or 달성
                ↓ 포기                         ↓ 달성
           [감각뱅크] 적립        ←   [퀘스트] 조건 설정/충족
```

핵심 원칙:
- **장바구니**: 구매 전 강제 대기. 충동구매에 시간 마찰을 부여
- **퀘스트**: Duolingo식 게이미피케이션. 목표 조건을 달성해야 보상(구매 허가, 성취감)
- **감각뱅크**: 참음 = 가치 적립. 절제를 눈에 보이는 숫자로 변환

---

## 2. 정보 구조 (IA)

```
선택 탭
├── 장바구니 (want)
│   ├── 카트 아이템 목록
│   │   ├── [일반] 기본 aging 카드
│   │   ├── [쿨오프 중] D-N 카운트다운 카드
│   │   └── [오래됨] 30일+ 경고 카드
│   └── 빈 상태 CTA
│
├── 퀘스트 (do)
│   ├── 주간 체크인 카드 (streak pact 존재 시)
│   ├── Ready 카드 (조건 달성 대기, 최우선)
│   ├── Pact 카드 목록 (trigger type별)
│   │   ├── time — 마감일 카운트다운
│   │   ├── savings — 적금 진행 바
│   │   ├── streak — 연속 체크인 도트
│   │   ├── measure — 수치 목표 (체중/BMI 등)
│   │   ├── event — 특정 이벤트 달성
│   │   └── manual — 수동 완료 버튼
│   ├── 상태 필터 [전체 / 진행중 / 완료됨]
│   └── + FAB (새 퀘스트)
│
└── 감각뱅크 (bank)
    ├── 총액 히어로 (₩합계 + kcal합계)
    ├── 마일스톤 진행 바
    ├── [충동 기록하기] 버튼
    └── 기록 리스트 (시간순 역순)
```

---

## 3. 데이터 모델

### 3-1. Cart Item (Firestore: `cart_items`)

```typescript
interface CartItem {
  id: string
  title: string
  url?: string
  price: number
  kind: 'buy' | 'eat' | 'wear' | 'wine' | 'home' | 'other'
  status: 'pending' | 'bought' | 'declined'
  cooloffDays?: number          // 쿨오프 기간 (일)
  cooloffUntil?: Timestamp      // 쿨오프 마감일
  linkedPactId?: string         // 연결된 pact (선택적)
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

**Aging 계산**: `daysSinceCreated = today - createdAt (days)`
- 0–7일: 정상 (회색 배지)
- 7–29일: 주의 (노랑 배지)
- 30일+: 경고 (주황 배지 + 재고 확인 CTA)

**쿨오프 상태**: `cooloffUntil > now` → 쿨오프 진행 중
- `daysLeft = cooloffUntil - now (days)` 표시
- 쿨오프 중에는 [구매하기] 버튼 비활성화

### 3-2. Pact (Firestore: `pacts`)

```typescript
interface Pact {
  id: string
  title: string
  status: 'draft' | 'active' | 'ripening' | 'ready' | 'fulfilled' | 'broken' | 'archived'
  trigger: PactTrigger
  linkedCartItemId?: string     // savings trigger에서 카트 아이템 연결
  rewardNote?: string           // 달성 시 보상 메모
  createdAt: Timestamp
  fulfilledAt?: Timestamp
}

type PactTrigger =
  | { type: 'time';    date: string; recurrence: 'none'|'daily'|'weekly'|'monthly' }
  | { type: 'savings'; targetAmount: number; currentAmount: number }
  | { type: 'streak';  metric: string; count: number; currentCount: number; of: 'days'|'occurrences' }
  | { type: 'measure'; metric: string; op: '<='|'>='; value: number; currentValue: number; unit: string }
  | { type: 'event';   eventName: string; done: boolean }
  | { type: 'manual';  done: boolean }
```

**상태 전이**:
```
draft ──→ active ──→ ripening ──→ ready ──→ fulfilled
                                          ↘ broken
                   ──────────────────────→ archived
```
- `draft`: 트리거 미완성
- `active`: 트리거 조건 진행 중
- `ripening`: 조건 거의 충족 (80%+)
- `ready`: 조건 완전 충족, 사용자 확인 대기 → **Confetti 트리거**
- `fulfilled`: 완료
- `broken`: 퀘스트 포기/실패

### 3-3. Urge (Firestore: `urge`)

```typescript
interface Urge {
  id: string
  what: string              // "와인", "스킨케어 세트" 등
  savedAmount: number       // 참아서 절약한 금액
  savedKcal?: number        // 참아서 절약한 칼로리
  choiceType: 'resisted'    // 충동 참기
  linkedCartItemId?: string
  linkedPactId?: string
  occurredAt: Timestamp
}
```

**감각뱅크 합산**: `listUrges()` → `sum(savedAmount)`, `sum(savedKcal)`

---

## 4. 컴포넌트 스펙

### 4-1. 공유 헤더 / 히어로 카드

```
배경: linear-gradient(135deg, #1a0a2e 0%, #2d1854 40%, #3d0d35 100%)
패딩: 20px 18px 0
```

| 요소 | 스타일 |
|------|--------|
| 예산 잔액 레이블 | 10px / 400 / rgba(255,255,255,.5) |
| 예산 잔액 금액 | 28px / 700 / #f5f5f7 / tabular-nums |
| 카트 합계 | 13px / 500 / rgba(255,255,255,.7) |
| 구분선 | 1px / rgba(255,255,255,.1) / height:36px |

### 4-2. 세그먼트 컨트롤

```css
/* 컨테이너 */
margin: 16px 18px 0;
background: rgba(255,255,255,0.08);
border-radius: 10px;
padding: 3px;

/* 버튼 */
flex: 1; height: 34px; border-radius: 8px;
font-size: 13px; font-weight: 500; color: rgba(255,255,255,.5);

/* 활성 버튼 */
background: linear-gradient(135deg, #7c3aed, #db2777);
color: #fff; font-weight: 600;
```

### 4-3. 카트 아이템 카드

```
background: --surface (#141414)
border-radius: --r-lg (16px)
border: 1px solid --border (#2c2c2e)
padding: 16px
margin: 0 18px 12px
```

| 상태 | 테두리 변경 |
|------|------------|
| 일반 | `1px solid #2c2c2e` |
| 쿨오프 중 | `1px solid rgba(124,58,237,.5)` + 좌측 3px solid `#7c3aed` |
| 오래됨 (30일+) | `1px solid rgba(245,158,11,.4)` |
| linked to pact | 하단에 링크 배지 표시 |

**Aging 배지 색상**:
- 0–6일: `background: rgba(100,100,100,.15)` / `color: #636366`
- 7–29일: `background: rgba(245,158,11,.12)` / `color: #f59e0b`
- 30일+: `background: rgba(239,68,68,.12)` / `color: #ef4444`

**액션 버튼 행**:
- [구매하기]: `border: 1px solid #3a3a3c; background: transparent; color: #a1a1a6`
- [안 살래요 💜]: `background: rgba(124,58,237,.15); color: #a78bfa`

### 4-4. 퀘스트 카드

**공통 구조**:
```
surface 카드 + trigger type 배지 (우상단)
제목 (15px/600)
트리거별 진행 UI
```

**Trigger 배지 색상**:
| type | 배경 | 텍스트 |
|------|------|--------|
| time | rgba(168,85,247,.15) | #a855f7 |
| savings | rgba(49,130,246,.15) | #3182f6 |
| streak | rgba(16,185,129,.15) | #10b981 |
| measure | rgba(245,158,11,.15) | #f59e0b |
| event | rgba(100,100,100,.15) | #a1a1a6 |
| manual | rgba(100,100,100,.15) | #a1a1a6 |

**Ready 카드** (특수):
```css
border: 2px solid transparent;
background: linear-gradient(#141414, #141414) padding-box,
            linear-gradient(135deg, #7c3aed, #db2777) border-box;
```
- 완료 버튼: `background: linear-gradient(135deg, #7c3aed, #db2777); color:#fff; width:100%; height:48px`

**Streak 체크인 카드**:
```
상단 고정 (다른 카드 위)
background: rgba(16,185,129,.08)
border: 1px solid rgba(16,185,129,.2)
체크인 버튼: background: #10b981; color:#fff
도트 시각화: ●(완료) = #10b981 / ○(미완) = #3a3a3c
```

### 4-5. 감각뱅크 히어로

```css
margin: 0 18px 16px;
background: linear-gradient(135deg, rgba(124,58,237,.2), rgba(219,39,119,.15));
border: 1px solid rgba(124,58,237,.3);
border-radius: 20px;
padding: 24px 20px;
```

| 요소 | 스타일 |
|------|--------|
| 레이블 "올해 참은 가치" | 12px / rgba(255,255,255,.5) |
| 총액 | 40px / 800 / #f5f5f7 / tabular-nums |
| kcal 부제 | 14px / #a78bfa |

**마일스톤 바**:
```css
/* 트랙 */
background: rgba(255,255,255,.08); border-radius: 6px; height: 8px;

/* 필 */
background: linear-gradient(90deg, #7c3aed, #db2777);
```

### 4-6. 충동 기록 엔트리

```
날짜 (11px / #636366)
이모지 + 제목 (14px / #f5f5f7)
+금액 (14px / 700 / #a78bfa)  |  +kcal (12px / #10b981)
[카트 연결] 또는 [퀘스트 연결] 배지 (선택적)
```

---

## 5. 트리거별 카드 UI 렌더링 규칙

### time
```
⏰ 아이콘 + "마감일 기다리기"
D-N 카운트다운 (대형, 강조색)
[시작일 ─────────────────── 마감일]
진행 바 (경과 비율)
```

### savings
```
💰 아이콘 + "적금 목표"
₩현재 / ₩목표 (tabular-nums)
진행 바 + 퍼센트
[카트 연결됨 →] 배지 (linkedCartItemId 있을 때)
```

### streak
```
🔥 아이콘 + "연속 달성"
N/M회 (현재/목표)
도트 히스토리 (최근 M개)
[이번 주 체크인] 버튼 (weekly recurrence 시)
```

### measure
```
📊 아이콘 + metric 이름
현재값 → 목표값 + 단위
방향 화살표 (op >= 이면 ↑, op <= 이면 ↓)
```

### event
```
📅 아이콘 + eventName
[완료됨 ✓] 토글 버튼
```

### manual
```
✋ 아이콘 + 제목
[완료 확인하기] 버튼
```

---

## 6. Celebration (Confetti) 트리거

| 트리거 | 조건 | 화면 |
|--------|------|------|
| 퀘스트 달성 | pact.status → `fulfilled` | confetti burst + "🎉 퀘스트 달성!" 모달 + 보상 메모 표시 |
| 감각뱅크 마일스톤 | totalSaved 가 N만원 초과 | confetti burst + "₩N만 절약 달성! 🏆" 배너 |

**마일스톤 금액 단계**: ₩50,000 / ₩100,000 / ₩200,000 / ₩500,000 / ₩1,000,000

**Confetti 구현**: Canvas API 또는 `canvas-confetti` 라이브러리 사용 권장

---

## 7. 장바구니 "안 살래요" 플로우

```
[안 살래요 💜] 탭
     ↓
bottom sheet 오픈:
  - "얼마나 절약했나요?" 입력 (기본값: 카트 아이템 price)
  - "칼로리 절약 (선택)" 입력
  - [감각뱅크에 적립하기] 버튼
     ↓
saveMindbankEntry({ choiceType:'resisted', savedAmount, savedKcal, linkedCartItemId })
updateCartItem(id, { status: 'declined' })
     ↓
감각뱅크 합계 업데이트 → 마일스톤 체크 → confetti (해당 시)
```

---

## 8. 구현 포인트 (render-cart.js)

| 현재 | 개선 |
|------|------|
| segment: 'want'\|'do' | 'bank' 세그먼트 추가 |
| bankSegmentHtml() 존재 | 완성도 높은 UI로 교체 |
| 완료 버튼 없음 | ready 상태 pact에 대형 완료 버튼 추가 |
| streak 체크인 UI 없음 | 주간 체크인 카드 추가 |
| confetti 없음 | fulfilled/milestone 이벤트에 confetti 연결 |
| "안 살래요" 플로우 없음 | bottom sheet + urge 저장 로직 추가 |

---

## 9. 접근성 & 엣지케이스

- 빈 카트: 온보딩 힌트 ("충동구매 전에 여기 담아보세요")
- 빈 퀘스트: "첫 퀘스트를 만들어보세요" + 예시 퀘스트 제안
- 빈 감각뱅크: "오늘 처음 기록해보세요" CTA
- 숫자 포맷: 모든 금액 `toLocaleString('ko-KR')` + "₩" prefix
- streak 체크인: 이미 이번 주에 체크인한 경우 버튼 비활성화 + "✓ 이번 주 완료"
- pact ready 상태: 탭 아이콘에 뱃지(dot) 표시 권장
