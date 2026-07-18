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
  assert.match(activity, /EXTRA_ENTRY = "entry"/);
  assert.match(activity, /intent\.getStringExtra\(EXTRA_ENTRY\)/);
  assert.match(activity, /"spending"\.equals\(host\)[\s\S]*return "spending"/);
  assert.match(activity, /"wine"\.equals\(host\)[\s\S]*return "wine"/);
  assert.match(activity, /"spending"\.equals\(value\) \|\| "wine"\.equals\(value\)/);
});

test('Budget native cold and warm entries reuse the canonical app document', async () => {
  const activity = await fs.readFile(
    path.join(root, 'android', 'src', 'com', 'aretenald', 'budget', 'MainActivity.java'),
    'utf8',
  );
  const onNewIntent = activity.match(/protected void onNewIntent\(Intent intent\)[\s\S]*?\n    }/)?.[0] || '';

  assert.match(activity, /queueEntry\(entryForIntent\(getIntent\(\)\)\)[\s\S]*webView\.loadUrl\(APP_URL\)/);
  assert.match(onNewIntent, /queueEntry\(entryForIntent\(intent\)\)[\s\S]*deliverPendingEntry\(\)/);
  assert.doesNotMatch(onNewIntent, /loadUrl/);
  assert.doesNotMatch(activity, /APP_URL \+ "\?entry=/);
  assert.match(activity, /onPageFinished[\s\S]*appPageReady[\s\S]*deliverPendingEntry\(\)/);
  assert.match(activity, /receiveBudgetNativeEntry/);
  assert.match(activity, /evaluateJavascript/);
  assert.match(activity, /window\.__budgetNativeEntries/);
});

test('Budget web and native entries open matching surfaces after authentication', async () => {
  const [app, launchEntry] = await Promise.all([
    fs.readFile(path.join(root, 'app.js'), 'utf8'),
    fs.readFile(path.join(root, 'utils', 'launch-entry.js'), 'utf8'),
  ]);
  assert.match(app, /readBudgetWebLaunchEntry\(\)/);
  assert.match(app, /installBudgetNativeEntryReceiver\(_launchEntryQueue\)/);
  assert.match(app, /createBudgetLaunchEntryHandler\([\s\S]*switchTab,[\s\S]*openWineCellar/);
  assert.match(app, /_appSessionVisible && !!getCurrentUser\(\)/);
  assert.match(app, /_launchEntryQueue\.flush\(\)/);
  assert.match(launchEntry, /source === 'web-query'[\s\S]*clearEntry\(\)/);
  assert.match(launchEntry, /entry === 'spending'[\s\S]*switchTab\('report'\)/);
  assert.match(launchEntry, /switchTab\('home'\)[\s\S]*openWineCellar\(\)/);
});
