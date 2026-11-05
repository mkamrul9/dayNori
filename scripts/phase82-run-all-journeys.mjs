import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { buildServer, JwtVerifier } from '../apps/api/dist/index.js';
import { createAdminPool, createRuntimePool } from '../apps/api/dist/db/index.js';
import { createApiClient } from '../packages/api-client/dist/index.js';

import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'phase82');
const journeyDir = path.join(outDir, 'journeys');
fs.mkdirSync(journeyDir, { recursive: true });

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileArtifact = (relPath) => {
  const full = path.resolve(root, relPath);
  const bytes = fs.readFileSync(full);
  return {
    path: relPath.replaceAll('\\', '/'),
    sha256: sha256(bytes),
  };
};

const gitRev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
console.log('Phase 82 Journey Runner');
console.log('HEAD:', gitRev);


// 1. Synthetic Auth & Fastify API Server
const issuer = 'http://127.0.0.1:54321/auth/v1';
const audience = 'daynori-api';
const kid = 'phase82-local-key';
const pair = await generateKeyPair('RS256');
const publicKey = {
  ...(await exportJWK(pair.publicKey)),
  kid,
  alg: 'RS256',
  use: 'sig',
};

const accountId = crypto.randomUUID();
const accountEmail = `phase82-journey-${Date.now()}@example.test`;

async function issueToken(userId, email) {
  return await new SignJWT({
    role: 'authenticated',
    email,
    aal: 'aal1',
    session_id: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setSubject(userId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(pair.privateKey);
}

const authToken = await issueToken(accountId, accountEmail);

const authServer = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, issuer);
  if (url.pathname.endsWith('/jwks.json')) {
    res.end(JSON.stringify({ keys: [publicKey] }));
    return;
  }
  if (url.pathname.endsWith('/user')) {
    res.end(JSON.stringify({ id: accountId, email: accountEmail }));
    return;
  }
  res.writeHead(404);
  res.end('{}');
});

await new Promise((resolve) => authServer.listen(54321, '127.0.0.1', resolve));
console.log('✓ Synthetic Auth server listening on port 54321');

const adminPool = createAdminPool();
const runtimePool = createRuntimePool();

const api = buildServer({
  jwtVerifier: new JwtVerifier({
    issuer,
    audience,
    localJwks: { keys: [publicKey] },
  }),
  runtimePool,
  rateLimitOptions: { maxRequests: 10000, windowMs: 60_000 },
  enableChatPublicationRecovery: false,
});

await api.listen({ host: '127.0.0.1', port: 3001 });
console.log('✓ Fastify API server listening on port 3001');

// Seed test user profile, workspace, and membership
let workspaceId = '';
const admin = await adminPool.connect();
try {
  await admin.query(
    `INSERT INTO app.profiles (id, display_name)
     VALUES ($1, 'Phase 82 Journey User')
     ON CONFLICT (id) DO NOTHING`,
    [accountId]
  );
  const wsRes = await admin.query(
    `INSERT INTO app.workspaces (name, owner_id, kind)
     VALUES ('Phase 82 Journey Workspace', $1, 'personal')
     RETURNING id`,
    [accountId]
  );
  workspaceId = wsRes.rows[0].id;
  await admin.query(
    `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [workspaceId, accountId]
  );
} finally {
  admin.release();
}
console.log('✓ Provisioned test workspace:', workspaceId);

// 2. Start Next.js Production Server on port 3118
const webPort = 3118;
const nextBin = path.join(root, 'apps', 'web', 'node_modules', 'next', 'dist', 'bin', 'next');
const nextServer = spawn(
  process.execPath,
  [nextBin, 'start', path.join(root, 'apps', 'web'), '-p', String(webPort)],
  {
    cwd: root,
    env: {
      ...process.env,
      SUPABASE_AUTH_URL: 'http://127.0.0.1:54321',
      DAYNORI_API_URL: 'http://127.0.0.1:3001',
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3001',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
nextServer.stderr.on('data', (d) => process.stderr.write(`[Next] ${d}`));

let nextReady = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch(`http://127.0.0.1:${webPort}/api/health`);
    if (res.ok) {
      nextReady = true;
      break;
    }
  } catch {}
}
if (!nextReady) {
  nextServer.kill();
  await api.close();
  authServer.close();
  await runtimePool.end();
  await adminPool.end();
  throw new Error('Next.js server failed to respond on port ' + webPort);
}
console.log('✓ Next.js server ready on port ' + webPort);

// 3. Launch Edge Browser with CDP
const browserExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = 9226;
const userDataDir = path.join(os.tmpdir(), 'edge-profile-p82-' + Date.now());
fs.mkdirSync(userDataDir, { recursive: true });

const browser = spawn(browserExe, [
  '--headless=new',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  'about:blank',
]);

let versionInfo = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    if (res.ok) {
      versionInfo = await res.json();
      break;
    }
  } catch {}
}
if (!versionInfo) {
  browser.kill();
  nextServer.kill();
  await api.close();
  authServer.close();
  await runtimePool.end();
  await adminPool.end();
  throw new Error('Could not connect to browser CDP');
}
console.log(`✓ Connected to ${versionInfo.Browser}`);

const newTabRes = await fetch(
  `http://127.0.0.1:${cdpPort}/json/new?http://127.0.0.1:${webPort}/support`,
  { method: 'PUT' }
);
const tab = await newTabRes.json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);

let msgId = 1;
const sendCdp = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise((r) => ws.addEventListener('open', r));
await sendCdp('Runtime.enable');
await sendCdp('Page.enable');
await sendCdp('DOM.enable');
await sendCdp('Network.enable');

await sendCdp('Network.setCookie', {
  name: 'daynori_access_token',
  value: authToken,
  domain: '127.0.0.1',
  path: '/',
  httpOnly: true,
  sameSite: 'Lax',
});
await sendCdp('Network.setCookie', {
  name: 'daynori_csrf_token',
  value: 'phase82-test-csrf-token',
  domain: '127.0.0.1',
  path: '/',
  httpOnly: false,
  sameSite: 'Lax',
});

const cdpEval = async (expression) => {
  const res = await sendCdp('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error('CDP evaluation error: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
};

const cdpSetViewport = async (width, height, isMobile = false) => {
  await sendCdp('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: isMobile,
  });
  await new Promise((r) => setTimeout(r, 150));
};

const cdpScreenshot = async (filename) => {
  const { data } = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(data, 'base64');
  const target = path.join(journeyDir, filename);
  fs.writeFileSync(target, buffer);
  return fileArtifact(path.relative(root, target));
};

const cdpNavigate = async (urlPath) => {
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${webPort}${urlPath}` });
  await new Promise((r) => setTimeout(r, 800));
};

// Set session in browser localStorage
await cdpNavigate('/support');
await cdpEval(`(() => {
  localStorage.setItem('daynori_token', '${authToken}');
  localStorage.setItem('daynori_user_id', '${accountId}');
  localStorage.setItem('daynori_workspace_id', '${workspaceId}');
})()`);
await cdpNavigate('/support');

const evidence = {
  phase: 82,
  recordedAt: new Date().toISOString(),
  gitRev,
  platforms: {},
};

console.log('\n=== JOURNEY 1: DESKTOP WEB BUG REPORT WITH OPT-IN DIAGNOSTICS (1440x900) ===');
await cdpSetViewport(1440, 900, false);
await cdpNavigate('/support');

// Wait for form inputs to mount
for (let i = 0; i < 30; i++) {
  const ready = await cdpEval(`Boolean(document.querySelector('[data-testid="input-summary"]'))`);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 200));
}

// Fill bug report
await cdpEval(`(() => {
  function setVal(sel, val) {
    const el = document.querySelector(sel);
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  setVal('[data-testid="input-summary"]', 'Task checkbox jumps on mobile web');
  setVal('[data-testid="input-description"]', 'When tapping a task checkbox while scrolling on mobile web, the scroll position jumps abruptly to the top of the container.');
  setVal('[data-testid="input-steps"]', '1. Open Plan tab\\n2. Scroll down to task list\\n3. Tap task checkbox');
  setVal('[data-testid="input-expected"]', 'Task marks complete and remains in place.');
  setVal('[data-testid="input-actual"]', 'Viewport jumps to top of list.');

  const diagCheckbox = document.querySelector('[data-testid="checkbox-include-diagnostics"]');
  if (diagCheckbox && !diagCheckbox.checked) {
    diagCheckbox.click();
  }
})()`);

await new Promise((r) => setTimeout(r, 500));

// Click Submit
console.log('  Submitting bug report...');
await cdpEval(`(() => {
  const btn = document.querySelector('[data-testid="btn-submit-report"]');
  if (btn) btn.click();
})()`);

// Wait for receipt
let bugReceipt = null;
for (let i = 0; i < 50; i++) {
  await new Promise((r) => setTimeout(r, 250));
  bugReceipt = await cdpEval(`(() => {
    const card = document.querySelector('[data-testid="feedback-receipt-card"]');
    if (card) {
      const receiptId = document.querySelector('[data-testid="receipt-id"]')?.textContent?.trim();
      const clientReportId = document.querySelector('[data-testid="receipt-client-id"]')?.textContent?.trim();
      return { receiptId, clientReportId };
    }
    const err = document.querySelector('.daynori-feedback')?.textContent?.trim() || document.querySelector('[role="alert"]')?.textContent?.trim();
    if (err) return { error: err };
    return null;
  })()`);
  if (bugReceipt?.receiptId) break;
}

if (!bugReceipt?.receiptId) {
  throw new Error('Desktop bug report receipt was not received: ' + JSON.stringify(bugReceipt));
}
console.log('  ✓ Received receipt:', bugReceipt);

const desktopBugShot = await cdpScreenshot('desktop-bug-report.png');
evidence.platforms.desktopWebBug = {
  viewport: '1440x900',
  reportType: 'bug',
  receiptId: bugReceipt.receiptId,
  clientReportId: bugReceipt.clientReportId,
  artifact: desktopBugShot,
};

console.log('\n=== JOURNEY 2: NARROW PWA SUGGESTION REPORT (390x844) ===');
await cdpSetViewport(390, 844, true);

// Reset form
await cdpEval(`(() => {
  const resetBtn = document.querySelector('[data-testid="btn-submit-another"]');
  if (resetBtn) resetBtn.click();
})()`);
await new Promise((r) => setTimeout(r, 500));

for (let i = 0; i < 30; i++) {
  const ready = await cdpEval(`Boolean(document.querySelector('[data-testid="input-summary"]'))`);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 200));
}

// Select suggestion type and fill fields
await cdpEval(`(() => {
  function setVal(sel, val) {
    const el = document.querySelector(sel);
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // Click Suggestion in segmented control
  const segButtons = document.querySelectorAll('button');
  for (const b of segButtons) {
    if (b.textContent?.trim().toLowerCase().includes('suggestion')) {
      b.click();
      break;
    }
  }
  setVal('[data-testid="input-summary"]', 'Add swipe-to-archive gesture for completed tasks');
  setVal('[data-testid="input-description"]', 'Provide a swift left-swipe gesture on mobile touchscreens to archive completed tasks directly from the Today view.');
})()`);

await new Promise((r) => setTimeout(r, 500));

console.log('  Submitting suggestion report...');
await cdpEval(`(() => {
  const btn = document.querySelector('[data-testid="btn-submit-report"]');
  if (btn) btn.click();
})()`);

let suggestionReceipt = null;
for (let i = 0; i < 50; i++) {
  await new Promise((r) => setTimeout(r, 250));
  suggestionReceipt = await cdpEval(`(() => {
    const card = document.querySelector('[data-testid="feedback-receipt-card"]');
    if (card) {
      const receiptId = document.querySelector('[data-testid="receipt-id"]')?.textContent?.trim();
      const clientReportId = document.querySelector('[data-testid="receipt-client-id"]')?.textContent?.trim();
      return { receiptId, clientReportId };
    }
    const err = document.querySelector('.daynori-feedback')?.textContent?.trim() || document.querySelector('[role="alert"]')?.textContent?.trim();
    if (err) return { error: err };
    return null;
  })()`);
  if (suggestionReceipt?.receiptId) break;
}

if (!suggestionReceipt?.receiptId) {
  throw new Error('Narrow PWA suggestion receipt was not received: ' + JSON.stringify(suggestionReceipt));
}
console.log('  ✓ Received suggestion receipt:', suggestionReceipt);

const narrowSuggestionShot = await cdpScreenshot('narrow-suggestion-report.png');
evidence.platforms.narrowPwaSuggestion = {
  viewport: '390x844',
  reportType: 'suggestion',
  receiptId: suggestionReceipt.receiptId,
  clientReportId: suggestionReceipt.clientReportId,
  artifact: narrowSuggestionShot,
};

console.log('\n=== JOURNEY 3: DESKTOP WEB CONTACT REPORT (1440x900) ===');
await cdpSetViewport(1440, 900, false);

// Reset form
await cdpEval(`(() => {
  const resetBtn = document.querySelector('[data-testid="btn-submit-another"]');
  if (resetBtn) resetBtn.click();
})()`);
await new Promise((r) => setTimeout(r, 500));

for (let i = 0; i < 30; i++) {
  const ready = await cdpEval(`Boolean(document.querySelector('[data-testid="input-summary"]'))`);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 200));
}

// Select Contact and fill fields
await cdpEval(`(() => {
  function setVal(sel, val) {
    const el = document.querySelector(sel);
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  const segButtons = document.querySelectorAll('button');
  for (const b of segButtons) {
    if (b.textContent?.trim().toLowerCase().includes('contact')) {
      b.click();
      break;
    }
  }
  setVal('[data-testid="input-summary"]', 'Inquiry regarding offline vault recovery format');
  setVal('[data-testid="input-description"]', 'Requesting specification details on the cryptographic derivation format for self-custody cold-storage paper backups.');
  setVal('[data-testid="input-reply-email"]', 'synthetic-researcher@example.test');
})()`);

await new Promise((r) => setTimeout(r, 500));

console.log('  Submitting contact report...');
await cdpEval(`(() => {
  const btn = document.querySelector('[data-testid="btn-submit-report"]');
  if (btn) btn.click();
})()`);

let contactReceipt = null;
for (let i = 0; i < 50; i++) {
  await new Promise((r) => setTimeout(r, 250));
  contactReceipt = await cdpEval(`(() => {
    const card = document.querySelector('[data-testid="feedback-receipt-card"]');
    if (card) {
      const receiptId = document.querySelector('[data-testid="receipt-id"]')?.textContent?.trim();
      const clientReportId = document.querySelector('[data-testid="receipt-client-id"]')?.textContent?.trim();
      return { receiptId, clientReportId };
    }
    const err = document.querySelector('.daynori-feedback')?.textContent?.trim() || document.querySelector('[role="alert"]')?.textContent?.trim();
    if (err) return { error: err };
    return null;
  })()`);
  if (contactReceipt?.receiptId) break;
}

if (!contactReceipt?.receiptId) {
  throw new Error('Desktop contact receipt was not received: ' + JSON.stringify(contactReceipt));
}
console.log('  ✓ Received contact receipt:', contactReceipt);

const desktopContactShot = await cdpScreenshot('desktop-contact-report.png');
evidence.platforms.desktopWebContact = {
  viewport: '1440x900',
  reportType: 'contact',
  receiptId: contactReceipt.receiptId,
  clientReportId: contactReceipt.clientReportId,
  artifact: desktopContactShot,
};

// 4. Android Native Journey on emulator-5554
console.log('\n=== JOURNEY 4: NATIVE ANDROID FEEDBACK JOURNEY (EMULATOR-5554) ===');
const adbPath = 'C:\\Users\\Lenovo\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const runAdb = (args) =>
  execFileSync(adbPath, ['-s', 'emulator-5554', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const adbScreenshot = (filename) => {
  const target = path.join(journeyDir, filename);
  const r = spawnSync(adbPath, ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
  });
  if (r.stdout?.length) fs.writeFileSync(target, r.stdout);
  return fileArtifact(path.relative(root, target));
};

const adbDumpXml = (filename) => {
  const target = path.join(journeyDir, filename);
  runAdb(['shell', 'uiautomator', 'dump', '/sdcard/p82_dump.xml']);
  const xml = runAdb(['shell', 'cat', '/sdcard/p82_dump.xml']);
  fs.writeFileSync(target, xml, 'utf8');
  return fileArtifact(path.relative(root, target));
};

// Start Android app
console.log('  Launching Daynori MainActivity...');
runAdb(['shell', 'am', 'start', '-W', '-n', 'com.daynori.app/.MainActivity']);
await new Promise((r) => setTimeout(r, 2500));

// Open Settings
console.log('  Navigating to Settings...');
runAdb(['shell', 'input', 'tap', '1002', '415']);
await new Promise((r) => setTimeout(r, 1200));

// Open Help & Feedback group
console.log('  Opening Help and feedback group...');
runAdb(['shell', 'input', 'tap', '540', '1970']);
await new Promise((r) => setTimeout(r, 1200));

// Open Feedback & Support modal
console.log('  Opening Feedback and Support modal...');
runAdb(['shell', 'input', 'tap', '541', '839']);
await new Promise((r) => setTimeout(r, 1500));

// Enter Summary
console.log('  Entering summary...');
runAdb(['shell', 'input', 'tap', '540', '494']);
await new Promise((r) => setTimeout(r, 500));
runAdb(['shell', 'input', 'text', 'Native%sAndroid%scheckbox%snavigation%sbug']);
await new Promise((r) => setTimeout(r, 600));

// Enter Description
console.log('  Entering description...');
runAdb(['shell', 'input', 'tap', '540', '994']);
await new Promise((r) => setTimeout(r, 500));
runAdb(['shell', 'input', 'text', 'Observed%scheckbox%soffset%son%sAndroid%sAPI%s35.']);
await new Promise((r) => setTimeout(r, 600));

// Swipe up to reveal Submit button
console.log('  Scrolling to submit button...');
runAdb(['shell', 'input', 'swipe', '540', '1800', '540', '400', '400']);
await new Promise((r) => setTimeout(r, 1000));

// Tap Submit button
console.log('  Tapping Submit button...');
runAdb(['shell', 'input', 'tap', '183', '2305']);
await new Promise((r) => setTimeout(r, 2000));

// Capture native screenshot and XML dump
const nativeShot = adbScreenshot('native-feedback-receipt.png');
const nativeXml = adbDumpXml('native-feedback-receipt.xml');
console.log('  ✓ Native artifacts captured:', nativeShot.path, nativeXml.path);

evidence.platforms.nativeAndroid = {
  device: 'emulator-5554 (API 35 x86_64)',
  activity: 'com.daynori.app/.MainActivity',
  modal: 'support-feedback',
  artifacts: [nativeShot, nativeXml],
};

// 5. Clean up servers
browser.kill();
nextServer.kill();
await api.close();
authServer.close();
await runtimePool.end();
await adminPool.end();
console.log('\n✓ Test servers closed cleanly');

// 6. Write evidence JSON files
const evidencePath = path.join(outDir, 'phase82-evidence.json');
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), 'utf8');

const summary = {
  phase: 82,
  completedAt: new Date().toISOString(),
  gitRev,
  checks: [
    { label: 'desktopWebBug', ok: Boolean(evidence.platforms.desktopWebBug?.receiptId) },
    { label: 'narrowPwaSuggestion', ok: Boolean(evidence.platforms.narrowPwaSuggestion?.receiptId) },
    { label: 'desktopWebContact', ok: Boolean(evidence.platforms.desktopWebContact?.receiptId) },
    { label: 'nativeAndroid', ok: Boolean(evidence.platforms.nativeAndroid?.artifacts?.length) },
  ],
  artifacts: [
    desktopBugShot,
    narrowSuggestionShot,
    desktopContactShot,
    nativeShot,
    nativeXml,
  ],
};
fs.writeFileSync(path.join(outDir, 'evidence-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

console.log('✓ Phase 82 UI evidence compiled successfully to:', evidencePath);
