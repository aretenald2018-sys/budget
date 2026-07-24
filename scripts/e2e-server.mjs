// ================================================================
// scripts/e2e-server.mjs — Playwright webServer용 정적 파일 서버
// python 의존을 피하기 위한 node(http) 기반 저장소 루트 서버.
// 번들러가 없는 바닐라 ESM 앱이라 소스 파일을 그대로 서빙한다.
// ================================================================
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.E2E_PORT) || 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // 백엔드 없는 정적 검수: 같은 오리진 /api/* 는 빈 JSON 으로 즉시 응답해
    // (예: 백그라운드 동기화의 /api/sync-latest) 404 콘솔 error 를 없앤다.
    if (pathname.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('{}');
      return;
    }

    const normalized = path.normalize(pathname);
    // 루트에서 못 찾으면 public/ 로 폴백 — pages 빌드가 public/android-apk.svg 와
    // public/downloads 를 산출물 루트로 복사하는 것을 검수 서버에서도 미러링.
    const candidates = [path.join(root, normalized), path.join(root, 'public', normalized)];
    let target = null;
    for (const candidate of candidates) {
      if (!candidate.startsWith(root)) continue;
      const info = await stat(candidate).catch(() => null);
      if (info?.isFile()) { target = candidate; break; }
    }
    if (!target) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(target).pipe(res);
  } catch (err) {
    res.writeHead(500).end(String(err?.message || err));
  }
});

server.listen(port, () => {
  console.log(`[e2e-server] serving ${root} at http://localhost:${port}`);
});
