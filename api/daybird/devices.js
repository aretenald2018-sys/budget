import { parseJsonBody, registerDeviceToken, verifyDashboardRequest } from '../_lib/daybird.js';
import { allowMethods, errorStatus, handleOptions, setCors } from '../_lib/http.js';

export default async function handler(req, res) {
  setCors(res, ['POST', 'OPTIONS']);
  if (handleOptions(req, res) || !allowMethods(req, res, ['POST'])) return;
  try {
    const auth = await verifyDashboardRequest(req);
    const result = await registerDeviceToken(auth, parseJsonBody(req));
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[daybird:devices]', error);
    return res.status(errorStatus(error)).json({ ok: false, error: error.message });
  }
}
