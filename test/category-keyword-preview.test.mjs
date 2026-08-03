import test from 'node:test';
import assert from 'node:assert/strict';

import { createKeywordPreviewCache } from '../features/modals/category-keyword-preview.js';

// 지연 응답을 손으로 통제할 수 있는 가짜 listTransactions. 호출마다 독립된
// resolver 를 보관해서, 여러 요청이 동시에 떠 있어도 원하는 순서로 풀 수 있다.
function fakeListTransactions() {
  const calls = [];
  const resolvers = [];
  return {
    calls,
    fn(opts) {
      calls.push(opts);
      return new Promise(resolve => { resolvers.push(resolve); });
    },
    resolveAt(index, rows) {
      resolvers[index](rows);
    },
  };
}

// 배경: 카테고리 모달의 키워드 영향 미리보기가 예전엔 autoMatch 입력 이벤트마다
// (220ms 디바운스만 걸고) listTransactions({max:1000}) 을 새로 쐈다. 모달이
// 열려 있는 동안 거래 목록은 안 바뀌니 첫 호출만 실제로 쏘고 재사용해야 한다.
test('모달 세션 동안 listTransactions 는 한 번만 호출된다', async () => {
  const server = fakeListTransactions();
  const cache = createKeywordPreviewCache(server.fn, 1000);

  const first = cache.load();
  server.resolveAt(0, [{ id: 't1' }]);
  assert.deepEqual(await first, [{ id: 't1' }]);

  const second = await cache.load();
  assert.deepEqual(second, [{ id: 't1' }]);
  assert.equal(server.calls.length, 1, 'listTransactions 는 한 번만 호출돼야 한다');
  assert.equal(server.calls[0].max, 1000);
});

test('in-flight 가드: 로드 중 재호출은 새 쿼리를 쏘지 않고 같은 진행 중 요청을 공유한다', async () => {
  const server = fakeListTransactions();
  const cache = createKeywordPreviewCache(server.fn, 1000);

  const a = cache.load();
  const b = cache.load(); // 아직 첫 요청이 안 끝난 상태에서 재호출(trailing)
  assert.equal(server.calls.length, 1, '로드 중엔 새 쿼리를 쏘지 않는다');

  server.resolveAt(0, [{ id: 't1' }, { id: 't2' }]);
  const [resultA, resultB] = await Promise.all([a, b]);
  assert.deepEqual(resultA, resultB);
});

test('reset() 은 세션을 새로 시작해 다음 load() 가 다시 쿼리를 쏘게 한다', async () => {
  const server = fakeListTransactions();
  const cache = createKeywordPreviewCache(server.fn, 1000);

  const first = cache.load();
  server.resolveAt(0, [{ id: 't1' }]);
  await first;
  assert.equal(server.calls.length, 1);

  cache.reset();
  const second = cache.load();
  server.resolveAt(1, [{ id: 't2' }]);
  assert.deepEqual(await second, [{ id: 't2' }]);
  assert.equal(server.calls.length, 2, 'reset 이후엔 새 세션이라 다시 쿼리를 쏜다');
});

test('reset() 이후 이전 세션 요청이 늦게 끝나도 새 세션 캐시를 오염시키지 않는다', async () => {
  const server = fakeListTransactions();
  const cache = createKeywordPreviewCache(server.fn, 1000);

  const stalePromise = cache.load(); // 세션 1 요청(호출 0) — 아직 응답 전
  cache.reset(); // 모달이 닫혔다가 다시 열림 — 세션 2 시작
  const freshPromise = cache.load(); // 세션 2 요청(호출 1) — 새 쿼리
  assert.equal(server.calls.length, 2);

  server.resolveAt(0, [{ id: 'stale' }]); // 세션 1 응답이 뒤늦게 도착
  assert.deepEqual(await stalePromise, [{ id: 'stale' }], '이미 만든 promise 는 자기 응답을 그대로 받는다');

  server.resolveAt(1, [{ id: 'fresh' }]); // 세션 2 응답 도착
  assert.deepEqual(await freshPromise, [{ id: 'fresh' }]);

  const cached = await cache.load();
  assert.deepEqual(cached, [{ id: 'fresh' }]);
  assert.equal(server.calls.length, 2, '세션 1 의 늦은 응답이 세션 2 캐시를 덮어쓰지 않았고, 세션 2 캐시는 그대로 재사용된다');
});
