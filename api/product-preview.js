import { handleOptions, setCors } from './_lib/http.js';
import { productPreviewAdapter } from './_adapters/product-preview.js';
import { createProductPreviewService } from './_services/product-preview.js';

const productPreviewService = createProductPreviewService({ previewAdapter: productPreviewAdapter });

export function createProductPreviewHandler({ service = productPreviewService } = {}) {
  return async function handler(req, res) {
    setCors(res, ['GET']);
    if (handleOptions(req, res)) return;
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

    try {
      return res.status(200).json(await service.preview(req.query?.url));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  };
}

export default createProductPreviewHandler();
