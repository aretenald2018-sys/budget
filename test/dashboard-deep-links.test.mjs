import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Budget exposes spending and wine deep links', async () => {
  const [manifest, activity] = await Promise.all([
    fs.readFile(path.join(root, 'android', 'AndroidManifest.xml'), 'utf8'),
    fs.readFile(path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'MainActivity.java'), 'utf8'),
  ]);
  assert.match(manifest, /android:scheme="tomatobudget"/);
  assert.match(manifest, /android:host="spending"[\s\S]*android:pathPrefix="\/month"/);
  assert.match(manifest, /android:host="wine"[\s\S]*android:pathPrefix="\/recent"/);
  assert.match(activity, /"spending"\.equals\(host\)[\s\S]*return APP_URL \+ "\?entry=spending"/);
  assert.match(activity, /"wine"\.equals\(host\)[\s\S]*return APP_URL \+ "\?entry=wine"/);
});

test('Budget web entry opens the matching surface after authentication', async () => {
  const app = await fs.readFile(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /\['spending', 'wine'\]\.includes\(entry\)/);
  assert.match(app, /launchEntry === 'spending'[\s\S]*switchTab\('report'\)/);
  assert.match(app, /launchEntry === 'wine'[\s\S]*switchTab\('home'\)[\s\S]*openWineCellar\(\)/);
  assert.match(app, /url\.searchParams\.delete\('entry'\)/);
});
