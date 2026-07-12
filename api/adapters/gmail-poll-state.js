import { FieldValue, getAdminDb, Timestamp, userScope } from '../_lib/firebase-admin.js';

export const gmailPollStateAdapter = {
  async getLastPollTime() {
    const snap = await metaRef().get();
    const value = snap.exists ? snap.data().lastPollTime : null;
    if (value?.toDate) return value.toDate();
    return new Date(Date.now() - 24 * 60 * 60 * 1000);
  },

  async setLastPollTime(date) {
    await metaRef().set({
      lastPollTime: Timestamp.fromDate(date),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  },
};

function metaRef() {
  return getAdminDb().collection('users').doc(userScope()).collection('meta').doc('gmail_poll');
}
