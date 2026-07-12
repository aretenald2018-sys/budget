import { FieldValue, getAdminDb, userScope } from '../_lib/firebase-admin.js';

export const recipeAnalysisStoreAdapter = {
  async listRecent(limit) {
    const snap = await getAdminDb().collection('users').doc(userScope()).collection('cart_items')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return {
      size: snap.size,
      items: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    };
  },

  async patch(id, patch) {
    await getAdminDb().collection('users').doc(userScope()).collection('cart_items').doc(id)
      .set(patch, { merge: true });
  },

  serverTimestamp() { return FieldValue.serverTimestamp(); },
  increment(value) { return FieldValue.increment(value); },
};
