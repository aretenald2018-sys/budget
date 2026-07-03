import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const javaHome = process.env.JAVA_HOME;
const appId = 'com.aretenald.budget';
const listener = `${appId}/${appId}.BudgetNotificationService`;
const fixtureId = 'com.hanapay.notificationfixture';
const buildRoot = path.join(root, '.android-notification-e2e');
const fixtureRoot = path.join(buildRoot, 'fixture');
const minSdkVersion = '23';
const targetSdkVersion = '35';

function fail(message) {
  throw new Error(message);
}

function toolName(name) {
  if (process.platform !== 'win32') return name;
  return `${name}.exe`;
}

function commandPath(command) {
  if (!javaHome) return command;
  return path.join(javaHome, 'bin', toolName(command));
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[ \t"]/g.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function run(command, args, options = {}) {
  const isWindowsBatch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
  const result = spawnSync(
    isWindowsBatch ? (process.env.ComSpec || 'cmd.exe') : command,
    isWindowsBatch ? ['/d', '/c', ['call', command, ...args].map(quoteWindowsArg).join(' ')] : args,
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      ...options,
    },
  );
  if (result.status !== 0 && !options.allowFailure) {
    fail([
      `Command failed: ${command} ${args.join(' ')}`,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function newestSubdir(dir, filter = () => true) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter(entry => entry.isDirectory() && filter(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1) || '';
}

async function listFiles(dir, predicate = () => true, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

async function writeFixtureSources() {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(fixtureRoot, 'res', 'values'), { recursive: true });
  await fs.mkdir(path.join(fixtureRoot, 'src', 'com', 'hanapay', 'notificationfixture'), { recursive: true });
  await fs.writeFile(path.join(fixtureRoot, 'res', 'values', 'strings.xml'), [
    '<resources>',
    '    <string name="app_name">하나Pay</string>',
    '</resources>',
    '',
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(fixtureRoot, 'AndroidManifest.xml'), [
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${fixtureId}">`,
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '    <application',
    '        android:label="@string/app_name"',
    '        android:theme="@android:style/Theme.Material.NoActionBar">',
    '        <activity android:name=".MainActivity" android:exported="true">',
    '            <intent-filter>',
    '                <action android:name="android.intent.action.MAIN" />',
    '                <category android:name="android.intent.category.LAUNCHER" />',
    '            </intent-filter>',
    '        </activity>',
    '    </application>',
    '</manifest>',
    '',
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(fixtureRoot, 'src', 'com', 'hanapay', 'notificationfixture', 'MainActivity.java'), [
    'package com.hanapay.notificationfixture;',
    '',
    'import android.Manifest;',
    'import android.app.Activity;',
    'import android.app.Notification;',
    'import android.app.NotificationChannel;',
    'import android.app.NotificationManager;',
    'import android.content.pm.PackageManager;',
    'import android.os.Build;',
    'import android.os.Bundle;',
    '',
    'public class MainActivity extends Activity {',
    '    private static final String CHANNEL_ID = "budget_fixture_payments";',
    '    private static final String BODY = "(결제) 2,200원 씨유문정엠스테이트점 / 신용(일시불) / 07.03 14:40";',
    '',
    '    @Override',
    '    protected void onCreate(Bundle savedInstanceState) {',
    '        super.onCreate(savedInstanceState);',
    '        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {',
    '            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7);',
    '            return;',
    '        }',
    '        postAndFinish();',
    '    }',
    '',
    '    @Override',
    '    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {',
    '        super.onRequestPermissionsResult(requestCode, permissions, grantResults);',
    '        postAndFinish();',
    '    }',
    '',
    '    private void postAndFinish() {',
    '        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);',
    '        if (Build.VERSION.SDK_INT >= 26) {',
    '            manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "결제 알림", NotificationManager.IMPORTANCE_DEFAULT));',
    '        }',
    '        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);',
    '        builder.setSmallIcon(android.R.drawable.stat_notify_more)',
    '            .setContentTitle("하나Pay")',
    '            .setContentText(BODY)',
    '            .setStyle(new Notification.BigTextStyle().bigText(BODY))',
    '            .setWhen(System.currentTimeMillis())',
    '            .setAutoCancel(false);',
    '        manager.notify(2200, builder.build());',
    '        finish();',
    '    }',
    '}',
    '',
  ].join('\n'), 'utf8');
}

async function buildFixtureApk() {
  const buildToolsVersion = await newestSubdir(path.join(sdkRoot, 'build-tools'), name => {
    const major = Number(String(name).split('.')[0]);
    return Number.isFinite(major) && major <= Number(targetSdkVersion);
  });
  const platformVersion = await newestSubdir(path.join(sdkRoot, 'platforms'), name => /^android-\d+$/.test(name));
  if (!buildToolsVersion || !platformVersion) fail('Android build-tools/platforms are missing.');
  const buildTools = path.join(sdkRoot, 'build-tools', buildToolsVersion);
  const androidJar = path.join(sdkRoot, 'platforms', platformVersion, 'android.jar');
  const aapt2 = path.join(buildTools, toolName('aapt2'));
  const d8Jar = path.join(buildTools, 'lib', 'd8.jar');
  const zipalign = path.join(buildTools, toolName('zipalign'));
  const apksignerJar = path.join(buildTools, 'lib', 'apksigner.jar');
  for (const tool of [aapt2, d8Jar, zipalign, apksignerJar, androidJar]) {
    if (!(await exists(tool))) fail(`Missing Android build dependency: ${tool}`);
  }

  const out = path.join(buildRoot, 'fixture-build');
  const gen = path.join(out, 'gen');
  const classes = path.join(out, 'classes');
  const dex = path.join(out, 'dex');
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(gen, { recursive: true });
  await fs.mkdir(classes, { recursive: true });
  await fs.mkdir(dex, { recursive: true });

  const compiled = path.join(out, 'compiled-res.zip');
  const unsigned = path.join(out, 'fixture-unsigned.apk');
  const aligned = path.join(out, 'fixture-aligned.apk');
  const signed = path.join(out, 'fixture.apk');
  run(aapt2, ['compile', '--dir', path.join(fixtureRoot, 'res'), '-o', compiled]);
  run(aapt2, [
    'link',
    '-o', unsigned,
    '-I', androidJar,
    '--min-sdk-version', minSdkVersion,
    '--target-sdk-version', targetSdkVersion,
    '--version-code', '1',
    '--version-name', '1.0',
    '--manifest', path.join(fixtureRoot, 'AndroidManifest.xml'),
    '--java', gen,
    compiled,
  ]);
  const javaFiles = [
    ...(await listFiles(path.join(fixtureRoot, 'src'), file => file.endsWith('.java'))),
    ...(await listFiles(gen, file => file.endsWith('.java'))),
  ];
  run(commandPath('javac'), [
    '-encoding', 'UTF-8',
    '-source', '8',
    '-target', '8',
    '-bootclasspath', androidJar,
    '-d', classes,
    ...javaFiles,
  ]);
  const classFiles = await listFiles(classes, file => file.endsWith('.class'));
  run(commandPath('java'), ['-cp', d8Jar, 'com.android.tools.r8.D8', '--release', '--lib', androidJar, '--output', dex, ...classFiles]);
  run(commandPath('jar'), ['uf', unsigned, '-C', dex, 'classes.dex']);
  run(zipalign, ['-f', '4', unsigned, aligned]);

  const keystore = path.join(buildRoot, 'fixture.keystore');
  if (!(await exists(keystore))) {
    run(commandPath('keytool'), [
      '-genkeypair',
      '-keystore', keystore,
      '-storepass', 'android',
      '-keypass', 'android',
      '-alias', 'fixture',
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-dname', 'CN=Android Notification Fixture, O=Tomato Budget, C=KR',
    ]);
  }
  run(commandPath('java'), ['-jar', apksignerJar, 'sign', '--ks', keystore, '--ks-key-alias', 'fixture', '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', signed, aligned]);
  run(commandPath('java'), ['-jar', apksignerJar, 'verify', '--verbose', signed]);
  return signed;
}

function adbShell(adb, args, options = {}) {
  return run(adb, ['shell', ...args], options);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (!sdkRoot) fail('ANDROID_HOME or ANDROID_SDK_ROOT is required.');
  if (!javaHome) fail('JAVA_HOME is required.');
  const adb = path.join(sdkRoot, 'platform-tools', toolName('adb'));
  if (!(await exists(adb))) fail(`adb not found: ${adb}`);

  const devices = run(adb, ['devices'], { allowFailure: false }).stdout;
  if (!/\nemulator-\d+\s+device\b/.test(devices)) {
    fail('No running emulator found. Start an emulator before running this E2E check.');
  }
  const qemu = adbShell(adb, ['getprop', 'ro.kernel.qemu']).stdout.trim();
  if (qemu !== '1') {
    fail('This E2E script only runs against an emulator because it reads app-private SharedPreferences.');
  }

  run(process.execPath, ['scripts/build-android-apk.mjs', '--out', 'public/downloads/budget.apk']);
  run(adb, ['install', '-r', path.join(root, 'public', 'downloads', 'budget.apk')]);
  run(adb, ['root'], { allowFailure: true });
  await sleep(2000);
  adbShell(adb, ['rm', '-f', `/data/data/${appId}/shared_prefs/budget_notification_capture_store.xml`], { allowFailure: true });
  adbShell(adb, ['cmd', 'notification', 'allow_listener', listener]);
  adbShell(adb, ['am', 'start', '-n', `${appId}/.MainActivity`]);
  await sleep(5000);

  await writeFixtureSources();
  const fixtureApk = await buildFixtureApk();
  run(adb, ['uninstall', fixtureId], { allowFailure: true });
  run(adb, ['install', '-r', fixtureApk]);
  adbShell(adb, ['pm', 'grant', fixtureId, 'android.permission.POST_NOTIFICATIONS'], { allowFailure: true });
  adbShell(adb, ['am', 'start', '-n', `${fixtureId}/.MainActivity`]);
  await sleep(4000);

  const prefs = adbShell(adb, ['cat', `/data/data/${appId}/shared_prefs/budget_notification_capture_store.xml`]).stdout;
  if (!prefs.includes('&quot;status&quot;:&quot;queued&quot;') || !prefs.includes('2200') || !prefs.includes('씨유문정엠스테이트점')) {
    fail(`Android notification E2E did not produce the expected queued capture.\n${prefs}`);
  }
  console.log('Android notification E2E passed: listener captured the fixture payment notification into the local queue.');
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
