import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = path.join(root, 'android');
const buildRoot = path.join(root, '.android-build');
const outDir = path.join(root, 'public', 'downloads');
const outApk = path.join(outDir, 'budget.apk');
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
  'NativeIngestClient.java',
  'NativeIngestStore.java',
]);
const nativeIngestServiceBlock = `
        <service
            android:name=".BudgetNotificationListener"
            android:exported="true"
            android:label="@string/notification_listener_name"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
`;

const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;

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

async function buildManifest(nativeIngestEnabled) {
  const source = path.join(androidRoot, 'AndroidManifest.xml');
  const target = path.join(buildRoot, 'AndroidManifest.xml');
  let manifest = await fs.readFile(source, 'utf8');
  if (nativeIngestEnabled) {
    manifest = manifest.replace(/\s*<\/application>/, `${nativeIngestServiceBlock}\n    </application>`);
  }
  await fs.writeFile(target, manifest, 'utf8');
  return target;
}

async function writeBuildFlags(nativeIngestEnabled, genJava) {
  const packageDir = path.join(genJava, 'com', 'aretenald', 'budget');
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(path.join(packageDir, 'BuildFlags.java'), [
    'package com.aretenald.budget;',
    '',
    'final class BuildFlags {',
    `    static final boolean NATIVE_INGEST = ${nativeIngestEnabled ? 'true' : 'false'};`,
    '}',
    '',
  ].join('\n'), 'utf8');
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
  const nativeIngestEnabled = isEnabledEnv('BUDGET_ANDROID_NATIVE_INGEST');
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
  await writeBuildFlags(nativeIngestEnabled, genJava);

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

  await fs.mkdir(outDir, { recursive: true });
  await fs.copyFile(signedApk, outApk);
  const stat = await fs.stat(outApk);
  await fs.writeFile(path.join(outDir, 'budget-apk.json'), JSON.stringify({
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
  console.log(`Android APK ready: ${outApk} (${stat.size} bytes, v${apkVersion.versionName}/${apkVersion.versionCode}, ${signing.mode}, nativeIngest=${nativeIngestEnabled})`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
