export async function applySharedPaymentRules(db, uid, txDoc) {
  if (!isShareablePayment(txDoc)) return { txDoc, rule: null, suggested: false };

  const rule = await findSharedPaymentRule(db, uid, txDoc);
  if (rule) {
    return {
      txDoc: applyPeopleCount(txDoc, Number(rule.peopleCount) || 2, {
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
  const merchantKey = normalizeMerchant(txDoc.merchant || txDoc.counterparty);
  if (!merchantKey) return null;

  const snap = await db.collection('users').doc(uid).collection('shared_payment_rules')
    .where('active', '==', true)
    .limit(100)
    .get();

  const match = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .find(rule => {
      const key = normalizeMerchant(rule.merchantKey || rule.merchant);
      return key && (merchantKey === key || merchantKey.includes(key) || key.includes(merchantKey));
    });
  return match || null;
}

function applyPeopleCount(txDoc, peopleCount, ruleMeta = {}) {
  const originalAmount = Number(txDoc.sharedPayment?.originalAmount || txDoc.amount) || 0;
  const myAmount = Math.max(1, Math.round(originalAmount / Math.max(2, peopleCount)));
  return {
    ...txDoc,
    amount: myAmount,
    needsSharedReview: false,
    sharedPayment: {
      status: 'applied',
      originalAmount,
      peopleCount: Math.max(2, peopleCount),
      myAmount,
      appliedAt: new Date().toISOString(),
      ...ruleMeta,
    },
  };
}

function shouldSuggestSharedPayment(txDoc) {
  if (!isShareablePayment(txDoc)) return false;
  if ((Number(txDoc.amount) || 0) < 20000) return false;
  const text = normalizeMerchant([txDoc.category, txDoc.merchant, txDoc.counterparty, txDoc.body].filter(Boolean).join(' '));
  return ['카페', '커피', 'cafe', 'coffee', '스타벅스', '투썸', '이디야', '메가커피', '컴포즈', '스마트파이브']
    .some(keyword => text.includes(normalizeMerchant(keyword)));
}

function isShareablePayment(txDoc) {
  return txDoc?.type === 'card_payment' && !txDoc.sharedPayment;
}

function normalizeMerchant(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}
