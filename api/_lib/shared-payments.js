import {
  applySharedPaymentRule,
  isShareablePayment,
  normalizeSharedPaymentParty,
  shouldSuggestSharedPayment,
  sameSharedPaymentParty,
} from '../../domain/transactions/shared-payment.js';

export async function applySharedPaymentRules(db, uid, txDoc) {
  if (!isShareablePayment(txDoc)) return { txDoc, rule: null, suggested: false };

  const rule = await findSharedPaymentRule(db, uid, txDoc);
  if (rule) {
    return {
      txDoc: applySharedPaymentRule(txDoc, Number(rule.peopleCount) || 2, {
        ruleId: rule.id,
        ruleName: rule.name || null,
      }),
      rule,
      suggested: false,
    };
  }

  if (shouldSuggestSharedPayment(txDoc)) {
    return {
      txDoc: {
        ...txDoc,
        needsReview: true,
        needsSharedReview: true,
      },
      rule: null,
      suggested: true,
    };
  }

  return { txDoc, rule: null, suggested: false };
}

async function findSharedPaymentRule(db, uid, txDoc) {
  const merchantKey = normalizeSharedPaymentParty(txDoc.merchant || txDoc.counterparty);
  if (!merchantKey) return null;

  const snap = await db.collection('users').doc(uid).collection('shared_payment_rules')
    .where('active', '==', true)
    .limit(100)
    .get();

  const match = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .find(rule => {
      const key = normalizeSharedPaymentParty(rule.merchantKey || rule.merchant);
      return key && sameSharedPaymentParty(merchantKey, key, { allowBlank: false });
    });
  return match || null;
}
