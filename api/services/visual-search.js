export function createVisualSearchService({ searchAdapter }) {
  if (typeof searchAdapter?.search !== 'function') throw new Error('visual search adapter required');
  return {
    async search(query, limit = 8) {
      const normalizedQuery = String(query || '').trim();
      const normalizedLimit = Math.max(1, Math.min(10, Number(limit) || 8));
      if (!normalizedQuery) return { ok: false, status: 400, error: 'q 필요', items: [] };
      try {
        const remote = await searchAdapter.search(normalizedQuery, normalizedLimit);
        return { ok: true, status: 200, provider: remote.provider, items: remote.items.slice(0, normalizedLimit) };
      } catch (err) {
        return { ok: true, status: 200, provider: 'none', warning: err.message, items: [] };
      }
    },
  };
}
