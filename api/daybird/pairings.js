import { createPairing, listDevices, verifyDashboardRequest } from '../_lib/daybird.js';
import { allowMethods, errorStatus, handleOptions, setCors } from '../_lib/http.js';

export default async function handler(req, res) {
  setCors(res, ['POST', 'OPTIONS']);
  if (handleOptions(req, res) || !allowMethods(req, res, ['POST'])) return;
  try {
    const auth = await verifyDashboardRequest(req, { ownerOnly: true });
    const [pairing, devices] = await Promise.all([createPairing(auth.ownerUid), listDevices(auth.ownerUid)]);
    return res.status(201).json({ ok: true, pairing, devices });
  } catch (error) {
    console.error('[daybird:pairings]', error);
    return res.status(errorStatus(error)).json({ ok: false, error: error.message });
  }
}
