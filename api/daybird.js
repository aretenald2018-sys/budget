import {
  createPairing,
  disconnectDevice,
  exchangePairing,
  getDashboardStatus,
  listDevices,
  parseJsonBody,
  registerDeviceToken,
  requestDashboardRefresh,
  saveDashboardSettings,
  verifyDashboardRequest,
} from './_lib/daybird.js';
import { allowMethods, errorStatus, handleOptions, setCors } from './_lib/http.js';

export default async function handler(req, res) {
  setCors(res, ['GET', 'POST', 'OPTIONS']);
  if (handleOptions(req, res)) return;
  const action = String(req.query?.action || '').trim();
  const allowed = action === 'status' ? ['GET'] : ['POST'];
  if (!allowMethods(req, res, allowed)) return;

  try {
    if (action === 'pairings/exchange') {
      return res.status(200).json({ ok: true, ...await exchangePairing(parseJsonBody(req)) });
    }

    if (action === 'status') {
      const auth = await verifyDashboardRequest(req, { ownerOnly: true });
      return res.status(200).json({ ok: true, ...await getDashboardStatus(auth.ownerUid) });
    }

    if (action === 'pairings') {
      const auth = await verifyDashboardRequest(req, { ownerOnly: true });
      const [pairing, devices] = await Promise.all([createPairing(auth.ownerUid), listDevices(auth.ownerUid)]);
      return res.status(201).json({ ok: true, pairing, devices });
    }

    const auth = await verifyDashboardRequest(req);
    if (action === 'refresh') {
      const refresh = await requestDashboardRefresh(auth.ownerUid, auth.isDevice ? 'daybird-manual' : 'budget-change');
      return res.status(202).json({ ok: true, refresh });
    }
    if (action === 'settings') {
      return res.status(200).json({ ok: true, ...await saveDashboardSettings(auth.ownerUid, parseJsonBody(req).weights) });
    }
    if (action === 'devices') {
      return res.status(200).json({ ok: true, ...await registerDeviceToken(auth, parseJsonBody(req)) });
    }
    if (action === 'disconnect') {
      return res.status(200).json({ ok: true, ...await disconnectDevice(auth, parseJsonBody(req)) });
    }
    return res.status(404).json({ ok: false, error: 'unknown DayBird action' });
  } catch (error) {
    console.error(`[daybird:${action || 'unknown'}]`, error);
    return res.status(errorStatus(error)).json({ ok: false, error: error.message });
  }
}
