import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdminDb, userScope, FieldValue } from '../api/_lib/firebase-admin.js';
import { mailboxIdFromIngestToken } from '../api/_lib/firestore-rest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, '..', '.env.local'));

const [, , rawId, txId] = process.argv;
if (!rawId || !txId) {
  console.error('usage: node scripts/link-duplicate-raw.mjs <rawId> <txId>');
  process.exit(1);
}

const db = getAdminDb();
const uid = userScope();
const mailboxId = mailboxIdFromIngestToken();
const batch = db.batch();
batch.update(db.collection('users').doc(uid).collection('transactions').doc(txId), {
  rawMessageIds: FieldValue.arrayUnion(rawId),
  updatedAt: FieldValue.serverTimestamp(),
});
batch.update(db.collection('users').doc(uid).collection('raw_messages').doc(rawId), {
  status: 'parsed',
  txId,
  duplicateTx: true,
  parsedAt: FieldValue.serverTimestamp(),
});
batch.update(db.collection('mailboxes').doc(mailboxId).collection('raw_messages').doc(rawId), {
  status: 'parsed',
  txId,
  duplicateTx: true,
  parsedAt: FieldValue.serverTimestamp(),
});
await batch.commit();
console.log(`linked duplicate raw ${rawId} -> ${txId}`);

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
