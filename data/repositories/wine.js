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
import { normalizeDate as normalizeTxDate } from '../shared/normalize.js';
import { INITIAL_WINES } from '../../wine-data.js';

const WINE_MIGRATION_VERSION = 'tomatofarm-2026-05-01-v1';

// ================================================================
// sensory cellar — wine bottles and tasting notes
// ================================================================
export async function listWineBottles(opts = {}) {
  await ensureWineMigration();
  const ref = collection(_db, 'users', _scope(), 'wine_bottles');
  const q = query(ref, orderBy('createdAt', 'desc'), limit(opts.max || 100));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getWineBottle(bottleId) {
  await ensureWineMigration();
  const ref = doc(_db, 'users', _scope(), 'wine_bottles', bottleId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveWineBottle(bottle) {
  const payload = prepareWineBottlePayload(bottle);
  if (bottle.id) {
    await setDoc(doc(_db, 'users', _scope(), 'wine_bottles', bottle.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return bottle.id;
  }
  const docRef = await addDoc(collection(_db, 'users', _scope(), 'wine_bottles'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteWineBottle(bottleId) {
  const uid = _scope();
  const tastingSnap = await getDocs(query(
    collection(_db, 'users', uid, 'wine_tastings'),
    where('bottleId', '==', bottleId),
    limit(100)
  ));
  await Promise.all(tastingSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(_db, 'users', uid, 'wine_bottles', bottleId));
}

export async function listWineTastings(opts = {}) {
  await ensureWineMigration();
  const ref = collection(_db, 'users', _scope(), 'wine_tastings');
  const q = opts.bottleId
    ? query(ref, where('bottleId', '==', opts.bottleId), limit(opts.max || 100))
    : query(ref, orderBy('tastedAt', 'desc'), limit(opts.max || 100));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (normalizeTxDate(b.tastedAt)?.getTime() || 0) - (normalizeTxDate(a.tastedAt)?.getTime() || 0));
}

export async function saveWineTasting(note) {
  const payload = {
    bottleId: note.bottleId || null,
    tastedAt: note.tastedAt ? Timestamp.fromDate(normalizeTxDate(note.tastedAt)) : Timestamp.fromDate(new Date()),
    occasion: note.occasion || '',
    moodBefore: note.moodBefore || '',
    moodAfter: note.moodAfter || '',
    color: note.color || '',
    nose: note.nose || '',
    palate: note.palate || '',
    structure: normalizeWineStructure(note.structure),
    pairing: note.pairing || '',
    note: note.note || '',
    taewooScore: note.taewooScore ? Number(note.taewooScore) : null,
    taewooSummary: note.taewooSummary || '',
  };
  if (note.id) {
    await setDoc(doc(_db, 'users', _scope(), 'wine_tastings', note.id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return note.id;
  }
  const docRef = await addDoc(collection(_db, 'users', _scope(), 'wine_tastings'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteWineTasting(noteId) {
  await deleteDoc(doc(_db, 'users', _scope(), 'wine_tastings', noteId));
}

async function ensureWineMigration() {
  const uid = _scope();
  const metaRef = doc(_db, 'users', uid, 'settings', 'wine_migration');
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data()?.version === WINE_MIGRATION_VERSION) return;

  const bottleSnap = await getDocs(query(collection(_db, 'users', uid, 'wine_bottles'), limit(1)));
  if (bottleSnap.empty) {
    for (const wine of INITIAL_WINES) {
      const bottle = prepareWineBottlePayload({
        ...wine,
        source: 'tomatofarm',
        status: 'opened',
        acquiredAt: wine.createdAt || null,
      });
      await setDoc(doc(_db, 'users', uid, 'wine_bottles', wine.id), {
        ...bottle,
        createdAt: Timestamp.fromDate(normalizeTxDate(wine.createdAt) || new Date()),
        migratedAt: serverTimestamp(),
      }, { merge: true });
      await setDoc(doc(_db, 'users', uid, 'wine_tastings', `${wine.id}_taste_1`), {
        bottleId: wine.id,
        tastedAt: Timestamp.fromDate(normalizeTxDate(wine.createdAt) || new Date()),
        occasion: '',
        moodBefore: '',
        moodAfter: '',
        color: wine.color || '',
        nose: wine.nose || '',
        palate: wine.palate || '',
        structure: normalizeWineStructure(wine.structure),
        pairing: '',
        note: wine.note || '',
        taewooScore: wine.taewooScore ? Number(wine.taewooScore) : null,
        taewooSummary: wine.taewooSummary || '',
        source: 'tomatofarm',
        createdAt: Timestamp.fromDate(normalizeTxDate(wine.createdAt) || new Date()),
        migratedAt: serverTimestamp(),
      }, { merge: true });
    }
  }

  await setDoc(metaRef, {
    version: WINE_MIGRATION_VERSION,
    migratedAt: serverTimestamp(),
  }, { merge: true });
}

function prepareWineBottlePayload(bottle) {
  return {
    name: bottle.name || '',
    vintage: bottle.vintage ? Number(bottle.vintage) : null,
    region: bottle.region || '',
    variety: bottle.variety || '',
    status: bottle.status || 'cellared',
    price: Math.max(0, Math.round(Number(bottle.price) || 0)),
    merchant: bottle.merchant || '',
    acquiredAt: bottle.acquiredAt ? Timestamp.fromDate(normalizeTxDate(bottle.acquiredAt)) : null,
    txId: bottle.txId || null,
    urgeId: bottle.urgeId || null,
    imageUrl: bottle.imageUrl || null,
    source: bottle.source || 'sensory-bank',
  };
}

function normalizeWineStructure(structure = {}) {
  return {
    sweetness: structure.sweetness ? Number(structure.sweetness) : null,
    tannin: structure.tannin ? Number(structure.tannin) : null,
    acidity: structure.acidity ? Number(structure.acidity) : null,
    alcohol: structure.alcohol ? Number(structure.alcohol) : null,
  };
}
