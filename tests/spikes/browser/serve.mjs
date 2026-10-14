import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves only the experiment page on localhost (a secure context) for manual browser runs.
const dir = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(dir, 'indexeddb-real.html'));
const port = Number(process.env.PORT ?? 4173);
http
  .createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(page);
  })
  .listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/`));
