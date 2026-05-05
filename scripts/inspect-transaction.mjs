import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdminDb, userScope } from '../api/_lib/firebase-admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, '..', '.env.local'));

const txId = process.argv[2];
if (!txId) {
  console.error('usage: node scripts/inspect-transaction.mjs <txId>');
  process.exit(1);
}

const snap = await getAdminDb().collection('users').doc(userScope()).collection('transactions').doc(txId).get();
const data = snap.data();
console.log(JSON.stringify({
  exists: snap.exists,
  amount: data?.amount,
  merchant: data?.merchant,
  needsSharedReview: data?.needsSharedReview,
  sharedPayment: data?.sharedPayment || null,
  rawCount: data?.rawMessageIds?.length || 0,
}, null, 2));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
