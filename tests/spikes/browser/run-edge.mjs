import { spawn } from 'node:child_process';
import http from 'node:http';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const userDataDir = 'C:\\Users\\Lenovo\\AppData\\Local\\Temp\\edge-idb-spike';

// Test function to run CDP commands
async function runSpike() {
  const edge = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ]);

  try {
    // Wait for CDP endpoint
    let version = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const res = await fetch('http://127.0.0.1:9222/json/version');
        if (res.ok) {
          version = await res.json();
          break;
        }
      } catch {}
    }
    if (!version) throw new Error('Could not connect to Edge CDP');
    console.log('Connected to Edge:', version.Browser);

    // Open target page
    const newTabRes = await fetch(
      'http://127.0.0.1:9222/json/new?http://127.0.0.1:4173/?run=write',
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

    // Wait for title done-write
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const evalRes = await send('Runtime.evaluate', { expression: 'document.title' });
      if (evalRes.result.value === 'done-write') break;
    }
    const writeRes = await send('Runtime.evaluate', {
      expression: 'document.getElementById("results").textContent',
    });
    console.log('=== RUN: WRITE ===\n', writeRes.result.value);

    // Navigate to verify (persistence test)
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/?run=verify' });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const evalRes = await send('Runtime.evaluate', { expression: 'document.title' });
      if (evalRes.result.value === 'done-verify') break;
    }
    const verifyRes = await send('Runtime.evaluate', {
      expression: 'document.getElementById("results").textContent',
    });
    console.log('=== RUN: VERIFY ===\n', verifyRes.result.value);

    // Navigate to all (rollback, upgrade, failure test)
    await send('Page.navigate', { url: 'http://127.0.0.1:4173/?run=all' });
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const evalRes = await send('Runtime.evaluate', { expression: 'document.title' });
      if (evalRes.result.value === 'done-all') break;
    }
    const allRes = await send('Runtime.evaluate', {
      expression: 'document.getElementById("results").textContent',
    });
    console.log('=== RUN: ALL ===\n', allRes.result.value);

    ws.close();
  } finally {
    edge.kill();
  }
}

runSpike().catch((e) => {
  console.error(e);
  process.exit(1);
});
