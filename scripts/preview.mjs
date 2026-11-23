import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { onRequest } from '../functions/api/proxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../dist');

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) =>
  nativeFetch(
    url,
    init.body instanceof ReadableStream
      ? { ...init, body: await new Response(init.body).arrayBuffer() }
      : init
  );

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

// ハッシュ付きカタログ・フォント・履歴画面を、実際に配るビルドで確認します。
await fs.access(path.join(root, 'index.html'));

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://' + req.headers.host);

    // 1. API proxy route
    if (u.pathname === '/api/proxy') {
      const h = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) h.set(k, Array.isArray(v) ? v.join(', ') : v);
      }
      const request = new Request(u, {
        method: req.method,
        headers: h,
        ...(req.method === 'POST' ? { body: Readable.toWeb(req), duplex: 'half' } : {})
      });
      const result = await onRequest({ request });
      res.writeHead(result.status, Object.fromEntries(result.headers));
      if (result.body) Readable.fromWeb(result.body).pipe(res);
      else res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }

    // 静的詳細ページの末尾スラッシュも、Pages と同じように index.html を返します。
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    let localFile = path.resolve(root, rel);
    if (localFile !== root && !localFile.startsWith(root + '/')) {
      res.writeHead(404).end();
      return;
    }
    const stat = await fs.stat(localFile).catch(() => null);
    if (stat?.isDirectory()) localFile = path.join(localFile, 'index.html');
    const data = await fs.readFile(localFile).catch(() => null);
    if (!data) {
      // Pages と同じ 404 画面を返すので、テーマやホームに戻るリンクも確認できます。
      res.writeHead(404, { 'content-type': mime['.html'] });
      res.end(req.method === 'HEAD' ? undefined : await fs.readFile(path.join(root, '404.html')));
      return;
    }
    res.writeHead(200, {
      'content-type': mime[path.extname(localFile)] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain' }).end('Local preview error: ' + e.message);
  }
});

// LAN で確認するときだけ、Mac のアドレスを明示して待ち受けます。
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8787);
server.listen(port, host, () => {
  console.log(`PoseWear preview running at http://${host}:${port}/`);
});
