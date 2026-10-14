import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Lenovo\\AppData\\Local\\Temp\\edge-primitives-spike';
const port = 4174;

// 1. Start HTTP server
const server = http.createServer((req, res) => {
  const page = fs.readFileSync(path.join(dir, 'primitives-real.html'));
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(page);
});

await new Promise((r) => server.listen(port, '127.0.0.1', r));
console.log(`Server listening on http://127.0.0.1:${port}`);

// 2. Launch headless Edge with remote debugging
const edge = spawn(edgePath, [
  '--headless=new',
  '--remote-debugging-port=9223',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank',
]);

try {
  let version = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await fetch('http://127.0.0.1:9223/json/version');
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch {}
  }
  if (!version) throw new Error('Could not connect to Edge CDP on port 9223');
  console.log('Connected to Edge:', version.Browser);

  // Open target page
  const newTabRes = await fetch(
    `http://127.0.0.1:9223/json/new?http://127.0.0.1:${port}/primitives-real.html`,
    { method: 'PUT' }
  );
  const tab = await newTabRes.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);

  let id = 1;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = id++;
      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === msgId) {
          ws.removeEventListener('message', handler);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await new Promise((r) => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await send('Page.enable');

  // Wait for window.__TEST_RESULTS__
  let testResults = null;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'window.__TEST_RESULTS__ ? JSON.stringify(window.__TEST_RESULTS__) : null',
    });
    if (evalRes.result.value) {
      testResults = JSON.parse(evalRes.result.value);
      break;
    }
  }

  if (!testResults) throw new Error('Test results not found on window.__TEST_RESULTS__');

  console.log('\n=== REAL BROWSER PRIMITIVES VERIFICATION RESULTS ===');
  for (const r of testResults.results) {
    console.log(`${r.pass ? '✓ PASS' : '✗ FAIL'}: ${r.name} (${r.details})`);
  }

  if (!testResults.allPass) {
    throw new Error('One or more real browser interaction tests failed');
  }

  console.log('\nAll real browser interaction accessibility checks passed successfully!');
  ws.close();
} finally {
  edge.kill();
  server.close();
}
