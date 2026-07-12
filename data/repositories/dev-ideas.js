import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { firestoreDb as _db, scope as _scope } from '../core/firebase.js';
import { DEV_IDEA_STATUS } from '../constants.js';

const DEV_IDEA_STATUS_VALUES = new Set(Object.values(DEV_IDEA_STATUS));

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
