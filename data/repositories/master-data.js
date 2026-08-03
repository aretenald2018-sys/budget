import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import {
  firestoreDb as _db,
  scope as _scope,
  sessionCache as _cache,
} from '../core/firebase.js';
import {
  BUDGET_MONTH_KEY,
  BUDGET_SCHEMA_VERSION,
  BUDGET_START_DATE,
  DEFAULT_BUDGET_RHYTHMS,
  UNCATEGORIZED_CATEGORY_NAME,
} from '../constants.js';
import { normalizeParty } from '../shared/normalize.js';
import { fixtureActive } from '../core/fixtures.js';
import {
  chunkArray,
  decideCategoryMigrationAction,
  mapTxToBudgetCategory,
  missingDefaultCategories,
  resolvePreviousCategory,
} from '../../domain/categories/migration.js';

// 파괴적 카테고리 마이그레이션(아래 _ensureBudgetCategorySchema)의 세션 내
// 재시도 제한 — 페이지를 새로고침하면 초기화된다. 세션을 넘는 백오프는
// localStorage 로 CATEGORY_MIGRATION_BACKOFF_STORAGE_KEY 에 남긴다.
let categoryMigrationSessionAttempted = false;
const CATEGORY_MIGRATION_BACKOFF_STORAGE_KEY = 'budget.categorySchemaMigrationFailedAt';

function readCategoryMigrationBackoffAt() {
  try {
    const raw = localStorage.getItem(CATEGORY_MIGRATION_BACKOFF_STORAGE_KEY);
    const ms = raw ? Number(raw) : NaN;
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function recordCategoryMigrationFailure() {
  try {
    localStorage.setItem(CATEGORY_MIGRATION_BACKOFF_STORAGE_KEY, String(Date.now()));
  } catch {
    // 프라이빗 모드 등 localStorage 불가 환경 — 세션 내 재시도 1회 제한은 그대로 남는다.
  }
}

function clearCategoryMigrationBackoff() {
  try {
    localStorage.removeItem(CATEGORY_MIGRATION_BACKOFF_STORAGE_KEY);
  } catch {
    // no-op
  }
}

// fixture 모드: Firestore 대신 세션 캐시의 카테고리를 직접 병합한다(새로고침 시 초기화).
function fixturePatchCategory(categoryId, patch) {
  const rows = Array.isArray(_cache.categories) ? _cache.categories : [];
  const index = rows.findIndex(cat => cat.id === categoryId);
  if (index >= 0) rows[index] = { ...rows[index], ...patch };
  else rows.push({ id: categoryId || `fixture_${rows.length + 1}`, ...patch });
  _cache.categories = rows.slice();
}

// ================================================================
// accounts — 본인 계좌/카드 마스터
// ================================================================
export async function loadAccounts() {
  const ref = collection(_db, 'users', _scope(), 'accounts');
  const snap = await getDocs(ref);
  _cache.accounts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function getAccounts() { return _cache.accounts || []; }

export function getAccountById(id) { return getAccounts().find(a => a.id === id); }

export async function saveAccount(account) {
  if (account.id) {
    const ref = doc(_db, 'users', _scope(), 'accounts', account.id);
    const { id, ...patch } = account;
    await setDoc(ref, patch, { merge: true });
  } else {
    const ref = collection(_db, 'users', _scope(), 'accounts');
    await addDoc(ref, account);
  }
  await loadAccounts();
}

export async function deleteAccount(id) {
  const ref = doc(_db, 'users', _scope(), 'accounts', id);
  await deleteDoc(ref);
  await loadAccounts();
}

// ================================================================
// categories
// ================================================================
export async function loadCategories() {
  await _ensureBudgetCategorySchema();
  const ref = collection(_db, 'users', _scope(), 'categories');
  const snap = await getDocs(ref);
  _cache.categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (_cache.categories.length === 0) {
    await _seedCategories();
  }
  await _ensureBudgetCategoryIntegrity();
  await _ensureBudgetRhythms();
}

const LIVING_COST_SUBCATEGORIES = [
  { id: 'food_ingredients', name: '식재료비' },
  { id: 'daily_goods', name: '생활용품' },
];

const TRANSPORT_COST_SUBCATEGORIES = [
  { id: 'public_transit', name: '대중교통' },
  { id: 'taxi', name: '택시' },
  { id: 'transport_card_recharge', name: '교통카드충전' },
  { id: 'other_transport', name: '기타교통' },
];

const DEFAULT_CATEGORIES = [
  budgetCategory('생활유지비', '주거비용', 85, '🏠', 1, 1, ['월세', '관리비', '주거', '임대료'], 'fixed'),
  budgetCategory('생활유지비', '보험비용', 9, '🛡️', 1, 2, ['보험', '보험료'], 'fixed'),
  budgetCategory('생활유지비', '통신비용', 5, '📱', 1, 3, ['통신', '휴대폰', '핸드폰', '인터넷', '유플러스', 'kt', 'skt'], 'fixed'),
  {
    ...budgetCategory('생활유지비', '교통비용', 6, '🚇', 1, 4, ['교통', '택시', '버스', '지하철', '충전', '티머니', '후불교통'], 'fixed'),
    subcategories: TRANSPORT_COST_SUBCATEGORIES,
  },
  {
    ...budgetCategory('생활유지비', '생활비용', 40, '🧺', 1, 5, ['마트', '편의점', '쿠팡', '쿠팡이츠', 'coupang', '생활', '식비', '배달', '음식', '생활용품']),
    subcategories: LIVING_COST_SUBCATEGORIES,
  },
  budgetCategory('자아유지비', '교육비용', 20, '📚', 2, 1, ['교육', '강의', '학원', '책', '도서', '클래스']),
  budgetCategory('자아유지비', '카페비용', 4, '☕', 2, 2, ['카페', '커피', '스타벅스', '투썸', '이디야', '메가커피', '컴포즈']),
  budgetCategory('자아유지비', '정신건강', 36, '🌿', 2, 3, ['상담', '정신건강', '심리', '명상']),
  budgetCategory('변동비', '헬스미용피부', 5, '💆', 3, 1, ['헬스', '미용', '피부', '네일', '미용실', '필라테스', '운동']),
  budgetCategory('변동비', '대인관계1', 20, '🤝', 3, 2, ['대인관계1', '모임', '친구', '식사', '술자리']),
  budgetCategory('변동비', '대인관계2', 10, '💬', 3, 3, ['대인관계2']),
  budgetCategory('변동비', '와인/야식', 15, '🍷', 3, 4, ['와인', '와인앤모어', '주류', '바틀샵', '야식', '치킨', '피자', '족발']),
  budgetCategory('변동비', '취미/여가/의류/쇼핑/기타', 0, '🛍️', 3, 5, ['취미', '여가', '의류', '쇼핑', '기타', '게임']),
  budgetCategory(UNCATEGORIZED_CATEGORY_NAME, UNCATEGORIZED_CATEGORY_NAME, 0, '❔', 99, 1, []),
  { name: '월급', emoji: '💰', kind: 'income', target: 0, color: '#10b981' },
  { name: '용돈', emoji: '🎁', kind: 'income', target: 0, color: '#3b82f6' },
];

function budgetCategory(parent, name, manwon, emoji, parentOrder, order, autoMatch = [], budgetRhythm = 'spread') {
  return {
    parent,
    name,
    emoji,
    kind: 'expense',
    target: manwon * 10000,
    monthlyTargets: { [BUDGET_MONTH_KEY]: manwon * 10000 },
    targetUnit: 'manwon',
    targetManwon: manwon,
    budgetMonth: BUDGET_MONTH_KEY,
    tier: 'budget',
    parentOrder,
    order,
    autoMatch,
    budgetRhythm,
    color: parent === '생활유지비' ? '#7a9b76' : parent === '자아유지비' ? '#d97757' : '#c8a35a',
  };
}

async function _seedCategories() {
  const ref = collection(_db, 'users', _scope(), 'categories');
  for (const cat of DEFAULT_CATEGORIES) {
    await addDoc(ref, cat);
  }
  const snap = await getDocs(ref);
  _cache.categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log('[data] 기본 카테고리 시드 완료');
}

async function _ensureBudgetCategoryIntegrity() {
  const ref = collection(_db, 'users', _scope(), 'categories');
  let changed = false;
  const categories = _cache.categories || [];
  const ensureSubcategories = async (categoryName, requiredSubs) => {
    const category = categories.find(cat => cat.kind === 'expense' && cat.name === categoryName);
    if (!category?.id) return;
    const currentSubs = normalizeSubcategories(category.subcategories);
    const missingSubs = requiredSubs.filter(sub => !currentSubs.some(item => item.name === sub.name));
    if (!missingSubs.length) return;
    await setDoc(doc(_db, 'users', _scope(), 'categories', category.id), {
      subcategories: [...currentSubs, ...missingSubs],
      updatedAt: serverTimestamp(),
    }, { merge: true });
    changed = true;
  };

  const hasUncategorized = categories.some(cat => cat.kind === 'expense' && cat.name === UNCATEGORIZED_CATEGORY_NAME);
  if (!hasUncategorized) {
    await addDoc(ref, budgetCategory(UNCATEGORIZED_CATEGORY_NAME, UNCATEGORIZED_CATEGORY_NAME, 0, '❔', 99, 1, []));
    changed = true;
  }

  const livingCost = categories.find(cat => cat.kind === 'expense' && cat.name === '생활비용');
  if (livingCost?.id) {
    const existing = Array.isArray(livingCost.autoMatch) ? livingCost.autoMatch : [];
    const required = ['쿠팡', '쿠팡이츠', 'coupang', '생활용품'];
    const missing = required.filter(keyword => !existing.some(value => normalizeParty(value) === normalizeParty(keyword)));
    if (missing.length) {
      await setDoc(doc(_db, 'users', _scope(), 'categories', livingCost.id), {
        autoMatch: [...existing, ...missing],
        updatedAt: serverTimestamp(),
      }, { merge: true });
      changed = true;
    }
  }

  await ensureSubcategories('생활비용', LIVING_COST_SUBCATEGORIES);
  await ensureSubcategories('교통비용', TRANSPORT_COST_SUBCATEGORIES);

  if (changed) {
    const snap = await getDocs(ref);
    _cache.categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

async function _ensureBudgetCategorySchema() {
  const uid = _scope();
  const metaRef = doc(_db, 'users', uid, 'settings', 'category_schema');
  const metaSnap = await getDoc(metaRef);
  const meta = metaSnap.exists() ? metaSnap.data() : null;

  const action = decideCategoryMigrationAction({
    meta,
    targetVersion: BUDGET_SCHEMA_VERSION,
    sessionAttempted: categoryMigrationSessionAttempted,
    lastFailureAt: readCategoryMigrationBackoffAt(),
  });
  if (action === 'skip-done' || action === 'skip-session-limit' || action === 'skip-backoff') return;

  categoryMigrationSessionAttempted = true;
  try {
    if (action === 'resume') await _resumeCategoryMigration(uid, metaRef, meta);
    else await _startCategoryMigration(uid, metaRef);
    clearCategoryMigrationBackoff();
  } catch (err) {
    // 다음 진입은 stage:'migrating' 로 재개(삭제·리시드 재반복 없음)하지만,
    // 세션 내에서는 더 시도하지 않고 이후 세션도 최소 1시간은 쉰다.
    recordCategoryMigrationFailure();
    throw err;
  }
}

// 첫 진입: 파괴 단계(삭제·리시드) 전에 재개용 legacy 스냅샷부터 남긴다.
async function _startCategoryMigration(uid, metaRef) {
  const ref = collection(_db, 'users', uid, 'categories');
  const existingSnap = await getDocs(ref);
  const existingCategories = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const legacy = existingCategories.map(cat => ({ name: cat.name || null }));

  await setDoc(metaRef, {
    version: BUDGET_SCHEMA_VERSION,
    stage: 'migrating',
    budgetMonth: BUDGET_MONTH_KEY,
    legacy,
    startedAt: serverTimestamp(),
  }, { merge: true });

  await _deleteAndReseedCategories(ref, existingSnap.docs);
  await remapTransactionsFromMay2026(legacy);
  await _markCategoryMigrationDone(metaRef);
}

// 재진입(stage==='migrating'): 삭제·리시드는 건너뛰고 DEFAULT 세트 대비
// 부족분만 보충한 뒤, meta 에 남겨둔 legacy 로 리맵부터 재개한다.
async function _resumeCategoryMigration(uid, metaRef, meta) {
  const legacy = Array.isArray(meta?.legacy) ? meta.legacy : [];
  await _ensureDefaultCategoriesPresent(uid);
  await remapTransactionsFromMay2026(legacy);
  await _markCategoryMigrationDone(metaRef);
}

async function _markCategoryMigrationDone(metaRef) {
  await setDoc(metaRef, {
    version: BUDGET_SCHEMA_VERSION,
    stage: 'done',
    budgetMonth: BUDGET_MONTH_KEY,
    migratedAt: serverTimestamp(),
  }, { merge: true });
}

// 기존 카테고리 전체 삭제 + DEFAULT_CATEGORIES 16개 리시드를 한 배치(또는 몇 개
// 청크)로 묶어 커밋한다 — 예전엔 개별 deleteDoc/addDoc 을 순차로 await 해서
// 중간에 실패하면 삭제만 되고 리시드가 안 된 반쪽 상태가 남을 수 있었다.
async function _deleteAndReseedCategories(ref, existingDocs) {
  const deleteOps = existingDocs.map(docSnap => batch => batch.delete(docSnap.ref));
  const addOps = DEFAULT_CATEGORIES.map(cat => batch => batch.set(doc(ref), cat));
  await _commitBatchedOps([...deleteOps, ...addOps]);
}

async function _ensureDefaultCategoriesPresent(uid) {
  const ref = collection(_db, 'users', uid, 'categories');
  const snap = await getDocs(ref);
  const existingNames = snap.docs.map(d => d.data()?.name);
  const missing = missingDefaultCategories(existingNames, DEFAULT_CATEGORIES);
  if (!missing.length) return;
  await _commitBatchedOps(missing.map(cat => batch => batch.set(doc(ref), cat)));
}

async function _commitBatchedOps(opFns) {
  for (const chunk of chunkArray(opFns, 450)) {
    const batch = writeBatch(_db);
    chunk.forEach(fn => fn(batch));
    await batch.commit();
  }
}

async function _ensureBudgetRhythms() {
  const missing = (_cache.categories || []).filter(cat => cat.kind === 'expense' && !cat.budgetRhythm);
  if (missing.length === 0) return;
  await Promise.all(missing.map(cat => {
    const rhythm = DEFAULT_BUDGET_RHYTHMS[cat.name] || 'spread';
    return setDoc(doc(_db, 'users', _scope(), 'categories', cat.id), {
      budgetRhythm: rhythm,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }));
  _cache.categories = _cache.categories.map(cat => cat.kind === 'expense' && !cat.budgetRhythm
    ? { ...cat, budgetRhythm: DEFAULT_BUDGET_RHYTHMS[cat.name] || 'spread' }
    : cat);
}

// previousCategories: legacy 스냅샷( [{name}, ...] ) — meta.legacy 그대로 오거나
// (재개 경로) 마이그레이션 시작 시점의 기존 카테고리 목록(신규 경로) 둘 다 받는다.
// 최대 1000건을 writeBatch 청크로 커밋한다 — 예전엔 건별 updateDoc(최대 1000회
// 개별 요청)이었다. 매핑이 결정적이라 재개 중 일부가 이미 반영돼 있어도 같은
// 값으로 다시 쓰는 것뿐이라 안전하다(멱등).
async function remapTransactionsFromMay2026(previousCategories) {
  const uid = _scope();
  const ref = collection(_db, 'users', uid, 'transactions');
  const q = query(ref, where('occurredAt', '>=', Timestamp.fromDate(BUDGET_START_DATE)), limit(1000));
  const snap = await getDocs(q);
  const previousNames = new Set((previousCategories || []).map(c => c?.name).filter(Boolean));
  const opFns = snap.docs.map(d => {
    const tx = { id: d.id, ...d.data() };
    const mapped = mapTxToBudgetCategory(tx);
    const previousCategory = resolvePreviousCategory(tx, previousNames);
    return batch => batch.update(d.ref, {
      previousCategory,
      category: mapped,
      needsReview: mapped ? !!tx.needsReview : true,
      updatedAt: serverTimestamp(),
    });
  });
  await _commitBatchedOps(opFns);
}

export function getCategories() { return _cache.categories || []; }

export function getCategoryById(id) { return getCategories().find(c => c.id === id); }

export function getCategoryByName(name) { return getCategories().find(c => c.name === name); }

export async function saveCategory(cat) {
  if (fixtureActive()) {
    const { id, ...patch } = cat;
    fixturePatchCategory(id, patch);
    return;
  }
  if (cat.id) {
    const ref = doc(_db, 'users', _scope(), 'categories', cat.id);
    const { id, ...patch } = cat;
    await setDoc(ref, patch, { merge: true });
  } else {
    const ref = collection(_db, 'users', _scope(), 'categories');
    await addDoc(ref, cat);
  }
  await loadCategories();
}

export async function saveCategoryMonthlyTarget(categoryId, monthKey, amount) {
  const cat = getCategoryById(categoryId);
  const normalized = Math.max(0, Math.round(Number(amount) || 0));
  if (fixtureActive()) {
    fixturePatchCategory(categoryId, {
      target: monthKey === BUDGET_MONTH_KEY ? normalized : (cat?.target || normalized),
      monthlyTargets: { ...(cat?.monthlyTargets || {}), [monthKey]: normalized },
    });
    return;
  }
  const ref = doc(_db, 'users', _scope(), 'categories', categoryId);
  await setDoc(ref, {
    target: monthKey === BUDGET_MONTH_KEY ? normalized : (cat?.target || normalized),
    monthlyTargets: {
      ...(cat?.monthlyTargets || {}),
      [monthKey]: normalized,
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await loadCategories();
}

export async function saveCategoryAutoManaged(categoryId, autoManaged) {
  if (fixtureActive()) {
    fixturePatchCategory(categoryId, { autoManaged: autoManaged !== false });
    return;
  }
  const ref = doc(_db, 'users', _scope(), 'categories', categoryId);
  await setDoc(ref, {
    autoManaged: autoManaged !== false,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await loadCategories();
}

export async function saveCategoryBudgetRhythm(categoryId, budgetRhythm) {
  const allowed = ['fixed', 'front_loaded', 'spread'];
  const normalized = allowed.includes(budgetRhythm) ? budgetRhythm : 'spread';
  if (fixtureActive()) {
    fixturePatchCategory(categoryId, { budgetRhythm: normalized });
    return;
  }
  const ref = doc(_db, 'users', _scope(), 'categories', categoryId);
  await setDoc(ref, {
    budgetRhythm: normalized,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await loadCategories();
}

export async function saveCategorySubcategory(categoryName, subcategory) {
  const cat = getCategoryByName(categoryName);
  if (!cat) throw new Error('카테고리를 먼저 선택하세요.');
  const name = String(subcategory?.name || '').trim();
  if (!name) throw new Error('상세분류 이름을 입력하세요.');

  const current = normalizeSubcategories(cat.subcategories);
  const id = subcategory?.id || `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const existing = current.find(item => item.id === id);
  const oldName = existing?.name || null;
  const next = current.some(item => item.id === id)
    ? current.map(item => item.id === id ? { ...item, name } : item)
    : current.concat({ id, name });

  await setDoc(doc(_db, 'users', _scope(), 'categories', cat.id), {
    subcategories: next,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await loadCategories();

  if (oldName && oldName !== name) {
    await remapTransactionSubcategory(cat.name, oldName, name);
  }
  return { id, name };
}

export async function deleteCategorySubcategory(categoryName, subcategoryId) {
  const cat = getCategoryByName(categoryName);
  if (!cat) throw new Error('카테고리를 찾을 수 없습니다.');
  const current = normalizeSubcategories(cat.subcategories);
  const removed = current.find(item => item.id === subcategoryId);
  if (!removed) return;

  await setDoc(doc(_db, 'users', _scope(), 'categories', cat.id), {
    subcategories: current.filter(item => item.id !== subcategoryId),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await loadCategories();
  await remapTransactionSubcategory(cat.name, removed.name, null);
}

function normalizeSubcategories(value) {
  return Array.isArray(value)
    ? value.map((item, index) => {
      if (typeof item === 'string') return { id: `legacy_${index}_${normalizeParty(item)}`, name: item.trim() };
      return { id: item.id || `legacy_${index}_${normalizeParty(item.name)}`, name: String(item.name || '').trim() };
    }).filter(item => item.name)
    : [];
}

async function remapTransactionSubcategory(categoryName, fromName, toName) {
  const ref = collection(_db, 'users', _scope(), 'transactions');
  const snap = await getDocs(query(ref, where('category', '==', categoryName), limit(1000)));
  const batch = writeBatch(_db);
  let count = 0;
  snap.docs.forEach(d => {
    if ((d.data().subcategory || null) !== fromName) return;
    batch.update(d.ref, {
      subcategory: toName || null,
      updatedAt: serverTimestamp(),
    });
    count += 1;
  });
  if (count) await batch.commit();
}

export async function deleteCategory(id) {
  const ref = doc(_db, 'users', _scope(), 'categories', id);
  await deleteDoc(ref);
  await loadCategories();
}
