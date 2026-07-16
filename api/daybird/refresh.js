import { requestDashboardRefresh, verifyDashboardRequest } from '../_lib/daybird.js';
import { allowMethods, errorStatus, handleOptions, setCors } from '../_lib/http.js';

export default async function handler(req, res) {
  setCors(res, ['POST', 'OPTIONS']);
  if (handleOptions(req, res) || !allowMethods(req, res, ['POST'])) return;
  try {
    const auth = await verifyDashboardRequest(req);
    const refresh = await requestDashboardRefresh(auth.ownerUid, auth.isDevice ? 'daybird-manual' : 'budget-change');
    return res.status(202).json({ ok: true, refresh });
  } catch (error) {
    console.error('[daybird:refresh]', error);
    return res.status(errorStatus(error)).json({ ok: false, error: error.message });
  }
}
