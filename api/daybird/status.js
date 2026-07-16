import { getDashboardStatus, verifyDashboardRequest } from '../_lib/daybird.js';
import { allowMethods, errorStatus, handleOptions, setCors } from '../_lib/http.js';

export default async function handler(req, res) {
  setCors(res, ['GET', 'OPTIONS']);
  if (handleOptions(req, res) || !allowMethods(req, res, ['GET'])) return;
  try {
    const auth = await verifyDashboardRequest(req, { ownerOnly: true });
    const status = await getDashboardStatus(auth.ownerUid);
    return res.status(200).json({ ok: true, ...status });
  } catch (error) {
    console.error('[daybird:status]', error);
    return res.status(errorStatus(error)).json({ ok: false, error: error.message });
  }
}
