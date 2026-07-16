import { handleOptions, setCors } from './_lib/http.js';
import { visualSearchAdapter } from './_adapters/visual-search.js';
import { createVisualSearchService } from './_services/visual-search.js';

const visualSearchService = createVisualSearchService({ searchAdapter: visualSearchAdapter });

export default async function handler(req, res) {
  setCors(res, ['GET']);
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'GET only' });

  const result = await visualSearchService.search(req.query?.q, req.query?.limit);
  const { status, ...body } = result;
  return res.status(status).json(body);
}
