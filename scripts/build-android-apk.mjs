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

function commandPath(command) {
  if (!process.env.JAVA_HOME) return command;
  const candidate = path.join(process.env.JAVA_HOME, 'bin', toolName(command));
  return candidate;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    fail([
      `Command failed: ${command} ${args.join(' ')}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result;
}

async function main() {
  if (!sdkRoot) {
    fail('ANDROID_HOME or ANDROID_SDK_ROOT is required to build the APK.');
  }

  const buildToolsVersion = await newestSubdir(path.join(sdkRoot, 'build-tools'));
  if (!buildToolsVersion) fail(`No Android build-tools found under ${sdkRoot}.`);
  const buildTools = path.join(sdkRoot, 'build-tools', buildToolsVersion);
  const platformVersion = await newestSubdir(path.join(sdkRoot, 'platforms'), name => /^android-\d+$/.test(name));
  if (!platformVersion) fail(`No Android platform found under ${sdkRoot}.`);
  const androidJar = path.join(sdkRoot, 'platforms', platformVersion, 'android.jar');

  const aapt2 = path.join(buildTools, toolName('aapt2'));
  const d8 = path.join(buildTools, toolName('d8', true));
  const zipalign = path.join(buildTools, toolName('zipalign'));
  const apksigner = path.join(buildTools, toolName('apksigner', true));
  for (const tool of [aapt2, d8, zipalign, apksigner, androidJar]) {
    if (!(await exists(tool))) fail(`Missing Android build dependency: ${tool}`);
  }

  const compiledZip = path.join(buildRoot, 'compiled-res.zip');
  const genJava = path.join(buildRoot, 'gen');
  const classesDir = path.join(buildRoot, 'classes');
  const dexDir = path.join(buildRoot, 'dex');
  const unsignedApk = path.join(buildRoot, 'budget-unsigned.apk');
  const alignedApk = path.join(buildRoot, 'budget-aligned.apk');
  const signedApk = path.join(buildRoot, 'budget.apk');
  const keystore = path.join(buildRoot, 'debug.keystore');

  await fs.rm(buildRoot, { recursive: true, force: true });
  await fs.mkdir(buildRoot, { recursive: true });
  await fs.mkdir(genJava, { recursive: true });
  await fs.mkdir(classesDir, { recursive: true });
  await fs.mkdir(dexDir, { recursive: true });

  run(aapt2, ['compile', '--dir', path.join(androidRoot, 'res'), '-o', compiledZip]);
  run(aapt2, [
    'link',
    '-o', unsignedApk,
    '-I', androidJar,
    '--min-sdk-version', '23',
    '--target-sdk-version', '35',
    '--version-code', '1',
    '--version-name', '1.0.0',
    '--manifest', path.join(androidRoot, 'AndroidManifest.xml'),
    '--java', genJava,
    compiledZip,
  ]);

  const javaFiles = [
    ...(await listFiles(path.join(androidRoot, 'src'), file => file.endsWith('.java'))),
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
  run(d8, ['--release', '--lib', androidJar, '--output', dexDir, ...classFiles]);
  run(commandPath('jar'), ['uf', unsignedApk, '-C', dexDir, 'classes.dex']);
  run(zipalign, ['-f', '4', unsignedApk, alignedApk]);

  run(commandPath('keytool'), [
    '-genkeypair',
    '-keystore', keystore,
    '-storepass', 'android',
    '-keypass', 'android',
    '-alias', 'androiddebugkey',
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-dname', `CN=${appId}, O=Tomato Budget, C=KR`,
  ]);
  run(apksigner, [
    'sign',
    '--ks', keystore,
    '--ks-pass', 'pass:android',
    '--key-pass', 'pass:android',
    '--out', signedApk,
    alignedApk,
  ]);
  run(apksigner, ['verify', '--verbose', signedApk]);

  await fs.mkdir(outDir, { recursive: true });
  await fs.copyFile(signedApk, outApk);
  const stat = await fs.stat(outApk);
  await fs.writeFile(path.join(outDir, 'budget-apk.json'), JSON.stringify({
    appId,
    url: 'https://aretenald2018-sys.github.io/budget/downloads/budget.apk',
    bytes: stat.size,
    builtAt: new Date().toISOString(),
  }, null, 2), 'utf8');
  console.log(`Android APK ready: ${outApk} (${stat.size} bytes)`);
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
