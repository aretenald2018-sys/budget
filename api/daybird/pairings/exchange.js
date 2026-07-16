import { exchangePairing, parseJsonBody } from '../../_lib/daybird.js';
import { allowMethods, errorStatus, handleOptions, setCors } from '../../_lib/http.js';

export default async function handler(req, res) {
  setCors(res, ['POST', 'OPTIONS']);
  if (handleOptions(req, res) || !allowMethods(req, res, ['POST'])) return;
  try {
    const result = await exchangePairing(parseJsonBody(req));
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('[daybird:pairings:exchange]', error);
    return res.status(errorStatus(error)).json({ ok: false, error: error.message });
  }
}
