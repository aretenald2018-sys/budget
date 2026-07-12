import fs from 'node:fs/promises';

export async function loadFixture(relativeUrl, importMetaUrl) {
  const url = new URL(`./fixtures/${relativeUrl}`, importMetaUrl);
  return JSON.parse(await fs.readFile(url, 'utf8'));
}
