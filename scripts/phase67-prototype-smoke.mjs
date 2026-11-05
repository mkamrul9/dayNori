#!/usr/bin/env node
/**
 * Phase 67 interactive smoke via Chrome CDP — synthetic prototype only.
 * Verifies Escape/create focus, hide Journal → 3 tabs, drafts, search empty, tour exit.
 * Exit 1 on assertion failure or missing browser (unless --allow-skip).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const protoDir = path.join(root, 'docs', 'design', 'v2', 'phase67');
const allowSkip = process.argv.includes('--allow-skip');
const outPath = path.join(root, 'artifacts', 'local', 'phase67', 'smoke-results.json');

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

function serve(dir, port) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  };
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath === '/' ? 'prototype.html' : urlPath.replace(/^\/+/, '');
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir + path.sep) && file !== dir) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function cdp(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = Math.floor(Math.random() * 1e9);
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error(`CDP timeout ${method}`));
    }, 30_000);
    ws.onopen = () => ws.send(JSON.stringify({ id, method, params }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id === id) {
        clearTimeout(timer);
        ws.close();
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('WebSocket error'));
    };
  });
}

async function evalJson(pageWs, expression) {
  const { result } = await cdp(pageWs, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.subtype === 'error') throw new Error(result.description || 'eval error');
  return result.value;
}

let browserProc = null;
let server = null;

async function cleanup() {
  if (browserProc && !browserProc.killed) {
    try {
      browserProc.kill();
    } catch {
      /* ignore */
    }
  }
  if (server) await new Promise((r) => server.close(() => r()));
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    const payload = {
      status: allowSkip ? 'skipped' : 'fail',
      reason: 'No Chrome/Edge',
      unmetEvidence: true,
    };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
    console.error(payload.status, payload.reason);
    process.exit(allowSkip ? 0 : 1);
  }

  const httpPort = await getFreePort();
  const cdpPort = await getFreePort();
  server = await serve(protoDir, httpPort);
  const profile = path.join(root, 'artifacts', 'local', 'phase67', 'smoke-profile');
  fs.mkdirSync(profile, { recursive: true });
  browserProc = spawn(
    chrome,
    [
      `--remote-debugging-port=${cdpPort}`,
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  await sleep(1500);
  const version = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((r) => r.json());
  let targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
  let page = targets.find((t) => t.type === 'page');
  if (!page) {
    await cdp(version.webSocketDebuggerUrl, 'Target.createTarget', { url: 'about:blank' });
    await sleep(400);
    targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
    page = targets.find((t) => t.type === 'page');
  }
  const pageWs = page.webSocketDebuggerUrl;
  const results = [];

  function assert(name, cond, detail) {
    results.push({ name, ok: !!cond, detail: detail || null });
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  }

  try {
    await cdp(pageWs, 'Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 740,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await cdp(pageWs, 'Page.navigate', { url: `http://127.0.0.1:${httpPort}/prototype.html` });
    await sleep(700);

    assert('bridge', await evalJson(pageWs, `!!window.__dn67`), 'window.__dn67');

    await evalJson(pageWs, `window.__dn67.go('today')`);
    await sleep(150);
    await evalJson(pageWs, `window.__dn67.go('create')`);
    await sleep(150);
    let route = await evalJson(pageWs, `window.__dn67.getState().route`);
    assert('create-open', route === 'create', route);
    await cdp(pageWs, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp(pageWs, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(200);
    route = await evalJson(pageWs, `window.__dn67.getState().route`);
    assert('escape-closes-create', route !== 'create', route);

    await evalJson(pageWs, `window.__dn67.go('features')`);
    await sleep(100);
    await evalJson(
      pageWs,
      `document.querySelector('[data-hide="journal"]')?.click(); true`
    );
    await sleep(150);
    const tabs = await evalJson(
      pageWs,
      `document.querySelectorAll('.bottom-nav .tab').length`
    );
    const hidden = await evalJson(pageWs, `window.__dn67.getState().journalHidden`);
    assert('hide-journal-three-tabs', hidden === true && tabs === 3, `tabs=${tabs} hidden=${hidden}`);

    await evalJson(pageWs, `window.__dn67.go('journal')`);
    await sleep(100);
    route = await evalJson(pageWs, `window.__dn67.getState().route`);
    assert('hidden-journal-redirect', route === 'features', route);

    await evalJson(
      pageWs,
      `document.querySelector('[data-restore="journal"]')?.click(); true`
    );
    await sleep(100);

    await evalJson(pageWs, `window.__dn67.go('note-editor')`);
    await sleep(100);
    await evalJson(
      pageWs,
      `(() => { const t=document.getElementById('note-title'); const b=document.getElementById('note-body'); t.value='Draft title keep'; b.value='Body keep me'; document.querySelector('[data-demo="save-note-fail"]').click(); return true; })()`
    );
    await sleep(150);
    const draft = await evalJson(pageWs, `window.__dn67.getState().draftNoteTitle`);
    assert('note-draft-after-fail', draft === 'Draft title keep', draft);

    await evalJson(pageWs, `window.__dn67.go('search')`);
    await sleep(100);
    await evalJson(
      pageWs,
      `(() => { const sq=document.getElementById('sq'); sq.value='zzznomatch999'; sq.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`
    );
    await sleep(150);
    const empty = await evalJson(
      pageWs,
      `!!document.querySelector('.empty')`
    );
    assert('search-no-results', empty === true, String(empty));

    await evalJson(pageWs, `window.__dn67.go('help')`);
    await sleep(100);
    await evalJson(pageWs, `document.querySelector('[data-tour="pause"]')?.click(); true`);
    await sleep(80);
    const paused = await evalJson(pageWs, `window.__dn67.getState().tourPaused`);
    assert('tour-pause', paused === true, String(paused));
    await evalJson(pageWs, `document.querySelector('[data-tour="exit"]')?.click(); true`);
    await sleep(80);
    const step = await evalJson(pageWs, `window.__dn67.getState().tourStep`);
    const paused2 = await evalJson(pageWs, `window.__dn67.getState().tourPaused`);
    assert('tour-exit', step === 0 && paused2 === false, `step=${step} paused=${paused2}`);

    await evalJson(pageWs, `window.__dn67.go('assistant')`);
    await sleep(80);
    await evalJson(pageWs, `document.querySelector('[data-demo="assistant-consent"]')?.click(); true`);
    await sleep(80);
    await evalJson(pageWs, `document.querySelector('[data-demo="assistant-propose"]')?.click(); true`);
    await sleep(80);
    await evalJson(
      pageWs,
      `(() => { const i=document.getElementById('prop-title'); i.value='Edited proposal'; document.querySelector('[data-demo="assistant-cancel"]').click(); return true; })()`
    );
    await sleep(80);
    const prop = await evalJson(pageWs, `window.__dn67.getState().assistantProposal`);
    assert('assistant-cancel', prop === null, String(prop));

    const unlabeled = await evalJson(
      pageWs,
      `(() => {
        const bad = [];
        for (const el of document.querySelectorAll('button, a, [role="button"]')) {
          const name = el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '';
          if (!String(name).trim()) bad.push(el.outerHTML.slice(0, 80));
        }
        return bad.slice(0, 8);
      })()`
    );
    assert('controls-have-names', unlabeled.length === 0, JSON.stringify(unlabeled));
  } finally {
    await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  const payload = {
    status: failed.length ? 'fail' : 'pass',
    capturedAt: new Date().toISOString(),
    browser: chrome,
    results,
    failures: failed,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ status: payload.status, pass: results.length - failed.length, fail: failed.length }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup();
  process.exit(allowSkip ? 0 : 1);
});
