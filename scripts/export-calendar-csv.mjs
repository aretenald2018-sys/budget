import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  displayCategoryName,
  isBudgetExcluded,
} from '../domain/transactions/budget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
loadLocalEnv(path.join(root, '.env.local'));

const uid = process.env.USER_UID;
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!uid || !serviceAccount.project_id) {
  throw new Error('USER_UID 또는 FIREBASE_SERVICE_ACCOUNT가 없습니다.');
}

if (!getApps().length) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const monthKey = process.argv[2] || formatMonthKey(new Date());
const { start, end } = monthRange(monthKey);
const userRef = db.collection('users').doc(uid);

const [txSnap, categorySnap] = await Promise.all([
  userRef.collection('transactions')
    .where('occurredAt', '>=', start)
    .where('occurredAt', '<=', end)
    .orderBy('occurredAt', 'desc')
    .limit(2000)
    .get(),
  userRef.collection('categories').get(),
]);

const txs = txSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
const categories = categorySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
const receiptIds = Array.from(new Set(txs.flatMap(tx => Array.isArray(tx.receiptIds) ? tx.receiptIds : []).filter(Boolean)));
const receiptEntries = await Promise.all(receiptIds.map(async id => {
  const snap = await userRef.collection('receipts').doc(id).get();
  return snap.exists ? [id, { id, ...snap.data() }] : null;
}));
const receiptsById = new Map(receiptEntries.filter(Boolean));

const csv = buildCalendarCsv(txs, categories, receiptsById, monthKey);
const outputPath = path.join(root, `budget-calendar-${monthKey}.csv`);
fs.writeFileSync(outputPath, `\uFEFF${csv}`, 'utf8');
console.log(JSON.stringify({
  outputPath,
  monthKey,
  transactions: txs.length,
  receipts: receiptsById.size,
  rows: csv.split('\r\n').length - 1,
}));

function buildCalendarCsv(txs, categories, receiptsById, monthKey) {
  const expenseCategories = categories
    .filter(cat => cat.kind === 'expense')
    .sort((a, b) => (a.parentOrder || 99) - (b.parentOrder || 99) || (a.order || 99) - (b.order || 99));
  const categoryMap = new Map(expenseCategories.map(cat => [cat.name, cat]));
  const rows = [
    ...dailySpendRows(txs, categoryMap, monthKey),
    ...receiptItemRows(txs, categoryMap, receiptsById, monthKey),
    ...expenseCategories.map(cat => ({
      rowType: 'category_limit',
      month: monthKey,
      date: '',
      parentCategory: cat.parent || '',
      category: cat.name || '',
      subcategory: '',
      spentAmount: '',
      transactionCount: '',
      twoWeekAllowance: twoWeekAllowance(cat, monthKey),
      monthlyAllowance: monthlyAllowance(cat, monthKey),
      budgetRhythm: budgetRhythm(cat),
      merchant: '',
      transactionId: '',
      receiptId: '',
      receiptSource: '',
      receiptItemName: '',
      receiptItemQty: '',
      receiptItemUnitPrice: '',
      receiptItemAmount: '',
    })),
  ];
  const headers = [
    'row_type',
    'month',
    'date',
    'parent_category',
    'category',
    'subcategory',
    'spent_amount',
    'transaction_count',
    'two_week_allowance',
    'monthly_allowance',
    'budget_rhythm',
    'merchant',
    'transaction_id',
    'receipt_id',
    'receipt_source',
    'receipt_item_name',
    'receipt_item_qty',
    'receipt_item_unit_price',
    'receipt_item_amount',
  ];
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvCell(row[camelKey(header)])).join(',')),
  ].join('\r\n');
}

function dailySpendRows(txs, categoryMap, monthKey) {
  const groups = new Map();
  const expenses = txs.filter(tx => isExpense(tx) && !isBudgetExcluded(tx));
  for (const tx of expenses) {
    const date = isoDate(tx.occurredAt);
    const category = displayCategoryName(tx);
    const subcategory = tx.subcategory || '상세분류 미지정';
    const cat = categoryMap.get(category);
    const key = [date, category, subcategory].join('\t');
    const row = groups.get(key) || {
      rowType: 'daily_spend',
      month: monthKey,
      date,
      parentCategory: cat?.parent || '',
      category,
      subcategory,
      spentAmount: 0,
      transactionCount: 0,
      twoWeekAllowance: twoWeekAllowance(cat, monthKey),
      monthlyAllowance: monthlyAllowance(cat, monthKey),
      budgetRhythm: budgetRhythm(cat),
      merchant: new Set(),
      transactionId: [],
      receiptId: '',
      receiptSource: '',
      receiptItemName: '',
      receiptItemQty: '',
      receiptItemUnitPrice: '',
      receiptItemAmount: '',
    };
    row.spentAmount += Number(tx.amount) || 0;
    row.transactionCount += 1;
    row.merchant.add(tx.merchant || tx.counterparty || '');
    row.transactionId.push(tx.id || '');
    groups.set(key, row);
  }
  return Array.from(groups.values())
    .sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category, 'ko') || a.subcategory.localeCompare(b.subcategory, 'ko'))
    .map(row => ({
      ...row,
      merchant: Array.from(row.merchant).filter(Boolean).join(' | '),
      transactionId: row.transactionId.filter(Boolean).join(' | '),
    }));
}

function receiptItemRows(txs, categoryMap, receiptsById, monthKey) {
  const rows = [];
  for (const tx of txs.filter(tx => isExpense(tx) && !isBudgetExcluded(tx))) {
    for (const receiptId of Array.isArray(tx.receiptIds) ? tx.receiptIds.filter(Boolean) : []) {
      const receipt = receiptsById.get(receiptId);
      for (const item of Array.isArray(receipt?.items) ? receipt.items : []) {
        const category = displayCategoryName(tx);
        const cat = categoryMap.get(category);
        const qty = Math.max(1, Number(item?.qty) || 1);
        const unitPrice = Math.max(0, Number(item?.price) || 0);
        rows.push({
          rowType: 'receipt_item',
          month: monthKey,
          date: isoDate(tx.occurredAt),
          parentCategory: cat?.parent || '',
          category,
          subcategory: tx.subcategory || '상세분류 미지정',
          spentAmount: '',
          transactionCount: '',
          twoWeekAllowance: twoWeekAllowance(cat, monthKey),
          monthlyAllowance: monthlyAllowance(cat, monthKey),
          budgetRhythm: budgetRhythm(cat),
          merchant: receipt?.merchant || tx.merchant || tx.counterparty || '',
          transactionId: tx.id || '',
          receiptId,
          receiptSource: receipt?.source || '',
          receiptItemName: item?.name || '',
          receiptItemQty: qty,
          receiptItemUnitPrice: unitPrice,
          receiptItemAmount: Math.round(unitPrice * qty),
        });
      }
    }
  }
  return rows;
}

function isExpense(tx) {
  return tx.type === 'card_payment' || tx.type === 'transfer_out';
}

function monthlyAllowance(cat, monthKey) {
  if (!cat) return '';
  return Number(cat.monthlyTargets?.[monthKey] ?? cat.target ?? 0) || 0;
}

function twoWeekAllowance(cat, monthKey) {
  if (!cat) return '';
  const monthly = monthlyAllowance(cat, monthKey);
  return budgetRhythm(cat) === 'front_loaded' ? monthly : Math.round(monthly / 2);
}

function budgetRhythm(cat) {
  return cat?.budgetRhythm || 'spread';
}

function monthRange(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return {
    start: new Date(year, month - 1, 1, 0, 0, 0, 0),
    end: new Date(year, month, 0, 23, 59, 59, 999),
  };
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isoDate(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function camelKey(header) {
  return header.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function loadLocalEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
