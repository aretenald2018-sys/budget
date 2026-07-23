import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import {
  firestoreDb as _db,
  scope as _scope,
  sessionCache as _cache,
} from '../core/firebase.js';
import { normalizeDate as normalizeTxDate } from '../shared/normalize.js';
import { normalizeMonthKey, normalizeProvisionFund, validateAdjustment } from '../../domain/funds/provision.js';
import { queueDaybirdRefresh } from '../../utils/daybird-sync.js';

// ================================================================
// provision_funds — 충당금(비정기 지출 대비 주머니) 마스터
// ================================================================
export async function loadProvisionFunds() {
  const ref = collection(_db, 'users', _scope(), 'provision_funds');
  const snap = await getDocs(ref);
  _cache.provisionFunds = snap.docs
    .map(d => ({ ...normalizeProvisionFund({ id: d.id, ...d.data() }), id: d.id }))
    .sort((a, b) => a.order - b.order);
}

export function getProvisionFunds() { return _cache.provisionFunds || []; }

export function getActiveProvisionFunds() { return getProvisionFunds().filter(fund => fund.active); }

export function getProvisionFundById(id) { return getProvisionFunds().find(fund => fund.id === id); }

export async function saveProvisionFund(fund = {}) {
  const normalized = normalizeProvisionFund(fund, getProvisionFunds().length);
  const { id, ...payload } = normalized;
  if (fund.id) {
    const ref = doc(_db, 'users', _scope(), 'provision_funds', String(fund.id));
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
  } else {
    await addDoc(collection(_db, 'users', _scope(), 'provision_funds'), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await loadProvisionFunds();
  void queueDaybirdRefresh('provision-fund-update');
}

export async function deactivateProvisionFund(fundId) {
  const id = String(fundId || '').trim();
  if (!id) throw new Error('충당금을 찾을 수 없습니다.');
  const ref = doc(_db, 'users', _scope(), 'provision_funds', id);
  await setDoc(ref, { active: false, updatedAt: serverTimestamp() }, { merge: true });
  await loadProvisionFunds();
  void queueDaybirdRefresh('provision-fund-deactivate');
}

// 복합 인덱스 없이 fundId 조건만 조회하고 정렬은 클라이언트에서 수행.
export async function listFundDrawTransactions(fundId, max = 500) {
  const id = String(fundId || '').trim();
  if (!id) return [];
  const ref = collection(_db, 'users', _scope(), 'transactions');
  const snap = await getDocs(query(ref, where('fundId', '==', id), limit(Math.min(500, Math.max(1, max)))));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const left = normalizeTxDate(b.occurredAt)?.getTime() || 0;
      const right = normalizeTxDate(a.occurredAt)?.getTime() || 0;
      return left - right;
    });
}

// ================================================================
// budget_adjustments — 재배분/입금 결정 원장 (append-only)
// monthlyTargets는 변경하지 않는다: 결정 이력이 가시적·가역적이어야 함.
// ================================================================
export async function listBudgetAdjustments(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'budget_adjustments');
  const conditions = [];
  if (opts.monthKey) conditions.push(where('monthKey', '==', normalizeMonthKey(opts.monthKey)));
  const max = Math.min(500, Math.max(1, Math.round(Number(opts.max) || 200)));
  const snap = await getDocs(query(ref, ...conditions, limit(max)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (normalizeTxDate(b.occurredAt)?.getTime() || 0) - (normalizeTxDate(a.occurredAt)?.getTime() || 0));
}

export async function saveBudgetAdjustment(adjustment = {}) {
  const payload = prepareBudgetAdjustment(adjustment);
  const ref = await addDoc(collection(_db, 'users', _scope(), 'budget_adjustments'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  void queueDaybirdRefresh('budget-adjustment-create');
  return ref.id;
}

export async function deleteBudgetAdjustment(adjustmentId) {
  const id = String(adjustmentId || '').trim();
  if (!id) throw new Error('재배분 이력을 찾을 수 없습니다.');
  await deleteDoc(doc(_db, 'users', _scope(), 'budget_adjustments', id));
  void queueDaybirdRefresh('budget-adjustment-delete');
}

function prepareBudgetAdjustment(adjustment = {}) {
  const verdict = validateAdjustment(adjustment);
  if (!verdict.valid) throw new Error(verdict.reason);
  const occurredAt = normalizeTxDate(adjustment.occurredAt) || new Date();
  const scope = adjustment.scope === 'month' ? 'month' : 'cycle';
  return {
    monthKey: normalizeMonthKey(adjustment.monthKey, occurredAt),
    scope,
    cycleStartDate: scope === 'cycle' ? String(adjustment.cycleStartDate || '').slice(0, 10) || null : null,
    from: prepareAdjustmentSide(adjustment.from),
    to: prepareAdjustmentSide(adjustment.to),
    amount: Math.min(999999999, Math.max(1, Math.round(Number(adjustment.amount) || 0))),
    note: String(adjustment.note || '').trim().slice(0, 120),
    occurredAt: Timestamp.fromDate(occurredAt),
  };
}

function prepareAdjustmentSide(side = {}) {
  return {
    kind: ['category', 'fund', 'external'].includes(side.kind) ? side.kind : 'category',
    id: String(side.id || '').trim().slice(0, 64) || null,
    label: String(side.label || '').trim().slice(0, 32) || null,
  };
}
