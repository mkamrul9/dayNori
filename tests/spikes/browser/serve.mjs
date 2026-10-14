import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 4173);

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let file = 'indexeddb-real.html';
    if (url.pathname === '/primitives' || url.pathname === '/primitives-real.html') {
      file = 'primitives-real.html';
    } else if (url.pathname.endsWith('.html')) {
      const candidate = path.basename(url.pathname);
      if (fs.existsSync(path.join(dir, candidate))) file = candidate;
    }
    const content = fs.readFileSync(path.join(dir, file));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(content);
  })
  .listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
