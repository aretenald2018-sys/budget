// ================================================================
// features/app/refresh-coalescer.js — 저장 → refreshCurrentTab() 코얼레싱
//
// 저장 경로마다(거래 편집·카테고리·설정·환급 토글…) window.refreshCurrentTab()
// 을 부르고, 홈 렌더 하나가 내부적으로 7개 병렬 쿼리(실측 ~1,700 reads)다.
// app.js 의 기존 in-flight 코얼레싱(렌더 진행 중 재호출은 트레일링 1회 —
// _tabRenderTokens/_pendingTabRefreshes)은 그대로 두고, 그 앞단에 짧은 조용한
// 구간(기본 500ms)을 기다렸다가 한 번만 실제로 렌더하는 디바운스를 얹는다.
// 연타/연속 저장이 그대로 여러 번의 전량 재조회로 이어지던 문제를 막는다.
//
// setTimeoutFn/clearTimeoutFn 은 테스트에서 가짜 타이머를 주입할 수 있게 뺐다
// (data/shared/list-cache.js 의 now 주입과 같은 패턴).
// ================================================================

export function createTabRefreshCoalescer({
  getCurrentTab,
  isRenderInFlight,
  markPending,
  renderTab,
  windowMs = 500,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  let timer = null;

  function attempt() {
    const tab = getCurrentTab();
    // 창이 끝나는 시점에 다시 확인한다 — 그 사이 다른 경로(탭 전환 등)로 같은
    // 탭 렌더가 이미 시작됐을 수 있다. 그때는 새로 쏘지 않고 기존 트레일링
    // 처리에 얹는다.
    if (isRenderInFlight(tab)) {
      markPending(tab);
      return;
    }
    renderTab(tab, { source: 'refresh' });
  }

  return {
    // 이미 렌더 중이면 창을 기다릴 이유가 없다 — pending 표시만 해두면 그
    // 렌더가 끝난 뒤 기존 트레일링 처리가 알아서 다시 그린다.
    request() {
      if (isRenderInFlight(getCurrentTab())) {
        markPending(getCurrentTab());
        return;
      }
      if (timer != null) return; // 이미 이번 창 안에서 예약됨 — 창이 끝나면 그 시점의 최신 상태를 그린다.
      timer = setTimeoutFn(() => {
        timer = null;
        attempt();
      }, windowMs);
    },
    // 다른 경로가 이미 최신 렌더를 그렸다면(탭 전환 등) 예약된 코얼레싱 렌더는
    // 불필요 — 엉뚱한 시점의 재조회를 남기지 않도록 취소한다.
    cancel() {
      if (timer == null) return;
      clearTimeoutFn(timer);
      timer = null;
    },
  };
}
