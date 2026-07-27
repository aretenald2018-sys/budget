// ================================================================
// scripts/verify/checks/wiring-checks.mjs — "선언은 있는데 연결이 없다"를 잡는 검사
//
// 기존 계약 검사는 구조("이 필드가 있는가")를 본다. 그런데 실제로 사람을 괴롭힌
// 결함은 전부 인과("A를 바꿨는데 B가 안 변한다") 쪽이었다.
//
//   · settings.budget.cycle  — 저장되지만 어디서도 읽히지 않아 아무 효과가 없었다
//   · settings.budget.amount — 홈이 읽지 않아, 입력해도 '써도 되는 돈'이 그대로였다
//   · rewardSavings.dailyReward / lookbackDays — 렌더되지 않는 값이 계속 남아 있었다
//   · var(--surface-2)       — 정의된 적 없는 변수라 배경이 통째로 무효였다
//   · #app 의 max-width      — 네 파일이 각자 선언해 마지막 import 가 이겼다
//
// 여기 있는 검사는 그 다섯 가지를 다시 만들 수 없게 막는다.
// ================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { fail, rel, root, walk } from '../runtime.mjs';

const SETTINGS_SOURCE = path.join(root, 'data', 'repositories', 'settings.js');

// 설정 파일 자신과 테스트/검사 스크립트는 '읽는 곳'으로 치지 않는다.
// (저장소가 자기 기본값을 정규화하는 건 사용처가 아니다)
function isConsumerFile(file) {
  const r = rel(file);
  if (!/\.(js|mjs)$/.test(r)) return false;
  if (r.startsWith('data/repositories/')) return false;
  if (r.startsWith('test/')) return false;
  if (r.startsWith('scripts/')) return false;
  if (r.startsWith('_site/')) return false;
  return true;
}

// DEFAULT_APP_SETTINGS 리터럴에서 키 경로를 뽑는다.
// 깊이 1의 키와 깊이 2의 스칼라 키만 본다(깊이 3 이상은 항목 스키마라 별도 계약이
// 담당한다). 중괄호 깊이를 제대로 세지 않으면 pointRates 안쪽 키가 엉뚱하게
// rewardSavings 의 자식으로 잡힌다.
function settingsKeyPaths(source) {
  const declStart = source.indexOf('const DEFAULT_APP_SETTINGS = {');
  if (declStart < 0) return [];
  const open = source.indexOf('{', declStart);
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }

  const paths = [];
  const stack = [];
  let level = 0;
  for (const rawLine of source.slice(open + 1, end).split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const key = line.match(/^([A-Za-z_$][\w$]*)\s*:/)?.[1];
    const opens = (line.match(/[{[]/g) || []).length;
    const closes = (line.match(/[}\]]/g) || []).length;

    if (key && level <= 1) paths.push(level === 0 ? key : `${stack[0]}.${key}`);
    if (opens > closes) {
      if (key) stack[level] = key;
      level += 1;
    } else if (closes > opens) {
      level = Math.max(0, level - (closes - opens));
    }
  }
  return [...new Set(paths)];
}

// 이 설정을 읽는 코드가 있는가.
//
// 정적 검사라 완벽할 수 없다. 특히 buildRewardSavingsSummary({ ...rewardSettings })
// 처럼 통째로 넘기는 코드는 부모 이름이 소비 파일에 아예 등장하지 않는다.
// 그래서 '오탐 0'을 우선한다 — 잎 이름이 소비 코드 어디에도 없을 때만 죽은 것으로
// 본다. enabled 같은 흔한 이름은 놓치지만, 이 검사가 틀린 경보를 내기 시작하면
// 아무도 안 믿게 되고 그게 더 비싸다.
function isRead(consumerText, keyPath) {
  const [parent, leaf] = keyPath.split('.');
  if (!leaf) return new RegExp(`\\b${parent}\\b`).test(consumerText);
  if (new RegExp(`\\b${parent}\\s*\\??\\.\\s*${leaf}\\b`).test(consumerText)) return true;
  return new RegExp(`\\b${leaf}\\b`).test(consumerText);
}

export async function checkSettingsFieldsAreRead(files) {
  const source = await fs.readFile(SETTINGS_SOURCE, 'utf8');
  const paths = settingsKeyPaths(source);
  if (!paths.length) {
    fail('wiring: DEFAULT_APP_SETTINGS 리터럴을 찾지 못했습니다 (설정 검사 무력화).');
    return;
  }
  const consumerText = (await Promise.all(
    files.filter(isConsumerFile).map(file => fs.readFile(file, 'utf8')),
  )).join('\n');

  const dead = paths.filter(keyPath => !isRead(consumerText, keyPath));
  for (const keyPath of dead) {
    fail(`wiring: 설정 ${keyPath} 을(를) 읽는 코드가 없습니다 — 저장돼도 아무것도 바뀌지 않습니다. 쓰거나 지우세요.`);
  }
}

// ── CSS 변수: 쓰이는데 정의된 적 없는 것 ──────────────────────────
// var(--surface-2) 가 그랬다. 값이 통째로 무효가 되면서 배경이 사라졌는데,
// 다크에서는 티가 안 나 오래 남아 있었다.
const CSS_VARS_SET_IN_JS = new Set([
  '--kpi-tint',   // .hd-kpi 가 클래스로 지정
]);

export async function checkCssCustomProperties(files) {
  const cssFiles = files.filter(file => /\.css$/.test(rel(file)) && !rel(file).startsWith('_site/'));
  const defined = new Set(CSS_VARS_SET_IN_JS);
  const used = new Map();

  for (const file of cssFiles) {
    const text = await fs.readFile(file, 'utf8');
    for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(match[1]);
    // var(--x, 기본값) 은 정의가 없어도 기본값으로 동작한다 — 방어적 패턴이라 통과시킨다.
    // 폴백이 없는 var(--x) 만 문제다: 정의가 없으면 그 선언 전체가 무효가 된다.
    for (const match of text.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
      if (match[2] === ',') continue;
      if (!used.has(match[1])) used.set(match[1], rel(file));
    }
  }
  // JS 가 setProperty 로 넣는 변수도 정의로 인정한다
  for (const file of files.filter(file => /\.(js|mjs)$/.test(rel(file)) && !rel(file).startsWith('_site/'))) {
    const text = await fs.readFile(file, 'utf8');
    for (const match of text.matchAll(/setProperty\(\s*['"](--[\w-]+)/g)) defined.add(match[1]);
    for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(match[1]);
  }

  for (const [name, where] of used) {
    if (!defined.has(name)) {
      fail(`wiring: CSS 변수 ${name} 이(가) ${where} 에서 쓰이는데 정의된 곳이 없습니다 — 그 선언 전체가 무효가 됩니다.`);
    }
  }
}

// ── 셸 폭은 단일 출처 ─────────────────────────────────────────────
// #app / .bottom-nav 의 max-width 를 네 파일이 각자 선언해, 마지막에 import 되는
// 탭 스타일시트가 이기면서 데스크톱에서도 430px 로 고정돼 있었다.
export async function checkShellWidthSingleSource(files) {
  const cssFiles = files.filter(file => /\.css$/.test(rel(file)) && !rel(file).startsWith('_site/'));
  for (const file of cssFiles) {
    const text = await fs.readFile(file, 'utf8');
    for (const match of text.matchAll(/(#app|\.bottom-nav)\s*\{([^}]*)\}/g)) {
      const [, selector, block] = match;
      const width = block.match(/max-width\s*:\s*([^;]+);/)?.[1]?.trim();
      if (width && !width.includes('var(--shell-max)')) {
        fail(`wiring: ${rel(file)} 의 ${selector} 가 max-width 를 직접 정합니다(${width}). 셸 폭은 var(--shell-max) 하나로만 정하세요.`);
      }
    }
  }
}

export async function checkWiring() {
  const files = await walk(root);
  await checkSettingsFieldsAreRead(files);
  await checkCssCustomProperties(files);
  await checkShellWidthSingleSource(files);
}
