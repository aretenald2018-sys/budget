import test from 'node:test';
import assert from 'node:assert/strict';

import { createTabRefreshCoalescer } from '../features/app/refresh-coalescer.js';

// 진짜 타이머 대신 손으로 넘기는 가짜 타이머 — list-cache.js 의 now 주입과 같은
// 패턴. flush() 를 호출하기 전엔 아무 콜백도 실행되지 않아 결정적으로 테스트할
// 수 있다.
function fakeTimers() {
  let seq = 0;
  let pending = null;
  return {
    setTimeoutFn: (fn) => {
      seq += 1;
      pending = fn;
      return seq;
    },
    clearTimeoutFn: (id) => {
      if (pending && id === seq) pending = null;
    },
    hasPending: () => pending != null,
    flush: () => {
      const fn = pending;
      pending = null;
      fn?.();
    },
  };
}

function makeHarness({ inFlightTabs = new Set(), currentTab = 'home' } = {}) {
  const timers = fakeTimers();
  const rendered = [];
  const pending = new Set();
  const state = { currentTab };
  const coalescer = createTabRefreshCoalescer({
    getCurrentTab: () => state.currentTab,
    isRenderInFlight: tab => inFlightTabs.has(tab),
    markPending: tab => pending.add(tab),
    renderTab: (tab, context) => rendered.push({ tab, context }),
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  return { coalescer, timers, rendered, pending, state, inFlightTabs };
}

// 배경: 저장 경로마다 window.refreshCurrentTab() 을 부르고, 홈 렌더 하나가 7개
// 병렬 쿼리(~1,700 reads)다. 연타/연속 저장이 그대로 여러 번의 전량 재조회로
// 이어지던 걸 짧은 창으로 묶어 마지막 1회만 실제로 렌더하게 한다.
test('창 안에서 여러 번 request() 해도 창이 끝나면 딱 한 번만 렌더한다', () => {
  const { coalescer, timers, rendered } = makeHarness();
  coalescer.request();
  coalescer.request();
  coalescer.request();
  assert.equal(rendered.length, 0, '창이 끝나기 전엔 렌더하지 않는다');
  timers.flush();
  assert.equal(rendered.length, 1, '창이 끝나면 딱 한 번만 렌더한다');
  assert.equal(rendered[0].tab, 'home');
  assert.deepEqual(rendered[0].context, { source: 'refresh' });
});

test('이미 렌더 중이면 창을 기다리지 않고 즉시 pending 표시만 한다(기존 트레일링 처리에 위임)', () => {
  const { coalescer, timers, rendered, pending } = makeHarness({ inFlightTabs: new Set(['home']) });
  coalescer.request();
  assert.equal(timers.hasPending(), false, '이미 렌더 중이면 새 타이머를 걸지 않는다');
  assert.equal(rendered.length, 0);
  assert.deepEqual([...pending], ['home']);
});

test('창이 끝나는 시점에 다시 확인해 그 사이 다른 경로로 렌더가 시작됐으면 새로 쏘지 않는다', () => {
  const { coalescer, timers, rendered, pending, inFlightTabs } = makeHarness();
  coalescer.request();
  // 창이 끝나기 전에 다른 경로(예: switchTab)가 같은 탭 렌더를 이미 시작했다고 가정.
  inFlightTabs.add('home');
  timers.flush();
  assert.equal(rendered.length, 0, '창이 끝나도 그 시점에 렌더 중이면 다시 쏘지 않는다');
  assert.deepEqual([...pending], ['home']);
});

test('cancel() 은 예약된 렌더를 취소한다(탭 전환처럼 이미 최신 렌더를 그린 경우)', () => {
  const { coalescer, timers, rendered } = makeHarness();
  coalescer.request();
  coalescer.cancel();
  assert.equal(timers.hasPending(), false);
  timers.flush(); // no-op, 아무것도 예약되어 있지 않다
  assert.equal(rendered.length, 0);
});

test('요청 시점의 탭이 아니라 실행 시점의 현재 탭을 렌더한다', () => {
  const { coalescer, timers, rendered, state } = makeHarness({ currentTab: 'home' });
  coalescer.request();
  state.currentTab = 'report';
  timers.flush();
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].tab, 'report');
});

test('첫 request() 이후 창이 끝날 때까지 추가 request() 는 새 타이머를 걸지 않는다', () => {
  const { coalescer, timers } = makeHarness();
  coalescer.request();
  const firstPending = timers.hasPending();
  coalescer.request();
  assert.equal(firstPending, true);
  assert.equal(timers.hasPending(), true);
});
