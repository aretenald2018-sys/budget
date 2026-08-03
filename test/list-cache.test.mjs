import assert from 'node:assert/strict';
import test from 'node:test';

import { createListCache } from '../data/shared/list-cache.js';

function makeClock(start = 0) {
  let value = start;
  return { now: () => value, advance: ms => { value += ms; } };
}

test('같은 키는 TTL 안에서 재사용되고 TTL 이 지나면 비워진다', () => {
  const clock = makeClock();
  const cache = createListCache({ ttlMs: 1000, now: clock.now });
  cache.put('tx|a', [{ id: 't1' }]);
  assert.deepEqual(cache.get('tx|a'), [{ id: 't1' }]);
  clock.advance(999);
  assert.deepEqual(cache.get('tx|a'), [{ id: 't1' }]);
  clock.advance(1);
  assert.equal(cache.get('tx|a'), null);
});

test('반환된 행을 고쳐도 캐시 원본은 오염되지 않는다', () => {
  const cache = createListCache({ ttlMs: 1000, now: () => 0 });
  const rows = [{ id: 't1', amount: 100 }];
  cache.put('tx|a', rows);
  rows[0].amount = 999;              // put 이후 원본 변조
  const first = cache.get('tx|a');
  first[0].amount = 555;             // get 결과 변조
  assert.equal(cache.get('tx|a')[0].amount, 100);
});

test('prefix 무효화는 해당 컬렉션 키만 지운다', () => {
  const cache = createListCache({ ttlMs: 1000, now: () => 0 });
  cache.put('tx|a', [{ id: 't1' }]);
  cache.put('rpe|a', [{ id: 'p1' }]);
  cache.invalidate('tx|');
  assert.equal(cache.get('tx|a'), null);
  assert.deepEqual(cache.get('rpe|a'), [{ id: 'p1' }]);
});

test("timeKey 는 '사실상 지금'을 하나의 키로 묶고 과거·미래 시각은 그대로 둔다", () => {
  const clock = makeClock(1_000_000);
  const cache = createListCache({ ttlMs: 60_000, now: clock.now });
  // 호출마다 new Date() 로 만든 to 는 ms 가 달라도 같은 키가 된다.
  assert.equal(cache.timeKey(new Date(1_000_000)), 'now');
  assert.equal(cache.timeKey(new Date(999_500)), 'now');
  // TTL 보다 오래된 과거·확실한 미래(주기 종료일)는 고유 키를 유지한다.
  assert.equal(cache.timeKey(new Date(900_000)), '900000');
  assert.equal(cache.timeKey(new Date(2_000_000)), '2000000');
  assert.equal(cache.timeKey(null), '');
});

test('키가 없으면 캐시를 건너뛴다 (커서 페이지네이션 경로)', () => {
  const cache = createListCache({ ttlMs: 1000, now: () => 0 });
  cache.put(null, [{ id: 't1' }]);
  assert.equal(cache.get(null), null);
});

test('항목 수가 상한을 넘으면 비우고 다시 쌓는다', () => {
  const cache = createListCache({ ttlMs: 1000, maxEntries: 2, now: () => 0 });
  cache.put('tx|a', [{ id: '1' }]);
  cache.put('tx|b', [{ id: '2' }]);
  cache.put('tx|c', [{ id: '3' }]);
  assert.equal(cache.get('tx|a'), null);
  assert.deepEqual(cache.get('tx|c'), [{ id: '3' }]);
});
