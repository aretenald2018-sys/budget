// ================================================================
// features/modals/category-keyword-preview.js — 키워드 영향 미리보기 모달 세션 캐시
//
// category-controller.js 의 previewKeywordImpact 가 쓰던 자리. 예전엔 autoMatch
// input 이벤트마다(220ms 디바운스만 걸고) listTransactions({max:1000}) 을 새로
// 쐈다 — 키 입력이 디바운스보다 느리면 키 하나당 1,000 reads. 모달이 열려 있는
// 동안 거래 목록은 바뀌지 않으니(사용자가 타이핑하는 동안 서버 상태가 변할 리
// 없다) 첫 호출 결과를 모달 세션 동안 재사용하고, 로드 중 재호출은 새 쿼리를
// 쏘지 않고 같은 진행 중 요청을 공유한다(trailing 1회 — 각 호출은 자기 시점의
// 키워드로 걸러 마지막 호출의 결과가 화면에 남는다).
// ================================================================

export function createKeywordPreviewCache(listTransactions, max = 1000) {
  let session = 0;
  let cache = null;
  let loading = null;

  return {
    // 모달 open/저장/삭제 때마다 불러 세션을 새로 시작한다. 느린 요청이 다음
    // 세션에 잘못 스며드는 걸 세션 번호로 막는다.
    reset() {
      session += 1;
      cache = null;
      loading = null;
    },
    async load() {
      if (cache) return cache;
      if (loading) return loading;
      const mine = session;
      loading = listTransactions({ max })
        .then(rows => {
          if (mine === session) cache = rows;
          return rows;
        })
        .finally(() => {
          if (mine === session) loading = null;
        });
      return loading;
    },
  };
}
