import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const failures = [];

export function fail(message) {
  failures.push(message);
}

export function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

export async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const skipDirs = new Set([
  '.git',
  '.vercel',
  '.claude',
  '.android-build',
  '.omo',
  '_site',
  'node_modules',
  'secrets',
  'docx_render_check',
  'memory',
  '%SystemDrive%',
]);

export async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

export function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function stripUrlSuffix(specifier) {
  return specifier.split(/[?#]/)[0];
}

export function isLocalSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

export function shouldSkipApkArtifactChecks() {
  return process.env.BUDGET_VERIFY_SKIP_APK_ARTIFACT === '1';
}
