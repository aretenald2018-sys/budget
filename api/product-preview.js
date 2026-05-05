// ================================================================
// api/product-preview.js — product page metadata preview proxy
// ================================================================

import { buildProductPreview } from './_lib/product-preview.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const preview = await buildProductPreview(req.query?.url);
    return res.status(200).json(preview);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
