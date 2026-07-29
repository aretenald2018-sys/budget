// ================================================================
// data/shared/list-cache.js — 목록 읽기 캐시 (Firestore 읽기 쿼터 보호)
//
// 탭을 오갈 때마다 같은 기간의 거래 목록(수백~수천 문서)을 서버에서 다시
// 읽으면 무료 플랜 일일 읽기 쿼터(5만)가 금방 소진된다. 같은 조건의 결과를
// 짧은 TTL 동안 재사용하고, 해당 컬렉션에 쓰기가 일어나면 prefix 로 비운다.
//
// 반환/보관 모두 행 단위 얕은 복사라, 호출부가 결과를 고쳐도 캐시가
// 오염되지 않는다. Timestamp 등 내부 객체는 불변으로 취급한다.
// ================================================================

export const LIST_CACHE_TTL_MS = 3 * 60 * 1000;

export function createListCache({ ttlMs = LIST_CACHE_TTL_MS, maxEntries = 30, now = Date.now } = {}) {
  const store = new Map();

  return {
    get(key) {
      if (!key) return null;
      const entry = store.get(key);
      if (!entry) return null;
      if (now() - entry.at >= ttlMs) {
        store.delete(key);
        return null;
      }
      return entry.rows.map(row => ({ ...row }));
    },

    put(key, rows = []) {
      if (!key) return;
      if (store.size >= maxEntries && !store.has(key)) store.clear();
      store.set(key, { at: now(), rows: rows.map(row => ({ ...row })) });
    },

    invalidate(prefix = '') {
      if (!prefix) {
        store.clear();
        return;
      }
      for (const key of [...store.keys()]) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    },

    // 캐시 키에 넣을 시각. 호출부 대부분이 to: new Date() 를 매번 새로 만들어
    // ms 가 달라지므로, '사실상 지금'(TTL 안의 과거)은 'now' 하나로 묶는다.
    timeKey(value) {
      if (!value) return '';
      const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
      if (Number.isNaN(ms)) return '';
      const current = now();
      return ms <= current + 1000 && current - ms < ttlMs ? 'now' : String(ms);
    },
  };
}
