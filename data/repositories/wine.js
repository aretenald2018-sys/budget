import {
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

import { firestoreDb as _db, scope as _scope } from '../core/firebase.js';
import { fixtureActive, fixtureListWineBottles, fixtureListWineTastings } from '../core/fixtures.js';
import {
  normalizeWineBottleRecord,
  normalizeWineTastingRecord,
  wineBottleSortKey,
  wineTastingSortKey,
} from '../../domain/wine/records.js';

// 목록 쿼리에 orderBy 를 쓰지 않는다: orderBy 는 정렬 필드가 없는 문서를
// 결과에서 통째로 제외해서, 저장은 됐는데 앱에서만 안 보이는 사고가 난다.
// 개인 컬렉션이라 전부 읽어 클라이언트에서 정렬해도 충분히 작다.
export async function listWineBottles(opts = {}) {
  if (fixtureActive()) return fixtureListWineBottles(opts);
  const ref = collection(_db, 'users', _scope(), 'wine_bottles');
  const snapshot = await getDocs(ref);
  return snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .sort((left, right) => wineBottleSortKey(right) - wineBottleSortKey(left))
    .slice(0, opts.max || 100);
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
    return bottle.id;
  }
  const reference = doc(collection(_db, 'users', _scope(), 'wine_bottles'));
  await setDoc(reference, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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
}

export async function listWineTastings(opts = {}) {
  if (fixtureActive()) return fixtureListWineTastings(opts);
  const ref = collection(_db, 'users', _scope(), 'wine_tastings');
  const queryRef = opts.bottleId
    ? query(ref, where('bottleId', '==', opts.bottleId), limit(opts.max || 100))
    : ref;
  const snapshot = await getDocs(queryRef);
  return snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .sort((left, right) => wineTastingSortKey(right) - wineTastingSortKey(left))
    .slice(0, opts.max || 100);
}

export async function saveWineTasting(note = {}) {
  const normalized = normalizeWineTastingRecord(note);
  const payload = { ...normalized, tastedAt: Timestamp.fromDate(normalized.tastedAt) };
  if (note.id) {
    await setDoc(doc(_db, 'users', _scope(), 'wine_tastings', note.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return note.id;
  }
  const reference = doc(collection(_db, 'users', _scope(), 'wine_tastings'));
  await setDoc(reference, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return reference.id;
}

// 테이스팅 폼의 '＋ 새 와인 추가' — 와인과 테이스팅을 한 배치로 커밋한다.
// 두 번의 개별 await 사이에서 연결이 끊기면 와인만 생기고 테이스팅이 사라지는
// 반쪽 저장이 났었다. 배치라 전부 반영되거나 전부 반영되지 않는다.
export async function saveWineTastingWithNewBottle({ bottle = {}, tasting = {} } = {}) {
  const uid = _scope();
  const bottlePayload = normalizeWineBottleRecord(bottle);
  const bottleRef = doc(collection(_db, 'users', uid, 'wine_bottles'));
  const normalized = normalizeWineTastingRecord({ ...tasting, bottleId: bottleRef.id });
  const tastingPayload = { ...normalized, tastedAt: Timestamp.fromDate(normalized.tastedAt) };
  const tastingRef = tasting.id
    ? doc(_db, 'users', uid, 'wine_tastings', tasting.id)
    : doc(collection(_db, 'users', uid, 'wine_tastings'));

  const batch = writeBatch(_db);
  batch.set(bottleRef, {
    ...bottlePayload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (tasting.id) {
    batch.set(tastingRef, { ...tastingPayload, updatedAt: serverTimestamp() }, { merge: true });
  } else {
    batch.set(tastingRef, {
      ...tastingPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return { bottleId: bottleRef.id, tastingId: tastingRef.id };
}

export async function deleteWineTasting(noteId) {
  await deleteDoc(doc(_db, 'users', _scope(), 'wine_tastings', noteId));
}
