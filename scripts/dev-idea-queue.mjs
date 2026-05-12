import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdminDb, userScope, FieldValue } from '../api/_lib/firebase-admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
});
const VALID_STATUS = new Set(Object.values(STATUS));
const STATUS_LABELS = {
  pending: '진행전',
  running: '진행중',
  done: '완료',
  failed: '오류',
};
const DEFAULT_LOOKBACK = 100;
const RUNNING_STALE_MS = 3 * 60 * 60 * 1000;

loadEnv(path.join(root, '.env.local'));

async function main() {
  const command = String(process.argv[2] || 'next').trim();
  const db = getAdminDb();
  const uid = userScope();

  if (command === 'next') {
    write(await nextIdea(db, uid));
    return;
  }
  if (command === 'claim-next') {
    write(await claimNextIdea(db, uid));
    return;
  }
  if (command === 'complete') {
    const id = requireArg(3, 'idea id');
    const summary = process.argv.slice(4).join(' ').trim();
    await updateIdea(db, uid, id, {
      status: STATUS.DONE,
      done: true,
      completedAt: FieldValue.serverTimestamp(),
      deployedAt: FieldValue.serverTimestamp(),
      lastAutomationSummary: summary || null,
      lastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    write({ ok: true, id, status: STATUS.DONE, statusLabel: STATUS_LABELS.done });
    return;
  }
  if (command === 'fail') {
    const id = requireArg(3, 'idea id');
    const message = process.argv.slice(4).join(' ').trim() || '자동화 처리 실패';
    await updateIdea(db, uid, id, {
      status: STATUS.FAILED,
      done: false,
      failedAt: FieldValue.serverTimestamp(),
      lastError: message,
      updatedAt: FieldValue.serverTimestamp(),
    });
    write({ ok: true, id, status: STATUS.FAILED, statusLabel: STATUS_LABELS.failed, error: message });
    return;
  }
  if (command === 'reset') {
    const id = requireArg(3, 'idea id');
    await updateIdea(db, uid, id, {
      status: STATUS.PENDING,
      done: false,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      lastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    write({ ok: true, id, status: STATUS.PENDING, statusLabel: STATUS_LABELS.pending });
    return;
  }
  if (command === 'list') {
    const ideas = await loadRecentIdeas(db, uid);
    write({ ok: true, ideas: ideas.map(publicIdea) });
    return;
  }

  throw new Error(`Unknown dev idea queue command: ${command}`);
}

async function nextIdea(db, uid) {
  const ideas = await loadRecentIdeas(db, uid);
  const running = activeRunningIdea(ideas);
  const pending = pendingIdeas(ideas)[0] || null;
  return {
    ok: true,
    hasWork: !!pending,
    blockedByRunning: !!running,
    running: running ? publicIdea(running) : null,
    idea: pending ? publicIdea(pending) : null,
  };
}

async function claimNextIdea(db, uid) {
  const ideas = await loadRecentIdeas(db, uid);
  const running = activeRunningIdea(ideas);
  if (running) {
    return {
      ok: true,
      claimed: false,
      reason: 'running_exists',
      idea: publicIdea(running),
    };
  }

  await markStaleRunningIdeas(ideas);
  const pending = pendingIdeas(ideas)[0] || null;
  if (!pending) {
    return { ok: true, claimed: false, reason: 'no_pending_idea' };
  }

  await pending.ref.update({
    status: STATUS.RUNNING,
    done: false,
    startedAt: FieldValue.serverTimestamp(),
    lastCheckedAt: FieldValue.serverTimestamp(),
    lastAutomationRunAt: FieldValue.serverTimestamp(),
    lastError: null,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    claimed: true,
    idea: publicIdea({ ...pending, status: STATUS.RUNNING, done: false }),
  };
}

async function loadRecentIdeas(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('dev_ideas')
    .orderBy('createdAt', 'desc')
    .limit(DEFAULT_LOOKBACK)
    .get();
  return snap.docs.map(doc => {
    const data = doc.data() || {};
    const status = normalizeStatus(data.status, data.done);
    return {
      id: doc.id,
      ref: doc.ref,
      ...data,
      status,
      done: status === STATUS.DONE,
    };
  });
}

function activeRunningIdea(ideas) {
  return ideas.find(idea => idea.status === STATUS.RUNNING && !isStaleRunning(idea)) || null;
}

async function markStaleRunningIdeas(ideas) {
  const stale = ideas.filter(idea => idea.status === STATUS.RUNNING && isStaleRunning(idea));
  await Promise.all(stale.map(idea => idea.ref.update({
    status: STATUS.FAILED,
    done: false,
    failedAt: FieldValue.serverTimestamp(),
    lastError: '자동화 실행이 3시간 넘게 완료되지 않아 오류로 전환했어요.',
    updatedAt: FieldValue.serverTimestamp(),
  })));
}

function pendingIdeas(ideas) {
  return ideas
    .filter(idea => idea.status === STATUS.PENDING)
    .sort((a, b) => timestampMs(a.createdAt) - timestampMs(b.createdAt));
}

function normalizeStatus(status, done = false) {
  const value = String(status || '').trim();
  if (VALID_STATUS.has(value)) return value;
  return done ? STATUS.DONE : STATUS.PENDING;
}

function isStaleRunning(idea) {
  const started = timestampMs(idea.startedAt) || timestampMs(idea.updatedAt) || timestampMs(idea.createdAt);
  return started > 0 && Date.now() - started > RUNNING_STALE_MS;
}

async function updateIdea(db, uid, id, patch) {
  await db.collection('users').doc(uid).collection('dev_ideas').doc(id).update(patch);
}

function publicIdea(idea) {
  return {
    id: idea.id,
    title: String(idea.title || ''),
    note: String(idea.note || ''),
    status: idea.status,
    statusLabel: STATUS_LABELS[idea.status] || STATUS_LABELS.pending,
    createdAt: timestampIso(idea.createdAt),
    startedAt: timestampIso(idea.startedAt),
    updatedAt: timestampIso(idea.updatedAt),
    lastError: idea.lastError || null,
  };
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function timestampIso(value) {
  const ms = timestampMs(value);
  return ms ? new Date(ms).toISOString() : null;
}

function requireArg(index, label) {
  const value = String(process.argv[index] || '').trim();
  if (!value) throw new Error(`${label} required`);
  return value;
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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

main().catch(err => {
  console.error('[dev-idea-queue]', err);
  process.exit(1);
});
