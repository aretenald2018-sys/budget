// ================================================================
// api/market-symbol-search.js — Yahoo Finance symbol search proxy
// ================================================================

import { searchLocalMarketSymbols } from '../utils/market-symbol-catalog.js';
import { buildProductPreview } from './_lib/product-preview.js';
import { buildRecipePreview } from './_lib/recipe-preview.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (req.query?.productUrl) {
    try {
      const preview = await buildProductPreview(req.query.productUrl);
      return res.status(200).json(preview);
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }
  if (req.query?.recipeUrl) {
    try {
      const preview = await buildRecipePreview(req.query.recipeUrl, req.query?.text);
      return res.status(200).json(preview);
    } catch (err) {
      return res.status(200).json({ ok: false, error: err.message, ingredients: [], steps: [] });
    }
  }
  const q = String(req.query?.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q 필요' });
  const localItems = searchLocalMarketSymbols(q, 8);

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 budgetproject symbol search',
        'Accept': 'application/json',
      },
    });
    if (!response.ok) return res.status(200).json({ ok: true, items: [], warning: `search ${response.status}` });
    const data = await response.json();
    const yahooItems = (data.quotes || []).slice(0, 8).map(item => ({
      symbol: item.symbol,
      name: item.shortname || item.longname || item.symbol,
      exchange: item.exchange || '',
      type: item.quoteType || '',
    }));
    const items = mergeSymbolItems(localItems, yahooItems).slice(0, 8);
    return res.status(200).json({ ok: true, items });
  } catch (err) {
    return res.status(200).json({ ok: true, items: localItems, warning: err.message });
  }
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function mergeSymbolItems(...groups) {
  const seen = new Set();
  return groups.flat().filter(item => {
    const key = String(item.symbol || '').toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
