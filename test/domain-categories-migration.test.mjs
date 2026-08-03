import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_MIGRATION_BACKOFF_MS,
  chunkArray,
  decideCategoryMigrationAction,
  mapTxToBudgetCategory,
  missingDefaultCategories,
  resolvePreviousCategory,
} from '../domain/categories/migration.js';

const TARGET = '2026-2q-v1';

// 배경: master-data.js 의 _ensureBudgetCategorySchema 는 예전에 버전 마커를
// 마이그레이션 "완료 후"에만 찍어서, 삭제→리시드→리맵 중 아무 데서나 실패하면
// 다음 loadCategories() 호출(로그인마다, 카테고리 저장 직후마다)이 파괴적 전체
// 재실행을 반복했다. decideCategoryMigrationAction 이 그 재진입 판단을 순수
// 함수로 분리한 결과다 — Firestore 를 몰라서 이렇게 바로 단위 테스트할 수 있다.
test('버전+stage 가 done 이면 아무것도 하지 않는다', () => {
  const action = decideCategoryMigrationAction({
    meta: { version: TARGET, stage: 'done' },
    targetVersion: TARGET,
  });
  assert.equal(action, 'skip-done');
});

test('meta 가 없거나 구버전이면 처음부터 시작한다', () => {
  assert.equal(decideCategoryMigrationAction({ meta: null, targetVersion: TARGET }), 'start');
  assert.equal(
    decideCategoryMigrationAction({ meta: { version: 'old', stage: 'done' }, targetVersion: TARGET }),
    'start',
  );
});

test('버전은 맞는데 stage 가 migrating 이면 재개 — 삭제·리시드를 반복하지 않는다', () => {
  const action = decideCategoryMigrationAction({
    meta: { version: TARGET, stage: 'migrating', legacy: [{ name: '식비' }] },
    targetVersion: TARGET,
  });
  assert.equal(action, 'resume');
});

test('세션 내에서 이미 한 번 시도했으면(성공 여부와 무관) 더 반복하지 않는다', () => {
  const action = decideCategoryMigrationAction({
    meta: { version: TARGET, stage: 'migrating' },
    targetVersion: TARGET,
    sessionAttempted: true,
  });
  assert.equal(action, 'skip-session-limit');
});

test('최근 실패로부터 백오프 시간이 지나지 않았으면 쉰다', () => {
  const now = 1_000_000;
  const action = decideCategoryMigrationAction({
    meta: { version: TARGET, stage: 'migrating' },
    targetVersion: TARGET,
    now,
    lastFailureAt: now - (CATEGORY_MIGRATION_BACKOFF_MS - 1),
  });
  assert.equal(action, 'skip-backoff');
});

test('백오프 시간이 지났으면 재개를 허용한다', () => {
  const now = 1_000_000;
  const action = decideCategoryMigrationAction({
    meta: { version: TARGET, stage: 'migrating' },
    targetVersion: TARGET,
    now,
    lastFailureAt: now - CATEGORY_MIGRATION_BACKOFF_MS,
  });
  assert.equal(action, 'resume');
});

test('세션 제한이 백오프보다 먼저 걸린다(같은 세션 안에서는 backoff 를 확인할 필요조차 없다)', () => {
  const now = 1_000_000;
  const action = decideCategoryMigrationAction({
    meta: { version: TARGET, stage: 'migrating' },
    targetVersion: TARGET,
    now,
    sessionAttempted: true,
    lastFailureAt: now, // 지금 막 실패해서 백오프 안에 있어도
  });
  assert.equal(action, 'skip-session-limit');
});

test('missingDefaultCategories 는 이름이 없는 DEFAULT 만 골라낸다(재개 시 삭제 없이 부족분만 보충)', () => {
  const defaults = [{ name: '주거비용' }, { name: '보험비용' }, { name: '통신비용' }];
  const missing = missingDefaultCategories(['주거비용'], defaults);
  assert.deepEqual(missing.map(c => c.name), ['보험비용', '통신비용']);
  assert.deepEqual(missingDefaultCategories(['주거비용', '보험비용', '통신비용'], defaults), []);
  assert.deepEqual(missingDefaultCategories([], defaults), defaults);
});

test('mapTxToBudgetCategory 는 가맹점/메모 텍스트로 새 카테고리명을 판정한다', () => {
  assert.equal(mapTxToBudgetCategory({ merchant: '스타벅스 강남점' }), '카페비용');
  assert.equal(mapTxToBudgetCategory({ memo: '이번달 월세' }), '주거비용');
  assert.equal(mapTxToBudgetCategory({ counterparty: '와인앤모어' }), '와인/야식');
  assert.equal(mapTxToBudgetCategory({ merchant: '알수없는가게123' }), null);
  assert.equal(mapTxToBudgetCategory({}), null);
});

test('resolvePreviousCategory 는 legacy 스냅샷에 있던 이름만 보존한다', () => {
  const legacyNames = new Set(['식비', '교통']);
  assert.equal(resolvePreviousCategory({ category: '식비' }, legacyNames), '식비');
  // 배열로 넘겨도 동작해야 한다(meta.legacy 는 [{name}] 배열이라 호출부가 Set 으로 안 감쌀 수도 있다).
  assert.equal(resolvePreviousCategory({ category: '교통' }, ['교통']), '교통');
  assert.equal(resolvePreviousCategory({ category: '유령카테고리' }, legacyNames), '유령카테고리');
  assert.equal(resolvePreviousCategory({ category: null }, legacyNames), null);
});

test('chunkArray 는 writeBatch 500 한도 아래로 청크를 자른다', () => {
  const items = Array.from({ length: 1000 }, (_, i) => i);
  const chunks = chunkArray(items, 450);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 450);
  assert.equal(chunks[1].length, 450);
  assert.equal(chunks[2].length, 100);
  assert.deepEqual(chunks.flat(), items);
  assert.deepEqual(chunkArray([], 450), []);
});
