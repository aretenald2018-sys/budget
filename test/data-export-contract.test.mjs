import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { loadFixture } from './helpers/fixtures.mjs';

const expected = await loadFixture('data-export-contract.json', import.meta.url);

function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s+const\s+(\w+)/g)) names.add(match[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}(?:\s+from\s+['"][^'"]+['"])?/g)) {
    match[1].split(',').map(item => item.trim()).filter(Boolean).forEach(item => {
      const parts = item.split(/\s+as\s+/);
      names.add(parts[1] || parts[0]);
    });
  }
  return [...names].sort();
}

test('root data.js keeps the browser data-boundary export contract', async () => {
  const source = await fs.readFile(new URL('../data.js', import.meta.url), 'utf8');
  assert.deepEqual(exportedNames(source), [...expected].sort());
  assert.doesNotMatch(source, /export\s+\*/);
});
