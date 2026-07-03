import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
loadEnv(path.join(root, '.env.local'));

const APPLY = process.argv.includes('--apply');
const uid = process.env.USER_UID;
const serviceAccount = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
if (!uid || !serviceAccount.project_id) {
  throw new Error('USER_UID 또는 FIREBASE_SERVICE_ACCOUNT가 없습니다.');
}

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const userRef = db.collection('users').doc(uid);
const txRef = userRef.collection('transactions');

const start = new Date('2026-06-30T15:00:00.000Z');
const end = new Date('2026-07-03T14:59:59.999Z');
const expectedDaily = {
  '2026-07-01': 321890,
  '2026-07-02': 2800,
  '2026-07-03': 16090,
};
const expectedMonth = 340780;

const missingTargets = [
  {
    date: '2026-07-02',
    occurredAt: new Date('2026-07-02T05:21:00.000Z'),
    type: 'card_payment',
    amount: 2800,
    merchant: 'CU 문정엠스테이트점',
    category: '생활비용',
    subcategory: '간식',
    memo: '토스 캡처 기준 수동 보정: 2026-07-02 14:21 하나Pay 2,800원',
  },
  {
    date: '2026-07-03',
    occurredAt: new Date('2026-07-03T03:00:00.000Z'),
    type: 'card_payment',
    amount: 13890,
    merchant: '송파농협 하나로마트',
    category: '생활비용',
    subcategory: '식재료비',
    memo: '토스 캡처 기준 수동 보정: 2026-07-03 송파농협 하나로마트 13,890원',
  },
];

const txs = await loadTransactions();
const duplicateCandidates = findDuplicateCandidates(txs);
const missingCreates = missingTargets.filter(target => !hasVisibleSameDayAmount(txs, target));

printDryRun(txs, duplicateCandidates, missingCreates);

if (APPLY) {
  await applyChanges(duplicateCandidates, missingCreates);
  const after = await loadTransactions();
  printSummary('after', after);
} else {
  console.log('\nDRY_RUN_ONLY: apply하려면 node scripts/reconcile-toss-july-records.mjs --apply');
}

async function loadTransactions() {
  const snap = await txRef
    .where('occurredAt', '>=', Timestamp.fromDate(start))
    .where('occurredAt', '<=', Timestamp.fromDate(end))
    .orderBy('occurredAt', 'desc')
    .get();
  return snap.docs.map(doc => {
    const data = doc.data();
    const occurredAt = toDate(data.occurredAt);
    return {
      id: doc.id,
      ref: doc.ref,
      ...data,
      occurredAt,
      date: kstDate(occurredAt),
      time: kstTime(occurredAt),
      party: data.merchant || data.counterparty || '',
    };
  });
}

function findDuplicateCandidates(rows) {
  const visible = rows.filter(isVisibleExpense);
  return [
    ...dupesByRule(visible, {
      amount: 120000,
      include: ['마인드풀'],
      exclude: row => !normalize(row.party).includes('연구소'),
      keep: row => normalize(row.party).includes('연구소'),
      reason: 'duplicate_mindful_short_name',
    }),
    ...dupesByRule(visible, {
      amount: 1440,
      include: ['워커스하이'],
      reason: 'duplicate_workershigh_kiosk_1440',
    }),
    ...dupesByRule(visible, {
      amount: 1280,
      include: ['워커스하이'],
      reason: 'duplicate_workershigh_kiosk_1280',
    }),
    ...dupesByRule(visible, {
      amount: 1120,
      include: ['워커스하이'],
      reason: 'duplicate_workershigh_kiosk_1120',
    }),
    ...dupesByRule(visible, {
      amount: 19050,
      include: ['쿠팡(쿠페이)'],
      reason: 'duplicate_coupang_parenthesized',
    }),
    ...duplicateTmoney(visible),
  ];
}

function dupesByRule(rows, rule) {
  return rows
    .filter(row => row.date === '2026-07-01')
    .filter(row => Number(row.amount) === rule.amount)
    .filter(row => rule.include.some(token => normalize(row.party).includes(normalize(token))))
    .filter(row => rule.exclude ? rule.exclude(row) : true)
    .map(row => ({ row, reason: rule.reason }));
}

function duplicateTmoney(rows) {
  const matches = rows
    .filter(row => row.date === '2026-07-01')
    .filter(row => Number(row.amount) === 55000)
    .filter(row => normalize(row.party).includes('티머니'))
    .sort((a, b) => duplicateRank(b) - duplicateRank(a));
  if (matches.length <= 1) return [];
  return matches.slice(0, matches.length - 1).map(row => ({
    row,
    reason: 'duplicate_tmoney_transfer',
  }));
}

function duplicateRank(row) {
  let score = 0;
  const source = normalize(row.source);
  const memo = normalize(row.memo);
  if (source.includes('android') || memo.includes('android')) score += 3;
  if (row.androidCaptureId) score += 3;
  if (row.rawNotification) score += 2;
  if (row.createdAt) score += 1;
  return score;
}

function hasVisibleSameDayAmount(rows, target) {
  return rows
    .filter(isVisibleExpense)
    .some(row => row.date === target.date && Number(row.amount) === target.amount);
}

async function applyChanges(duplicates, creates) {
  const batch = db.batch();
  for (const { row, reason } of duplicates) {
    batch.update(row.ref, {
      hidden: true,
      excludedFromBudget: true,
      excludeFromBudget: true,
      excludeReason: 'duplicate_toss_july_reconciliation',
      duplicateReason: reason,
      reconciledAgainst: 'toss_2026_07_screenshot',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  for (const target of creates) {
    const ref = txRef.doc();
    batch.set(ref, {
      type: target.type,
      amount: target.amount,
      occurredAt: Timestamp.fromDate(target.occurredAt),
      merchant: target.merchant,
      counterparty: null,
      category: target.category,
      subcategory: target.subcategory,
      needsReview: false,
      source: 'manual_toss_reconciliation',
      memo: target.memo,
      reconciledAgainst: 'toss_2026_07_screenshot',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  if (duplicates.length || creates.length) await batch.commit();
  console.log(JSON.stringify({
    applied: APPLY,
    excludedDuplicates: duplicates.map(item => ({ id: item.row.id, amount: item.row.amount, party: item.row.party, reason: item.reason })),
    createdMissing: creates.map(item => ({ amount: item.amount, merchant: item.merchant, occurredAt: item.occurredAt.toISOString() })),
  }, null, 2));
}

function printDryRun(rows, duplicates, creates) {
  console.log('CURRENT_ROWS');
  for (const row of rows) {
    console.log(JSON.stringify({
      id: row.id,
      date: row.date,
      time: row.time,
      amount: row.amount,
      type: row.type,
      party: row.party,
      category: row.category || null,
      subcategory: row.subcategory || null,
      hidden: !!row.hidden,
      excluded: isBudgetExcluded(row),
      source: row.source || null,
      androidCaptureId: row.androidCaptureId || null,
      memo: row.memo || null,
    }));
  }
  printSummary('before', rows);
  console.log('DUPLICATE_CANDIDATES');
  console.log(JSON.stringify(duplicates.map(item => ({
    id: item.row.id,
    date: item.row.date,
    time: item.row.time,
    amount: item.row.amount,
    party: item.row.party,
    source: item.row.source || null,
    reason: item.reason,
  })), null, 2));
  console.log('MISSING_CREATES');
  console.log(JSON.stringify(creates.map(item => ({
    date: item.date,
    amount: item.amount,
    merchant: item.merchant,
    occurredAt: item.occurredAt.toISOString(),
  })), null, 2));
}

function printSummary(label, rows) {
  const daily = Object.fromEntries(Object.keys(expectedDaily).map(date => [date, 0]));
  for (const row of rows.filter(isVisibleExpense)) {
    if (daily[row.date] == null) continue;
    daily[row.date] += Number(row.amount) || 0;
  }
  const month = Object.values(daily).reduce((sum, amount) => sum + amount, 0);
  console.log(JSON.stringify({
    label,
    daily,
    month,
    expectedDaily,
    expectedMonth,
    dailyMatches: Object.fromEntries(Object.entries(expectedDaily).map(([date, amount]) => [date, daily[date] === amount])),
    monthMatches: month === expectedMonth,
  }, null, 2));
}

function isVisibleExpense(row) {
  return ['card_payment', 'transfer_out'].includes(row.type)
    && !row.hidden
    && !isBudgetExcluded(row);
}

function isBudgetExcluded(row) {
  return !!(
    row.excludedFromBudget ||
    row.excludeFromBudget ||
    row.reimbursementExpected ||
    row.excludeReason === 'reimbursement_expected'
  );
}

function toDate(value) {
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function kstDate(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function kstTime(date) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase();
}

function parseServiceAccount(value = '') {
  const parsed = JSON.parse(String(value || '{}'));
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
