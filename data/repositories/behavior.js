import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { firestoreDb as _db, scope as _scope } from '../core/firebase.js';
import { DEV_IDEA_STATUS } from '../constants.js';
import { normalizeDate as normalizeTxDate } from '../shared/normalize.js';

const DEV_IDEA_STATUS_VALUES = new Set(Object.values(DEV_IDEA_STATUS));

export async function saveUrge(urge) {
  const ref = collection(_db, 'users', _scope(), 'urges');
  const payload = {
    what: urge.what || '',
    estimatedPrice: Math.max(0, Math.round(Number(urge.estimatedPrice) || 0)),
    desireType: urge.desireType || 'buy',
    originalPortion: urge.originalPortion || null,
    plannedPortion: urge.plannedPortion || null,
    category: urge.category || null,
    mood: urge.mood || null,
    context: urge.context || null,
    alternatives: urge.alternatives || [],
    status: urge.status || 'pending',
    chosenAlternativeId: urge.chosenAlternativeId || null,
    resolvedAt: urge.resolvedAt || null,
    txId: urge.txId || null,
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(ref, payload);
  return docRef.id;
}

export async function updateUrge(urgeId, patch) {
  const ref = doc(_db, 'users', _scope(), 'urges', urgeId);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

export async function getUrge(urgeId) {
  const ref = doc(_db, 'users', _scope(), 'urges', urgeId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listUrges(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'urges');
  const conds = [];
  if (opts.status) conds.push(where('status', '==', opts.status));
  try {
    const q = query(ref, ...conds, orderBy('createdAt', 'desc'), limit(opts.max || 50));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    if (!opts.status || err.code !== 'failed-precondition') throw err;
    const snap = await getDocs(query(ref, orderBy('createdAt', 'desc'), limit((opts.max || 50) * 3)));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(item => item.status === opts.status)
      .slice(0, opts.max || 50);
  }
}

export async function saveMindbankEntry(entry) {
  const ref = collection(_db, 'users', _scope(), 'mindbank');
  const payload = {
    urgeId: entry.urgeId || null,
    urgeWhat: entry.urgeWhat || '',
    urgePrice: Math.max(0, Math.round(Number(entry.urgePrice) || 0)),
    desireType: entry.desireType || null,
    choiceType: entry.choiceType || 'substitute',
    choiceTitle: entry.choiceTitle || '',
    choiceDesc: entry.choiceDesc || '',
    routineTitle: entry.routineTitle || '',
    routineDesc: entry.routineDesc || '',
    savedAmount: Math.max(0, Math.round(Number(entry.savedAmount) || 0)),
    savedKcal: Math.max(0, Math.round(Number(entry.savedKcal) || 0)),
    calorieMeta: entry.calorieMeta || null,
    badges: entry.badges || [],
    reminderAt: entry.reminderAt || null,
    pactId: entry.pactId || null,
    pactTitle: entry.pactTitle || '',
    pactStatus: entry.pactStatus || null,
    mood: entry.mood || null,
    category: entry.category || null,
    occurredAt: entry.occurredAt ? Timestamp.fromDate(normalizeTxDate(entry.occurredAt)) : serverTimestamp(),
    createdAt: serverTimestamp(),
  };
  const docRef = await addDoc(ref, payload);
  return docRef.id;
}

export async function listMindbankEntries(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'mindbank');
  const conds = [];
  if (opts.from) conds.push(where('occurredAt', '>=', Timestamp.fromDate(opts.from)));
  if (opts.to) conds.push(where('occurredAt', '<=', Timestamp.fromDate(opts.to)));
  const q = query(ref, ...conds, orderBy('occurredAt', 'desc'), limit(opts.max || 100));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteMindbankEntry(entryId) {
  const ref = doc(_db, 'users', _scope(), 'mindbank', entryId);
  await deleteDoc(ref);
}

// ================================================================
// personal backlog — dev ideas
// ================================================================
export async function listDevIdeas(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'dev_ideas');
  const q = query(ref, orderBy('createdAt', 'desc'), limit(opts.max || 30));
  const snap = await getDocs(q);
  return snap.docs.map(d => normalizeDevIdea({ id: d.id, ...d.data() }));
}

export async function saveDevIdea(idea) {
  const status = normalizeDevIdeaStatus(idea.status, idea.done);
  const payload = {
    title: String(idea.title || '').trim(),
    note: String(idea.note || '').trim(),
    status,
    done: status === DEV_IDEA_STATUS.DONE,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (!payload.title) throw new Error('아이디어 내용을 입력해 주세요.');
  const docRef = await addDoc(collection(_db, 'users', _scope(), 'dev_ideas'), payload);
  return docRef.id;
}

export async function updateDevIdea(ideaId, patch) {
  const payload = { ...patch, updatedAt: serverTimestamp() };
  if ('title' in payload) payload.title = String(payload.title || '').trim();
  if ('note' in payload) payload.note = String(payload.note || '').trim();
  if ('status' in payload) {
    payload.status = normalizeDevIdeaStatus(payload.status, payload.done);
    payload.done = payload.status === DEV_IDEA_STATUS.DONE;
    if (payload.status === DEV_IDEA_STATUS.RUNNING) payload.startedAt = serverTimestamp();
    if (payload.status === DEV_IDEA_STATUS.DONE) payload.completedAt = serverTimestamp();
    if (payload.status === DEV_IDEA_STATUS.PENDING) {
      payload.startedAt = null;
      payload.completedAt = null;
      payload.failedAt = null;
      payload.lastError = null;
    }
  } else if ('done' in payload) {
    payload.done = !!payload.done;
    payload.status = payload.done ? DEV_IDEA_STATUS.DONE : DEV_IDEA_STATUS.PENDING;
    payload.completedAt = payload.done ? serverTimestamp() : null;
    if (!payload.done) {
      payload.startedAt = null;
      payload.failedAt = null;
      payload.lastError = null;
    }
  }
  await updateDoc(doc(_db, 'users', _scope(), 'dev_ideas', ideaId), payload);
}

export async function deleteDevIdea(ideaId) {
  await deleteDoc(doc(_db, 'users', _scope(), 'dev_ideas', ideaId));
}

function normalizeDevIdea(idea) {
  const status = normalizeDevIdeaStatus(idea.status, idea.done);
  return {
    ...idea,
    status,
    done: status === DEV_IDEA_STATUS.DONE,
  };
}

function normalizeDevIdeaStatus(status, done = false) {
  const value = String(status || '').trim();
  if (DEV_IDEA_STATUS_VALUES.has(value)) return value;
  return done ? DEV_IDEA_STATUS.DONE : DEV_IDEA_STATUS.PENDING;
}

// ================================================================
// pacts — future-self commitments for 소계획/하고픈 것
// ================================================================
export async function listPacts(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'pacts');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc'), limit(opts.max || 100)));
  return snap.docs.map(d => normalizePact({ id: d.id, ...d.data() }));
}

export async function savePact(pact) {
  const payload = preparePactPayload(pact);
  if (pact.id) {
    await setDoc(doc(_db, 'users', _scope(), 'pacts', pact.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return pact.id;
  }
  const ref = await addDoc(collection(_db, 'users', _scope(), 'pacts'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePact(pactId, patch) {
  await setDoc(doc(_db, 'users', _scope(), 'pacts', pactId), {
    ...preparePactPayload(patch, { partial: true }),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function deletePact(pactId) {
  await deleteDoc(doc(_db, 'users', _scope(), 'pacts', pactId));
}

function preparePactPayload(pact = {}, opts = {}) {
  const payload = {};
  if (!opts.partial || 'what' in pact || 'title' in pact) payload.what = normalizePactWhat(pact.what || pact);
  if (!opts.partial || 'trigger' in pact) payload.trigger = normalizePactTrigger(pact.trigger || {});
  if (!opts.partial || 'cost' in pact) payload.cost = normalizePactCost(pact.cost || pact);
  if (!opts.partial || 'signature' in pact) payload.signature = normalizePactSignature(pact.signature || pact);
  if (!opts.partial || 'status' in pact) payload.status = normalizePactStatus(pact.status);
  if (!opts.partial || 'linkedCartItemId' in pact) payload.linkedCartItemId = String(pact.linkedCartItemId || '').trim();
  if (!opts.partial || 'linkedUrgeId' in pact) payload.linkedUrgeId = String(pact.linkedUrgeId || '').trim();
  if (!opts.partial || 'parentPactId' in pact) payload.parentPactId = String(pact.parentPactId || '').trim();
  if (!opts.partial || 'fulfilledTxId' in pact) payload.fulfilledTxId = String(pact.fulfilledTxId || '').trim();
  if (!opts.partial || 'conditions' in pact) payload.conditions = normalizePactConditions(pact.conditions);
  if (!opts.partial || 'sourceUrl' in pact) payload.sourceUrl = String(pact.sourceUrl || pact.url || '').trim();
  if (!opts.partial || 'evidence' in pact) payload.evidence = Array.isArray(pact.evidence) ? pact.evidence.map(String).slice(0, 12) : [];
  if ('fulfilledAt' in pact) payload.fulfilledAt = normalizeTimestampLike(pact.fulfilledAt);
  if ('brokenAt' in pact) payload.brokenAt = normalizeTimestampLike(pact.brokenAt);
  if ('brokenReason' in pact) payload.brokenReason = String(pact.brokenReason || '').trim().slice(0, 300);
  return payload;
}

function normalizePact(value = {}) {
  return {
    ...value,
    what: normalizePactWhat(value.what || value),
    trigger: normalizePactTrigger(value.trigger || {}),
    cost: normalizePactCost(value.cost || {}),
    signature: normalizePactSignature(value.signature || {}),
    status: normalizePactStatus(value.status),
    linkedCartItemId: String(value.linkedCartItemId || '').trim(),
    linkedUrgeId: String(value.linkedUrgeId || '').trim(),
    parentPactId: String(value.parentPactId || '').trim(),
    fulfilledTxId: String(value.fulfilledTxId || '').trim(),
    conditions: normalizePactConditions(value.conditions),
    sourceUrl: String(value.sourceUrl || value.url || '').trim(),
    evidence: Array.isArray(value.evidence) ? value.evidence.map(String) : [],
  };
}

function normalizePactConditions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((condition, index) => {
    const type = String(condition?.type || 'amount').toLowerCase();
    const id = String(condition?.id || `cond_${index}`).trim();
    const label = String(condition?.label || condition?.name || '').trim();
    if (!label) return null;
    return {
      id,
      type: ['amount', 'check', 'date', 'diet', 'number'].includes(type) ? type : 'amount',
      label: label.slice(0, 80),
      current: Math.max(0, Number(condition?.current) || 0),
      target: Math.max(0, Number(condition?.target) || 0),
      unit: String(condition?.unit || '').trim().slice(0, 16),
      done: !!condition?.done,
      dueDate: String(condition?.dueDate || condition?.date || '').trim().slice(0, 24),
      note: String(condition?.note || '').trim().slice(0, 160),
    };
  }).filter(Boolean);
}

function normalizePactWhat(value = {}) {
  const category = String(value.category || value.whatCategory || 'purchase').toLowerCase();
  return {
    title: String(value.title || '').trim() || '이름 없는 약속',
    emoji: String(value.emoji || pactEmoji(category)).trim().slice(0, 4),
    category: ['purchase', 'experience', 'action', 'relation', 'restraint'].includes(category) ? category : 'purchase',
    cost: Math.max(0, Math.round(Number(value.cost ?? value.price) || 0)),
    note: String(value.note || '').trim().slice(0, 500),
    sourceUrl: String(value.sourceUrl || value.url || '').trim(),
    imageUrl: String(value.imageUrl || '').trim(),
    originalImageUrl: String(value.originalImageUrl || '').trim(),
    visualMode: normalizeCartVisualMode(value.visualMode),
    visualCredit: String(value.visualCredit || '').trim().slice(0, 160),
    visualQuery: String(value.visualQuery || '').trim().slice(0, 120),
  };
}

function normalizePactTrigger(value = {}) {
  const type = String(value.type || 'manual').toLowerCase();
  const config = value.config && typeof value.config === 'object' ? value.config : value;
  return {
    type: ['time', 'savings', 'streak', 'measure', 'event', 'manual'].includes(type) ? type : 'manual',
    config: normalizePactTriggerConfig(type, config),
    progress: Math.max(0, Math.min(1, Number(value.progress) || 0)),
  };
}

function normalizePactTriggerConfig(type, config = {}) {
  if (type === 'time') return {
    date: String(config.date || '').slice(0, 10),
    recurrence: ['none', 'daily', 'weekly', 'monthly'].includes(config.recurrence) ? config.recurrence : 'none',
  };
  if (type === 'savings') return {
    targetAmount: Math.max(0, Math.round(Number(config.targetAmount) || 0)),
    currentAmount: Math.max(0, Math.round(Number(config.currentAmount) || 0)),
  };
  if (type === 'streak') return {
    metric: String(config.metric || '습관').trim().slice(0, 40),
    count: Math.max(1, Math.round(Number(config.count) || 1)),
    currentCount: Math.max(0, Math.round(Number(config.currentCount) || 0)),
    of: ['days', 'occurrences'].includes(config.of) ? config.of : 'days',
  };
  if (type === 'measure') return {
    metric: String(config.metric || 'weight').trim().slice(0, 40),
    op: ['<=', '>='].includes(config.op) ? config.op : '<=',
    value: Number(config.value) || 0,
    currentValue: Number(config.currentValue) || 0,
    unit: String(config.unit || '').trim().slice(0, 12),
  };
  if (type === 'event') return {
    eventName: String(config.eventName || '이벤트').trim().slice(0, 80),
    done: !!config.done,
  };
  return { manual: true, done: !!config.done };
}

function normalizePactCost(value = {}) {
  const source = String(value.source || value.costSource || 'budget').toLowerCase();
  return {
    source: ['budget', 'mindbank', 'envelope', 'external'].includes(source) ? source : 'budget',
    envelopeId: String(value.envelopeId || '').trim(),
    accruedAmount: Math.max(0, Math.round(Number(value.accruedAmount) || 0)),
  };
}

function normalizePactSignature(value = {}) {
  return {
    message: String(value.message || '').trim().slice(0, 280),
    cooloffHours: Math.max(0, Math.round(Number(value.cooloffHours) || 24)),
  };
}

function normalizePactStatus(status) {
  const value = String(status || 'active').toLowerCase();
  return ['draft', 'active', 'ripening', 'ready', 'fulfilled', 'broken', 'archived'].includes(value) ? value : 'active';
}

function normalizeTimestampLike(value) {
  if (!value) return null;
  if (value instanceof Date || value?.toDate || value?.seconds) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function pactEmoji(category) {
  if (category === 'experience') return '🌅';
  if (category === 'action') return '🎯';
  if (category === 'relation') return '💝';
  if (category === 'restraint') return '🚫';
  return '🛍';
}
