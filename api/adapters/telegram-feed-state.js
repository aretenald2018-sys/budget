import { FieldValue, getAdminDb, Timestamp, userScope } from '../_lib/firebase-admin.js';
import { TELEGRAM_PUBLIC_SOURCE_VERSION } from '../../utils/telegram-sources.js';

export const telegramFeedStateAdapter = {
  async load() {
    const snap = await integrationDocRef(getAdminDb(), userScope()).get();
    return snap.exists ? (snap.data() || {}) : {};
  },

  async persist(sourceResults, { now }) {
    const db = getAdminDb();
    const uid = userScope();
    const rows = sourceResults.flatMap(result => result.ok ? result.itemsToSave : []);
    const collectionRef = db.collection('users').doc(uid).collection('newsfeed_items');

    for (let offset = 0; offset < rows.length; offset += 430) {
      const batch = db.batch();
      for (const item of rows.slice(offset, offset + 430)) {
        batch.set(collectionRef.doc(item.id), serializeFeedItem(item), { merge: true });
      }
      await batch.commit();
    }

    const statusBatch = db.batch();
    statusBatch.set(integrationDocRef(db, uid), buildIntegrationStatus(sourceResults, now), { merge: true });
    await statusBatch.commit();
  },
};

function integrationDocRef(db, uid) {
  return db.collection('users').doc(uid).collection('integrations').doc('telegram_public_feed');
}

function buildIntegrationStatus(sourceResults, now) {
  const sources = {};
  for (const result of sourceResults) {
    sources[result.source.id] = {
      id: result.source.id,
      title: result.source.title,
      handle: result.source.handle,
      category: result.source.category,
      ok: result.ok,
      latestMessageId: result.latestMessageId || result.previousLatestMessageId || null,
      latestPostedAt: result.latestPostedAt ? Timestamp.fromDate(result.latestPostedAt) : null,
      oldestMessageId: result.oldestMessageId || null,
      oldestPostedAt: result.oldestPostedAt ? Timestamp.fromDate(result.oldestPostedAt) : null,
      fetchedCount: result.fetchedCount || 0,
      savedCount: result.itemsToSave?.length || 0,
      pagesFetched: result.pagesFetched || 0,
      backfillComplete: result.backfillComplete ?? null,
      error: result.error || null,
      checkedAt: Timestamp.fromDate(now),
    };
  }
  return {
    sourceType: 'telegram_public',
    sourceVersion: TELEGRAM_PUBLIC_SOURCE_VERSION,
    sourceCount: sourceResults.length,
    lastRunAt: Timestamp.fromDate(now),
    lastSuccessAt: sourceResults.some(result => result.ok) ? Timestamp.fromDate(now) : null,
    updatedAt: FieldValue.serverTimestamp(),
    sources,
  };
}

function serializeFeedItem(item) {
  return {
    ...item,
    postedAt: Timestamp.fromDate(item.postedAt),
    receivedAt: Timestamp.fromDate(item.receivedAt),
    collectedAt: Timestamp.fromDate(item.collectedAt),
    updatedAt: FieldValue.serverTimestamp(),
  };
}
