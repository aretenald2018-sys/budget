import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = ['../app.js', '../render-home.js', '../render-settings.js'];

test('app, home, and settings share one report module URL', async () => {
  const sources = await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')));
  const specifiers = sources.map(source => source.match(/['"](\.\/render-report\.js)['"]/)?.[1] || '');
  assert.ok(specifiers.every(Boolean), `missing report import: ${JSON.stringify(specifiers)}`);
  assert.equal(new Set(specifiers).size, 1, `duplicate report module instances: ${JSON.stringify(specifiers)}`);
});
