// ================================================================
// scripts/setup-android-sdk.mjs — APK 빌드에 필요한 최소 Android SDK 설치
//
// scripts/build-android-apk.mjs 는 Gradle 없이 SDK 도구를 직접 호출한다.
// 그래서 전체 SDK 가 아니라 아래 넷만 있으면 된다.
//   build-tools/<ver>/aapt2
//   build-tools/<ver>/lib/d8.jar
//   build-tools/<ver>/zipalign
//   build-tools/<ver>/lib/apksigner.jar
//   platforms/android-<target>/android.jar
// 이 스크립트는 commandlinetools 를 받아 그 둘(build-tools, platform)만 설치한다.
// 에뮬레이터·시스템 이미지는 받지 않는다(수 GB 절약).
//
//   node scripts/setup-android-sdk.mjs            # 기본 위치에 설치
//   node scripts/setup-android-sdk.mjs --print-env # 설치 없이 환경변수만 출력
//
// 설치 위치 우선순위: ANDROID_HOME > ANDROID_SDK_ROOT > ~/.android-sdk
// ================================================================

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// build-android-apk.mjs 의 targetSdkVersion 과 맞춘다.
const TARGET_SDK = '35';
const BUILD_TOOLS = '35.0.0';
// commandlinetools 는 SDK 패키지 목록을 알고 있는 최소 부트스트랩이다.
const CMDLINE_TOOLS_URL = 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip';
const CMDLINE_TOOLS_URL_MAC = 'https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip';
const CMDLINE_TOOLS_URL_WIN = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip';

const args = process.argv.slice(2);
const printEnvOnly = args.includes('--print-env');

function sdkHome() {
  return process.env.ANDROID_HOME
    || process.env.ANDROID_SDK_ROOT
    || path.join(os.homedir(), '.android-sdk');
}

function cmdlineToolsUrl() {
  if (process.platform === 'darwin') return CMDLINE_TOOLS_URL_MAC;
  if (process.platform === 'win32') return CMDLINE_TOOLS_URL_WIN;
  return CMDLINE_TOOLS_URL;
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

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with ${result.status}`);
  }
}

async function download(url, target) {
  console.log(`[android-sdk] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await pipeline(res.body, createWriteStream(target));
  const { size } = await fs.stat(target);
  console.log(`[android-sdk] downloaded ${(size / 1024 / 1024).toFixed(1)} MB`);
}

async function unzip(archive, destination) {
  await fs.mkdir(destination, { recursive: true });
  // unzip 이 없는 환경(win 등)에서도 되도록 우선 시도 후 실패하면 안내한다.
  const result = spawnSync('unzip', ['-q', '-o', archive, '-d', destination], { stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error("'unzip' 이 필요합니다. 설치 후 다시 실행하세요 (apt-get install unzip / brew install unzip).");
  }
}

// commandlinetools 압축은 cmdline-tools/bin 구조라, sdkmanager 가 요구하는
// cmdline-tools/latest/bin 으로 옮겨준다.
async function ensureCmdlineTools(home) {
  const latestBin = path.join(home, 'cmdline-tools', 'latest', 'bin', toolName('sdkmanager', true));
  if (await exists(latestBin)) {
    console.log('[android-sdk] cmdline-tools already installed');
    return latestBin;
  }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'android-cmdline-'));
  const archive = path.join(tmp, 'cmdline-tools.zip');
  await download(cmdlineToolsUrl(), archive);
  await unzip(archive, tmp);
  const extracted = path.join(tmp, 'cmdline-tools');
  if (!(await exists(extracted))) throw new Error('cmdline-tools 압축 구조가 예상과 다릅니다.');
  const target = path.join(home, 'cmdline-tools', 'latest');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rm(target, { recursive: true, force: true });
  await fs.rename(extracted, target);
  await fs.rm(tmp, { recursive: true, force: true });
  if (process.platform !== 'win32') {
    for (const file of await fs.readdir(path.join(target, 'bin'))) {
      await fs.chmod(path.join(target, 'bin', file), 0o755);
    }
  }
  return latestBin;
}

async function installPackages(sdkmanager, home) {
  const packages = [`platforms;android-${TARGET_SDK}`, `build-tools;${BUILD_TOOLS}`];
  const env = { ...process.env, ANDROID_HOME: home, ANDROID_SDK_ROOT: home };
  // 라이선스 동의 — 비대화형이라 stdin 으로 y 를 밀어넣는다.
  console.log('[android-sdk] accepting licenses');
  spawnSync(sdkmanager, ['--sdk_root=' + home, '--licenses'], {
    input: 'y\n'.repeat(30),
    stdio: ['pipe', 'inherit', 'inherit'],
    env,
  });
  console.log(`[android-sdk] installing ${packages.join(', ')}`);
  run(sdkmanager, ['--sdk_root=' + home, ...packages], { env });
}

async function verifyInstall(home) {
  const buildTools = path.join(home, 'build-tools', BUILD_TOOLS);
  const required = [
    path.join(buildTools, toolName('aapt2')),
    path.join(buildTools, 'lib', 'd8.jar'),
    path.join(buildTools, toolName('zipalign')),
    path.join(buildTools, 'lib', 'apksigner.jar'),
    path.join(home, 'platforms', `android-${TARGET_SDK}`, 'android.jar'),
  ];
  const missing = [];
  for (const file of required) {
    if (!(await exists(file))) missing.push(path.relative(home, file));
  }
  if (missing.length) {
    throw new Error(`설치 후에도 빠진 도구가 있습니다: ${missing.join(', ')}`);
  }
  console.log('[android-sdk] all required build tools present');
}

function printEnv(home) {
  console.log('');
  console.log('APK 를 빌드하려면 이 환경변수를 설정하세요:');
  if (process.platform === 'win32') {
    console.log(`  $env:ANDROID_HOME = "${home}"`);
  } else {
    console.log(`  export ANDROID_HOME="${home}"`);
  }
  console.log('');
  console.log('  npm run apk:build');
}

async function main() {
  const home = sdkHome();
  if (printEnvOnly) {
    printEnv(home);
    return;
  }
  console.log(`[android-sdk] target: ${home}`);
  await fs.mkdir(home, { recursive: true });
  const sdkmanager = await ensureCmdlineTools(home);
  await installPackages(sdkmanager, home);
  await verifyInstall(home);
  void root;
  printEnv(home);
}

main().catch(err => {
  console.error(`[android-sdk] ${err.message}`);
  process.exitCode = 1;
});
