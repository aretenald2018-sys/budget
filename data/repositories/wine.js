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
  where,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

import { firestoreDb as _db, scope as _scope } from '../core/firebase.js';
import { normalizeDate } from '../shared/normalize.js';
import { normalizeWineBottleRecord, normalizeWineTastingRecord } from '../../domain/wine/records.js';
import { queueDaybirdRefresh } from '../../utils/daybird-sync.js';

export async function listWineBottles(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'wine_bottles');
  const snapshot = await getDocs(query(ref, orderBy('createdAt', 'desc'), limit(opts.max || 100)));
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

export async function getWineBottle(bottleId) {
  const snapshot = await getDoc(doc(_db, 'users', _scope(), 'wine_bottles', bottleId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function saveWineBottle(bottle = {}) {
  const payload = normalizeWineBottleRecord(bottle);
  if (bottle.id) {
    await setDoc(doc(_db, 'users', _scope(), 'wine_bottles', bottle.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    void queueDaybirdRefresh('wine-bottle-update');
    return bottle.id;
  }
  const reference = await addDoc(collection(_db, 'users', _scope(), 'wine_bottles'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  void queueDaybirdRefresh('wine-bottle-create');
  return reference.id;
}

export async function deleteWineBottle(bottleId) {
  const uid = _scope();
  const tastings = await getDocs(query(
    collection(_db, 'users', uid, 'wine_tastings'),
    where('bottleId', '==', bottleId),
    limit(100),
  ));
  await Promise.all(tastings.docs.map(document => deleteDoc(document.ref)));
  await deleteDoc(doc(_db, 'users', uid, 'wine_bottles', bottleId));
  void queueDaybirdRefresh('wine-bottle-delete');
}

export async function listWineTastings(opts = {}) {
  const ref = collection(_db, 'users', _scope(), 'wine_tastings');
  const queryRef = opts.bottleId
    ? query(ref, where('bottleId', '==', opts.bottleId), limit(opts.max || 100))
    : query(ref, orderBy('tastedAt', 'desc'), limit(opts.max || 100));
  const snapshot = await getDocs(queryRef);
  return snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .sort((left, right) => (normalizeDate(right.tastedAt)?.getTime() || 0) - (normalizeDate(left.tastedAt)?.getTime() || 0));
}

export async function saveWineTasting(note = {}) {
  const normalized = normalizeWineTastingRecord(note);
  const payload = { ...normalized, tastedAt: Timestamp.fromDate(normalized.tastedAt) };
  if (note.id) {
    await setDoc(doc(_db, 'users', _scope(), 'wine_tastings', note.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    void queueDaybirdRefresh('wine-tasting-update');
    return note.id;
  }
  const reference = await addDoc(collection(_db, 'users', _scope(), 'wine_tastings'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  void queueDaybirdRefresh('wine-tasting-create');
  return reference.id;
}

export async function deleteWineTasting(noteId) {
  await deleteDoc(doc(_db, 'users', _scope(), 'wine_tastings', noteId));
  void queueDaybirdRefresh('wine-tasting-delete');
}
