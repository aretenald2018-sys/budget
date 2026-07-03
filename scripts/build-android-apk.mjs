import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = path.join(root, 'android');
const buildRoot = path.join(root, '.android-build');
const defaultPublicOutDir = path.join(root, 'public', 'downloads');
const appId = 'com.aretenald.budget';
const minSdkVersion = '23';
const targetSdkVersion = '35';
const apkVersionPath = path.join(androidRoot, 'apk-version.json');
const localSigningDir = path.join(root, '.android-signing');
const localKeystorePath = path.join(localSigningDir, 'budget-update.keystore');
const defaultKeyAlias = 'budget-update-key';
const nativeIngestJavaFiles = new Set([
  'BudgetNativeBridge.java',
  'BudgetNotificationListener.java',
  'BudgetSmsReceiver.java',
  'NativeIngestClient.java',
  'NativeIngestStore.java',
]);
const nativeIngestServiceBlock = `
        <receiver
            android:name=".BudgetSmsReceiver"
            android:exported="true"
            android:permission="android.permission.BROADCAST_SMS">
            <intent-filter>
                <action android:name="android.provider.Telephony.SMS_RECEIVED" />
            </intent-filter>
        </receiver>

        <service
            android:name=".BudgetNotificationListener"
            android:exported="true"
            android:label="@string/notification_listener_name"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
            <meta-data
                android:name="android.service.notification.default_filter_types"
                android:value="conversations|alerting|silent|ongoing" />
        </service>
`;

const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const cliArgs = process.argv.slice(2);

function fail(message) {
  throw new Error(message);
}

function toolName(name, bat = false) {
  if (process.platform !== 'win32') return name;
  return `${name}${bat ? '.bat' : '.exe'}`;
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
  const dirs = entries
    .filter(entry => entry.isDirectory() && filter(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return dirs.at(-1) || '';
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

async function readApkVersion() {
  const raw = await fs.readFile(apkVersionPath, 'utf8');
  const parsed = JSON.parse(raw);
  const versionCode = Number(process.env.BUDGET_ANDROID_VERSION_CODE || parsed.versionCode);
  const versionName = String(process.env.BUDGET_ANDROID_VERSION_NAME || parsed.versionName || '').trim();
  const cacheBust = String(parsed.cacheBust || `apk-v${versionCode}`).trim();
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    fail(`Invalid Android versionCode in ${apkVersionPath}.`);
  }
  if (!versionName) {
    fail(`Invalid Android versionName in ${apkVersionPath}.`);
  }
  return { versionCode: String(versionCode), versionName, cacheBust };
}

function cliFlag(name) {
  return cliArgs.includes(name);
}

function cliValue(name) {
  const index = cliArgs.indexOf(name);
  if (index >= 0 && cliArgs[index + 1]) return cliArgs[index + 1];
  const prefix = `${name}=`;
  const match = cliArgs.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function resolveOutput(nativeIngestEnabled) {
  const rawOut = cliValue('--out') || nonEmptyEnv('BUDGET_ANDROID_OUT_APK');
  const outApk = rawOut
    ? path.resolve(root, rawOut)
    : nativeIngestEnabled
      ? path.join(root, '.android-private', 'budget-native.apk')
      : path.join(defaultPublicOutDir, 'budget.apk');
  const outDir = path.dirname(outApk);
  const parsed = path.parse(outApk);
  const metadataPath = path.join(outDir, `${parsed.name}-apk.json`);
  const publicMetadataPath = !nativeIngestEnabled && outDir === defaultPublicOutDir
    ? path.join(outDir, 'budget-apk.json')
    : metadataPath;
  return { outApk, outDir, metadataPath: publicMetadataPath };
}

function commandPath(command) {
  if (!process.env.JAVA_HOME) return command;
  const candidate = path.join(process.env.JAVA_HOME, 'bin', toolName(command));
  return candidate;
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (!/[ \t"]/g.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function run(command, args, options = {}) {
  const isWindowsBatch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
  const runCommand = isWindowsBatch ? (process.env.ComSpec || 'cmd.exe') : command;
  const runArgs = isWindowsBatch
    ? ['/d', '/c', ['call', command, ...args].map(quoteWindowsArg).join(' ')]
    : args;
  const result = spawnSync(runCommand, runArgs, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    fail([
      `Command failed: ${command} ${args.join(' ')}`,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result;
}

function nonEmptyEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : '';
}

function isEnabledEnv(name) {
  return ['1', 'true', 'yes', 'on'].includes(nonEmptyEnv(name).toLowerCase());
}

function isNativeIngestRequested() {
  return cliFlag('--native') || isEnabledEnv('BUDGET_ANDROID_NATIVE_INGEST');
}

async function buildManifest(nativeIngestEnabled) {
  const source = path.join(androidRoot, 'AndroidManifest.xml');
  const target = path.join(buildRoot, 'AndroidManifest.xml');
  let manifest = await fs.readFile(source, 'utf8');
  if (nativeIngestEnabled) {
    manifest = manifest.replace(
      '<uses-permission android:name="android.permission.INTERNET" />',
      [
        '<uses-permission android:name="android.permission.INTERNET" />',
        '    <uses-permission android:name="android.permission.RECEIVE_SMS" />',
        '',
        '    <uses-feature',
        '        android:name="android.hardware.telephony"',
        '        android:required="false" />',
      ].join('\n')
    );
    manifest = manifest.replace(/\s*<\/application>/, `${nativeIngestServiceBlock}\n    </application>`);
  }
  await fs.writeFile(target, manifest, 'utf8');
  return target;
}

async function writeNativeHooks(nativeIngestEnabled, genJava) {
  const packageDir = path.join(genJava, 'com', 'aretenald', 'budget');
  await fs.mkdir(packageDir, { recursive: true });
  const lines = nativeIngestEnabled
    ? [
      'package com.aretenald.budget;',
      '',
      'import android.Manifest;',
      'import android.app.Activity;',
      'import android.content.ComponentName;',
      'import android.content.pm.PackageManager;',
      'import android.os.Build;',
      'import android.service.notification.NotificationListenerService;',
      'import android.webkit.WebView;',
      '',
      'final class NativeHooks {',
      '    static void attach(WebView webView, Activity activity) {',
      '        webView.addJavascriptInterface(new BudgetNativeBridge(activity), "BudgetAndroid");',
      '        if (Build.VERSION.SDK_INT >= 23 && activity.checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) {',
      '            activity.requestPermissions(new String[] { Manifest.permission.RECEIVE_SMS }, 7301);',
      '        }',
      '        if (Build.VERSION.SDK_INT >= 24) {',
      '            try {',
      '                NotificationListenerService.requestRebind(new ComponentName(activity, BudgetNotificationListener.class));',
      '            } catch (Exception ignored) {',
      '            }',
      '        }',
      '    }',
      '}',
      '',
    ]
    : [
    'package com.aretenald.budget;',
    '',
      'import android.app.Activity;',
      'import android.webkit.WebView;',
      '',
      'final class NativeHooks {',
      '    static void attach(WebView webView, Activity activity) {',
      '        // Public APK intentionally has no native notification-ingest bridge.',
      '    }',
    '}',
    '',
    ];
  await fs.writeFile(path.join(packageDir, 'NativeHooks.java'), lines.join('\n'), 'utf8');
}

async function writeBase64Keystore(target, encoded) {
  const normalized = encoded.replace(/\s+/g, '');
  const bytes = Buffer.from(normalized, 'base64');
  if (!bytes.length) fail('BUDGET_ANDROID_KEYSTORE_BASE64 is empty.');
  await fs.writeFile(target, bytes);
}

async function ensureLocalKeystore(keytool, storePass, keyPass, alias) {
  await fs.mkdir(localSigningDir, { recursive: true });
  if (await exists(localKeystorePath)) {
    return { keystore: localKeystorePath, mode: 'local-persistent' };
  }
  run(keytool, [
    '-genkeypair',
    '-keystore', localKeystorePath,
    '-storepass', storePass,
    '-keypass', keyPass,
    '-alias', alias,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-dname', `CN=${appId}, O=Tomato Budget, C=KR`,
  ]);
  return { keystore: localKeystorePath, mode: 'local-generated' };
}

async function resolveSigningConfig(keytool, buildRoot) {
  const alias = nonEmptyEnv('BUDGET_ANDROID_KEY_ALIAS') || defaultKeyAlias;
  const encodedKeystore = nonEmptyEnv('BUDGET_ANDROID_KEYSTORE_BASE64');
  const envKeystorePath = nonEmptyEnv('BUDGET_ANDROID_KEYSTORE_PATH');
  const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
  const hasExternalKeystore = Boolean(encodedKeystore || envKeystorePath);
  const storePass = nonEmptyEnv('BUDGET_ANDROID_KEYSTORE_PASSWORD') || (hasExternalKeystore ? '' : 'android');
  const keyPass = nonEmptyEnv('BUDGET_ANDROID_KEY_PASSWORD') || storePass;

  if (isGithubActions && !encodedKeystore) {
    fail('BUDGET_ANDROID_KEYSTORE_BASE64 GitHub secret is required for update-safe production APK builds.');
  }
  if (!storePass) {
    fail('BUDGET_ANDROID_KEYSTORE_PASSWORD is required when using an external Android signing keystore.');
  }
  if (!keyPass) {
    fail('BUDGET_ANDROID_KEY_PASSWORD is required when using an external Android signing keystore.');
  }

  if (encodedKeystore) {
    const keystore = path.join(buildRoot, 'release.keystore');
    await writeBase64Keystore(keystore, encodedKeystore);
    return { keystore, storePass, keyPass, alias, mode: 'github-secret' };
  }

  if (envKeystorePath) {
    const keystore = path.resolve(envKeystorePath);
    if (!(await exists(keystore))) fail(`BUDGET_ANDROID_KEYSTORE_PATH does not exist: ${keystore}`);
    return { keystore, storePass, keyPass, alias, mode: 'env-path' };
  }

  const local = await ensureLocalKeystore(keytool, storePass, keyPass, alias);
  return { ...local, storePass, keyPass, alias };
}

async function main() {
  if (!sdkRoot) {
    fail('ANDROID_HOME or ANDROID_SDK_ROOT is required to build the APK.');
  }

  const apkVersion = await readApkVersion();
  const nativeIngestEnabled = isNativeIngestRequested();
  const output = resolveOutput(nativeIngestEnabled);
  const buildToolsVersion = await newestSubdir(path.join(sdkRoot, 'build-tools'), name => {
    const major = Number(String(name).split('.')[0]);
    return Number.isFinite(major) && major <= Number(targetSdkVersion);
  });
  if (!buildToolsVersion) fail(`No Android build-tools found under ${sdkRoot}.`);
  const buildTools = path.join(sdkRoot, 'build-tools', buildToolsVersion);
  const platformVersion = await newestSubdir(path.join(sdkRoot, 'platforms'), name => /^android-\d+$/.test(name));
  if (!platformVersion) fail(`No Android platform found under ${sdkRoot}.`);
  const androidJar = path.join(sdkRoot, 'platforms', platformVersion, 'android.jar');

  const aapt2 = path.join(buildTools, toolName('aapt2'));
  const java = commandPath('java');
  const d8Jar = path.join(buildTools, 'lib', 'd8.jar');
  const d8Main = 'com.android.tools.r8.D8';
  const zipalign = path.join(buildTools, toolName('zipalign'));
  const apksignerJar = path.join(buildTools, 'lib', 'apksigner.jar');
  for (const tool of [aapt2, d8Jar, zipalign, apksignerJar, androidJar]) {
    if (!(await exists(tool))) fail(`Missing Android build dependency: ${tool}`);
  }

  const compiledZip = path.join(buildRoot, 'compiled-res.zip');
  const genJava = path.join(buildRoot, 'gen');
  const classesDir = path.join(buildRoot, 'classes');
  const dexDir = path.join(buildRoot, 'dex');
  const unsignedApk = path.join(buildRoot, 'budget-unsigned.apk');
  const alignedApk = path.join(buildRoot, 'budget-aligned.apk');
  const signedApk = path.join(buildRoot, 'budget.apk');

  await fs.rm(buildRoot, { recursive: true, force: true });
  await fs.mkdir(buildRoot, { recursive: true });
  await fs.mkdir(genJava, { recursive: true });
  await fs.mkdir(classesDir, { recursive: true });
  await fs.mkdir(dexDir, { recursive: true });
  const signing = await resolveSigningConfig(commandPath('keytool'), buildRoot);
  const buildManifestPath = await buildManifest(nativeIngestEnabled);

  run(aapt2, ['compile', '--dir', path.join(androidRoot, 'res'), '-o', compiledZip]);
  run(aapt2, [
    'link',
    '-o', unsignedApk,
    '-I', androidJar,
    '--min-sdk-version', minSdkVersion,
    '--target-sdk-version', targetSdkVersion,
    '--version-code', apkVersion.versionCode,
    '--version-name', apkVersion.versionName,
    '--manifest', buildManifestPath,
    '--java', genJava,
    compiledZip,
  ]);
  await writeNativeHooks(nativeIngestEnabled, genJava);

  const javaFiles = [
    ...(await listFiles(path.join(androidRoot, 'src'), file => {
      if (!file.endsWith('.java')) return false;
      if (nativeIngestEnabled) return true;
      return !nativeIngestJavaFiles.has(path.basename(file));
    })),
    ...(await listFiles(genJava, file => file.endsWith('.java'))),
  ];
  run(commandPath('javac'), [
    '-encoding', 'UTF-8',
    '-source', '8',
    '-target', '8',
    '-bootclasspath', androidJar,
    '-d', classesDir,
    ...javaFiles,
  ]);

  const classFiles = await listFiles(classesDir, file => file.endsWith('.class'));
  run(java, ['-cp', d8Jar, d8Main, '--release', '--lib', androidJar, '--output', dexDir, ...classFiles]);
  run(commandPath('jar'), ['uf', unsignedApk, '-C', dexDir, 'classes.dex']);
  run(zipalign, ['-f', '4', unsignedApk, alignedApk]);

  run(java, ['-jar', apksignerJar,
    'sign',
    '--ks', signing.keystore,
    '--ks-key-alias', signing.alias,
    '--ks-pass', `pass:${signing.storePass}`,
    '--key-pass', `pass:${signing.keyPass}`,
    '--out', signedApk,
    alignedApk,
  ]);
  run(java, ['-jar', apksignerJar, 'verify', '--verbose', signedApk]);

  await fs.mkdir(output.outDir, { recursive: true });
  await fs.copyFile(signedApk, output.outApk);
  const stat = await fs.stat(output.outApk);
  await fs.writeFile(output.metadataPath, JSON.stringify({
    appId,
    versionCode: Number(apkVersion.versionCode),
    versionName: apkVersion.versionName,
    cacheBust: apkVersion.cacheBust,
    nativeIngestEnabled,
    url: 'https://aretenald2018-sys.github.io/budget/downloads/budget.apk',
    bytes: stat.size,
    signing: {
      mode: signing.mode,
      keyAlias: signing.alias,
      updateSafe: ['github-secret', 'env-path', 'local-persistent', 'local-generated'].includes(signing.mode),
    },
    builtAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  console.log(`Android APK ready: ${output.outApk} (${stat.size} bytes, v${apkVersion.versionName}/${apkVersion.versionCode}, ${signing.mode}, nativeIngest=${nativeIngestEnabled})`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
