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

function quoteAndroidShellArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@=%,+-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
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
    '    private static final String BODY_CARD = "(결제) 2,200원 씨유문정엠스테이트점 / 신용(일시불) / 07.03 14:40";',
    '    private static final String BODY_SMS = "[Web발신]\\n하나2*0*승인 김*우 11,000원 일시불 07/01 19:54 뼈우림감자탕문정 누적2,664,049원";',
    '    private static final String BODY_TRANSFER = "[Web발신]\\n하나,07/01 08:23\\n302******29007\\n출금55,000원\\n티머니\\u3000\\u3000\\u3000\\u3000\\u3000\\n잔액-55,279,562원";',
    '    private static final String BODY_KB_CARD = "[Web발신]\\nKB국민카드7711승인\\n김*우님\\n19,050원 일시불\\n07/01 08:52\\n쿠팡(쿠페이)\\n누적435,849원";',
    '    private static final String BODY_KB_CANCEL = "[Web발신]\\nKB국민카드7711취소\\n김*우님\\n17,000원 일시불\\n06/30 22:13\\n쿠팡이츠\\n누적416,799원";',
    "    private static final String BODY_NAVER_CANCEL = \"[Web발신]\\n[네이버페이] 주문취소안내\\n'반석 크리스피 먹태' 15,900원\\nhttp://naver.me/PayC\";",
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
    '        String caseId = getIntent() == null ? "" : getIntent().getStringExtra("case_id");',
    '        if ("sms".equals(caseId)) postPayment(manager, 11000, "김태우", BODY_SMS);',
    '        else if ("transfer".equals(caseId)) postPayment(manager, 55000, "하나", BODY_TRANSFER);',
    '        else if ("kb_card".equals(caseId)) postPayment(manager, 19050, "1588-1688", BODY_KB_CARD);',
    '        else if ("kb_cancel".equals(caseId)) postPayment(manager, 17000, "1588-1688", BODY_KB_CANCEL);',
    '        else if ("naver_cancel".equals(caseId)) postPayment(manager, 15900, "1588-3819", BODY_NAVER_CANCEL);',
    '        else postPayment(manager, 2200, "하나Pay", BODY_CARD);',
    '        finish();',
    '    }',
    '',
    '    private void postPayment(NotificationManager manager, int id, String title, String body) {',
    '        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);',
    '        builder.setSmallIcon(android.R.drawable.stat_notify_more)',
    '            .setContentTitle(title)',
    '            .setContentText(body)',
    '            .setStyle(new Notification.BigTextStyle().bigText(body))',
    '            .setWhen(System.currentTimeMillis())',
    '            .setAutoCancel(false);',
    '        manager.notify(id, builder.build());',
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

function adbShell(adb, serial, args, options = {}) {
  return run(adb, ['-s', serial, 'shell', ...args], options);
}

function adbShellCommand(adb, serial, args, options = {}) {
  return run(adb, ['-s', serial, 'shell', args.map(quoteAndroidShellArg).join(' ')], options);
}

function insertInboxSms(adb, serial, address, body, dateMs) {
  const result = adbShellCommand(adb, serial, [
    'content',
    'insert',
    '--uri',
    'content://sms/inbox',
    '--bind',
    `address:s:${address}`,
    '--bind',
    `body:s:${body}`,
    '--bind',
    `date:l:${dateMs}`,
    '--bind',
    'read:i:0',
    '--bind',
    'type:i:1',
  ]);
  if (result.stdout.includes('[ERROR]') || result.stdout.includes('usage: adb shell content')) {
    fail(`Failed to insert SMS fixture into emulator inbox.\n${result.stdout}`);
  }
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
  const emulatorSerial = devices.match(/\n(emulator-\d+)\s+device\b/)?.[1];
  if (!emulatorSerial) {
    fail('No running emulator found. Start an emulator before running this E2E check.');
  }
  const qemu = adbShell(adb, emulatorSerial, ['getprop', 'ro.kernel.qemu']).stdout.trim();
  if (qemu !== '1') {
    fail('This E2E script only runs against an emulator because it reads app-private SharedPreferences.');
  }

  run(process.execPath, ['scripts/build-android-apk.mjs', '--out', 'public/downloads/budget.apk']);
  run(adb, ['-s', emulatorSerial, 'install', '-r', path.join(root, 'public', 'downloads', 'budget.apk')]);
  run(adb, ['-s', emulatorSerial, 'root'], { allowFailure: true });
  await sleep(2000);
  adbShell(adb, emulatorSerial, ['pm', 'clear', appId], { allowFailure: true });
  adbShell(adb, emulatorSerial, ['pm', 'grant', appId, 'android.permission.READ_SMS'], { allowFailure: true });
  adbShell(adb, emulatorSerial, ['cmd', 'notification', 'allow_listener', listener]);
  adbShell(adb, emulatorSerial, ['am', 'start', '-n', `${appId}/.MainActivity`]);
  await sleep(5000);

  await writeFixtureSources();
  const fixtureApk = await buildFixtureApk();
  run(adb, ['-s', emulatorSerial, 'uninstall', fixtureId], { allowFailure: true });
  run(adb, ['-s', emulatorSerial, 'install', '-r', fixtureApk]);
  adbShell(adb, emulatorSerial, ['pm', 'grant', fixtureId, 'android.permission.POST_NOTIFICATIONS'], { allowFailure: true });
  adbShell(adb, emulatorSerial, ['am', 'start', '-n', `${fixtureId}/.MainActivity`]);
  await sleep(1800);
  adbShell(adb, emulatorSerial, ['cmd', 'notification', 'disallow_listener', listener], { allowFailure: true });
  await sleep(1000);
  adbShell(adb, emulatorSerial, ['cmd', 'notification', 'allow_listener', listener]);

  const now = Date.now();
  const smsBodies = [
    ['01012345678', '[Web발신] 하나2*0*승인 김*우 141,000원 일시불 테스트 누적2,664,049원'],
    ['01012345678', '[Web발신] 하나2*0*승인 김*우 11,000원 일시불 뼈우림감자탕문정 누적2,664,049원'],
    ['1588-1111', '[Web발신] 하나 302******29007 출금55,000원 티머니 잔액-55,279,562원'],
    ['1588-1688', '[Web발신] KB국민카드7711승인 김*우님 19,050원 일시불 쿠팡(쿠페이) 누적435,849원'],
    ['1588-1688', '[Web발신] KB국민카드7711취소 김*우님 17,000원 일시불 쿠팡이츠 누적416,799원'],
    ['1588-3819', "[Web발신] [네이버페이] 주문취소안내 '반석 크리스피 먹태' 15,900원 naver.me/PayC"],
    ['1588-3819', "[Web발신] [네이버페이]결제완료안내 티맵모빌리티 '[티맵 주차]'1,200원 naver.me/PayO"],
    ['1588-3819', '[Web발신] [네이버파이낸셜] 인증번호 [050523]를 입력해주세요.'],
  ];
  smsBodies.forEach(([address, body], index) => {
    insertInboxSms(adb, emulatorSerial, address, body, now - index * 1000);
  });
  adbShell(adb, emulatorSerial, ['am', 'start', '-n', `${appId}/.MainActivity`]);
  await sleep(5000);

  const prefs = adbShell(adb, emulatorSerial, ['cat', `/data/data/${appId}/shared_prefs/budget_notification_capture_store.xml`]).stdout;
  if (!prefs.includes('&quot;status&quot;:&quot;queued&quot;')
    || !prefs.includes('2200')
    || !prefs.includes('씨유문정엠스테이트점')
    || !prefs.includes('141000')
    || !prefs.includes('테스트')
    || !prefs.includes('11000')
    || !prefs.includes('뼈우림감자탕문정')
    || !prefs.includes('55000')
    || !prefs.includes('티머니')
    || !prefs.includes('19050')
    || !prefs.includes('쿠팡(쿠페이)')
    || !prefs.includes('17000')
    || !prefs.includes('쿠팡이츠')
    || !prefs.includes('15900')
    || !prefs.includes('반석 크리스피 먹태')
    || !prefs.includes('1200')
    || !prefs.includes('티맵모빌리티')
    || prefs.includes('050523')
    || !prefs.includes('&quot;type&quot;:&quot;transfer_in&quot;')) {
    fail(`Android local capture E2E did not produce the expected queued notification/SMS captures.\n${prefs}`);
  }
  console.log('Android local capture E2E passed: listener and SMS scanner captured expected payments into the local queue.');
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
