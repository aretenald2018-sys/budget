import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb, userScope } from './firebase-admin.js';

export const DAYBIRD_DEFAULT_WEIGHTS = Object.freeze({
  food: 25,
  health: 25,
  running: 20,
  spending: 20,
  wine: 10,
});

const DOMAINS = Object.freeze(Object.keys(DAYBIRD_DEFAULT_WEIGHTS));
const PAIRING_TTL_MS = 10 * 60 * 1000;

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function parseJsonBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    throw httpError('invalid JSON body', 400);
  }
}

function bearerToken(req) {
  const authorization = String(req?.headers?.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

export async function verifyDashboardRequest(req, { ownerOnly = false } = {}) {
  const token = bearerToken(req);
  if (!token) throw httpError('unauthorized', 401);
  const decoded = await getAdminAuth().verifyIdToken(token, true);
  const ownerUid = decoded.dashboardOwnerUid || decoded.uid;
  const isOwner = decoded.uid === ownerUid && decoded.uid === userScope();
  const isDevice = decoded.daybirdDevice === true && decoded.dashboardOwnerUid === ownerUid;
  if (!isOwner && (!isDevice || ownerOnly)) throw httpError('forbidden', 403);
  return { decoded, ownerUid, authUid: decoded.uid, isOwner, isDevice };
}

export function normalizeDaybirdWeights(value = {}) {
  const normalized = {};
  for (const domain of DOMAINS) {
    const weight = Number(value?.[domain]);
    if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
      throw httpError(`invalid weight: ${domain}`, 400);
    }
    normalized[domain] = weight;
  }
  if (Object.values(normalized).reduce((sum, weight) => sum + weight, 0) !== 100) {
    throw httpError('weights must total 100', 400);
  }
  return normalized;
}

export function pairingHash(code) {
  return crypto.createHash('sha256').update(String(code || '')).digest('hex');
}

function encodeUid(uid) {
  return Buffer.from(String(uid || ''), 'utf8').toString('base64url');
}

function decodeUid(encoded) {
  try {
    return Buffer.from(String(encoded || ''), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

export function createPairingCode(ownerUid) {
  if (!ownerUid) throw httpError('ownerUid is required', 400);
  return `${encodeUid(ownerUid)}.${crypto.randomBytes(32).toString('base64url')}`;
}

export function ownerUidFromPairingCode(code) {
  const [encodedUid, secret, extra] = String(code || '').split('.');
  if (!encodedUid || !secret || extra) return '';
  return decodeUid(encodedUid);
}

function safeDeviceId(value) {
  const deviceId = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(deviceId)) throw httpError('invalid deviceId', 400);
  return deviceId;
}

export function deviceAuthUid(deviceId, ownerUid = '') {
  return `daybird_${crypto.createHash('sha256').update(`${String(ownerUid)}\0${safeDeviceId(deviceId)}`).digest('hex').slice(0, 40)}`;
}

export async function createPairing(ownerUid, options = {}) {
  if (ownerUid !== userScope()) throw httpError('forbidden', 403);
  const nowEpochMs = Number(options.nowEpochMs) || Date.now();
  const code = createPairingCode(ownerUid);
  const hash = pairingHash(code);
  const db = getAdminDb();
  await db.doc(`users/${ownerUid}/daybird_pairings/${hash}`).set({
    tokenHash: hash,
    ownerUid,
    createdAtEpochMs: nowEpochMs,
    expiresAtEpochMs: nowEpochMs + PAIRING_TTL_MS,
    usedAtEpochMs: null,
    createdByAuthUid: ownerUid,
  });
  return {
    code,
    expiresAtEpochMs: nowEpochMs + PAIRING_TTL_MS,
    deepLink: `daybird://pair?code=${encodeURIComponent(code)}`,
  };
}

async function ensureDeviceUser(auth, authUid) {
  try {
    return await auth.getUser(authUid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    return auth.createUser({ uid: authUid, disabled: false });
  }
}

export async function exchangePairing(body = {}, options = {}) {
  const code = String(body.code || '').trim();
  const ownerUid = ownerUidFromPairingCode(code);
  if (!ownerUid || ownerUid !== userScope()) throw httpError('invalid pairing code', 400);
  const deviceId = safeDeviceId(body.deviceId);
  const authUid = deviceAuthUid(deviceId, ownerUid);
  const nowEpochMs = Number(options.nowEpochMs) || Date.now();
  const hash = pairingHash(code);
  const db = getAdminDb();
  const pairingRef = db.doc(`users/${ownerUid}/daybird_pairings/${hash}`);
  const assertPairingUsable = pairing => {
    if (pairing.usedAtEpochMs) {
      const sameDevice = pairing.usedByAuthUid === authUid;
      const retryOpen = nowEpochMs - Number(pairing.usedAtEpochMs) <= PAIRING_TTL_MS;
      if (!sameDevice || !retryOpen) throw httpError('pairing code already used', 409);
    } else if (Number(pairing.expiresAtEpochMs) < nowEpochMs) {
      throw httpError('pairing code expired', 410);
    }
  };
  const preliminary = await pairingRef.get();
  if (!preliminary.exists) throw httpError('pairing code not found', 404);
  assertPairingUsable(preliminary.data());

  const auth = getAdminAuth();
  await ensureDeviceUser(auth, authUid);
  await auth.setCustomUserClaims(authUid, { daybirdDevice: true, dashboardOwnerUid: ownerUid });
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(pairingRef);
    if (!snapshot.exists) throw httpError('pairing code not found', 404);
    const pairing = snapshot.data();
    assertPairingUsable(pairing);
    transaction.set(pairingRef, { usedAtEpochMs: nowEpochMs, usedByAuthUid: authUid }, { merge: true });
  });

  const customToken = await auth.createCustomToken(authUid, { daybirdDevice: true, dashboardOwnerUid: ownerUid });
  const deviceRef = db.doc(`users/${ownerUid}/daybird_devices/${authUid}`);
  await deviceRef.set({
    authUid,
    ownerUid,
    deviceIdHash: crypto.createHash('sha256').update(deviceId).digest('hex'),
    deviceName: String(body.deviceName || 'DayBird Android').trim().slice(0, 80),
    platform: 'android',
    fcmToken: String(body.fcmToken || '').trim() || null,
    active: true,
    pairedAtEpochMs: nowEpochMs,
    updatedAtEpochMs: nowEpochMs,
  }, { merge: true });
  await Promise.all([
    db.doc(`dashboardLinks/${process.env.TOMATO_OWNER_ID || '김_태우'}`).set({
      ownerId: process.env.TOMATO_OWNER_ID || '김_태우',
      budgetUid: ownerUid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    db.doc(`dashboardBudgetLinks/${ownerUid}`).set({
      ownerId: process.env.TOMATO_OWNER_ID || '김_태우',
      budgetUid: ownerUid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
  ]);
  const refresh = await requestDashboardRefresh(ownerUid, 'pairing-exchange').catch(error => ({
    queued: false,
    error: error.message,
  }));
  return { customToken, authUid, ownerUid, refresh };
}

export function signDashboardRequest(bodyText, timestamp, secret = process.env.DASHBOARD_INTERNAL_HMAC) {
  if (!secret) throw httpError('DASHBOARD_INTERNAL_HMAC env missing', 500);
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${bodyText}`).digest('hex');
}

export async function requestDashboardRefresh(ownerUid, reason = 'budget-change') {
  const endpoint = String(process.env.TOMATO_DASHBOARD_REFRESH_URL || '').trim();
  if (!endpoint) throw httpError('TOMATO_DASHBOARD_REFRESH_URL env missing', 503);
  const bodyText = JSON.stringify({
    ownerId: process.env.TOMATO_OWNER_ID || '김_태우',
    budgetUid: ownerUid,
    reason: String(reason || 'budget-change').slice(0, 80),
  });
  const timestamp = String(Date.now());
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dashboard-timestamp': timestamp,
      'x-dashboard-signature': signDashboardRequest(bodyText, timestamp),
    },
    body: bodyText,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw httpError('dashboard refresh rejected', 502);
  return { queued: true, result: payload.result || null };
}

export async function saveDashboardSettings(ownerUid, weights) {
  const normalized = normalizeDaybirdWeights(weights);
  await getAdminDb().doc(`users/${ownerUid}/dashboard_settings/config`).set({
    schemaVersion: 1,
    weights: normalized,
    updatedAtEpochMs: Date.now(),
  }, { merge: true });
  const refresh = await requestDashboardRefresh(ownerUid, 'weights-change');
  return { weights: normalized, refresh };
}

export async function registerDeviceToken(authContext, body = {}) {
  if (!authContext.isDevice) throw httpError('DayBird device token required', 403);
  const fcmToken = String(body.fcmToken || '').trim();
  if (!fcmToken || fcmToken.length > 4096) throw httpError('invalid fcmToken', 400);
  await getAdminDb().doc(`users/${authContext.ownerUid}/daybird_devices/${authContext.authUid}`).set({
    fcmToken,
    active: true,
    deviceName: String(body.deviceName || 'DayBird Android').trim().slice(0, 80),
    platform: 'android',
    updatedAtEpochMs: Date.now(),
  }, { merge: true });
  return { registered: true };
}

export async function disconnectDevice(authContext, body = {}) {
  const targetAuthUid = authContext.isDevice
    ? authContext.authUid
    : String(body.authUid || '').trim();
  if (!targetAuthUid) throw httpError('authUid is required', 400);
  const ref = getAdminDb().doc(`users/${authContext.ownerUid}/daybird_devices/${targetAuthUid}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { disconnected: false, authUid: targetAuthUid };
  if (snapshot.data()?.ownerUid !== authContext.ownerUid) throw httpError('forbidden', 403);
  await ref.set({ active: false, fcmToken: FieldValue.delete(), disconnectedAtEpochMs: Date.now() }, { merge: true });
  await getAdminAuth().revokeRefreshTokens(targetAuthUid).catch(error => {
    if (error?.code !== 'auth/user-not-found') throw error;
  });
  return { disconnected: true, authUid: targetAuthUid };
}

export async function listDevices(ownerUid) {
  const snapshot = await getAdminDb().collection(`users/${ownerUid}/daybird_devices`).orderBy('pairedAtEpochMs', 'desc').get();
  return snapshot.docs.map(document => {
    const data = document.data();
    return {
      authUid: document.id,
      deviceName: data.deviceName || 'DayBird Android',
      active: data.active !== false,
      pairedAtEpochMs: data.pairedAtEpochMs || null,
      updatedAtEpochMs: data.updatedAtEpochMs || null,
    };
  });
}

export async function getDashboardStatus(ownerUid) {
  const db = getAdminDb();
  const [dashboard, settings, devices] = await Promise.all([
    db.doc(`users/${ownerUid}/dashboard/latest`).get(),
    db.doc(`users/${ownerUid}/dashboard_settings/config`).get(),
    listDevices(ownerUid),
  ]);
  const latest = dashboard.exists ? dashboard.data() : null;
  return {
    connected: devices.some(device => device.active),
    devices,
    weights: settings.exists ? settings.data()?.weights || DAYBIRD_DEFAULT_WEIGHTS : DAYBIRD_DEFAULT_WEIGHTS,
    dashboard: latest ? {
      revision: latest.revision || null,
      score: latest.score ?? null,
      generatedAtEpochMs: latest.generatedAtEpochMs || null,
      coverage: latest.coverage || null,
    } : null,
  };
}
