// ================================================================
// scripts/wine-audit.mjs — 와인 컬렉션 진단·복구
//
// 브라우저 앱의 목록 쿼리는 orderBy 필드(createdAt/tastedAt)가 없는 문서를
// 통째로 건너뛴다. 이 스크립트는 admin SDK 로 두 컬렉션의 전체 문서를 읽어
//   1) 앱 목록 쿼리에 보이지 않는 문서(누락 필드)를 찾아내고
//   2) --fix 를 주면 누락된 필드만 백필해서 다시 보이게 만든다.
//
// 실행: node scripts/wine-audit.mjs [--fix] [--days=3]
//   FIREBASE_SERVICE_ACCOUNT / USER_UID env 필요 (.env.local 로컬 지원)
// ================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdminDb, userScope, Timestamp } from '../api/_lib/firebase-admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(__dirname, '..', '.env.local'));

const FIX = process.argv.includes('--fix');
const daysArg = process.argv.find(arg => arg.startsWith('--days='));
const RECENT_DAYS = Number(daysArg?.split('=')[1]) || 3;

const db = getAdminDb();
const userRef = db.collection('users').doc(userScope());

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function stamp(value) {
  const ms = toMillis(value);
  return ms ? new Date(ms).toISOString() : '(없음)';
}

function isRecent(ms) {
  return ms && ms >= Date.now() - RECENT_DAYS * 86400000;
}

async function auditBottles() {
  const snapshot = await userRef.collection('wine_bottles').get();
  const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`\n== wine_bottles: 총 ${rows.length}건 ==`);
  const hidden = rows.filter(row => !toMillis(row.createdAt));
  for (const row of rows) {
    const created = toMillis(row.createdAt);
    const flag = created ? ' ' : '⚠ 앱 목록에서 안 보임(createdAt 없음)';
    const recent = isRecent(created) || isRecent(toMillis(row.updatedAt)) ? ' [최근]' : '';
    console.log(`- ${row.id} · ${row.name || '(이름 없음)'} · createdAt=${stamp(row.createdAt)} · updatedAt=${stamp(row.updatedAt)}${recent} ${flag}`);
  }
  return { rows, hidden };
}

async function auditTastings(bottleIds) {
  const snapshot = await userRef.collection('wine_tastings').get();
  const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`\n== wine_tastings: 총 ${rows.length}건 ==`);
  const hidden = rows.filter(row => !toMillis(row.tastedAt));
  for (const row of rows) {
    const orphan = row.bottleId && !bottleIds.has(row.bottleId) ? ' ⚠ 연결된 와인 없음(고아)' : '';
    const flag = toMillis(row.tastedAt) ? '' : ' ⚠ 앱 목록에서 안 보임(tastedAt 없음)';
    const recent = isRecent(toMillis(row.createdAt)) || isRecent(toMillis(row.updatedAt)) ? ' [최근]' : '';
    console.log(`- ${row.id} · bottleId=${row.bottleId || '(없음)'} · tastedAt=${stamp(row.tastedAt)} · createdAt=${stamp(row.createdAt)}${recent}${flag}${orphan}`);
  }
  return { rows, hidden };
}

// 누락 필드 백필: 문서에 이미 있는 다른 시각 필드에서 가장 그럴듯한 값을 고른다.
async function fixHidden(bottles, tastings) {
  let fixed = 0;
  for (const row of bottles.hidden) {
    const fallback = toMillis(row.updatedAt) || toMillis(row.purchasedAt) || Date.now();
    await userRef.collection('wine_bottles').doc(row.id)
      .set({ createdAt: Timestamp.fromMillis(fallback) }, { merge: true });
    console.log(`✔ wine_bottles/${row.id} createdAt 백필 → ${new Date(fallback).toISOString()}`);
    fixed += 1;
  }
  for (const row of tastings.hidden) {
    const fallback = toMillis(row.createdAt) || toMillis(row.updatedAt) || Date.now();
    await userRef.collection('wine_tastings').doc(row.id)
      .set({ tastedAt: Timestamp.fromMillis(fallback) }, { merge: true });
    console.log(`✔ wine_tastings/${row.id} tastedAt 백필 → ${new Date(fallback).toISOString()}`);
    fixed += 1;
  }
  return fixed;
}

const bottles = await auditBottles();
const tastings = await auditTastings(new Set(bottles.rows.map(row => row.id)));

console.log(`\n== 요약 ==`);
console.log(`와인 ${bottles.rows.length}건 중 목록에 안 보이는 문서 ${bottles.hidden.length}건`);
console.log(`테이스팅 ${tastings.rows.length}건 중 목록에 안 보이는 문서 ${tastings.hidden.length}건`);
console.log(`최근 ${RECENT_DAYS}일 내 생성/수정: 위 목록의 [최근] 표시 참고`);

if (FIX) {
  const fixed = await fixHidden(bottles, tastings);
  console.log(fixed ? `\n총 ${fixed}건 백필 완료 — 앱 목록에 다시 나타납니다.` : '\n백필할 문서가 없습니다.');
} else if (bottles.hidden.length || tastings.hidden.length) {
  console.log('\n--fix 를 주면 누락 필드를 백필해 앱에서 다시 보이게 합니다.');
}

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
