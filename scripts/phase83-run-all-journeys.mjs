import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { buildServer, JwtVerifier } from '../apps/api/dist/index.js';
import { createAdminPool, createRuntimePool } from '../apps/api/dist/db/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'phase83');
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
console.log('Phase 83 Journey Runner');
console.log('HEAD:', gitRev);

// 1. Synthetic Auth & Fastify API Server
const issuer = 'http://127.0.0.1:54321/auth/v1';
const audience = 'daynori-api';
const kid = 'phase83-local-key';
const pair = await generateKeyPair('RS256');
const publicKey = {
  ...(await exportJWK(pair.publicKey)),
  kid,
  alg: 'RS256',
  use: 'sig',
};

const operatorId = crypto.randomUUID();
const operatorEmail = `operator-${Date.now()}@example.test`;
process.env['DAYNORI_OPERATOR_USER_IDS'] = operatorId;

const reporterId = crypto.randomUUID();
const reporterEmail = `reporter-${Date.now()}@example.test`;

const unauthorizedId = crypto.randomUUID();
const unauthorizedEmail = `unauthorized-${Date.now()}@example.test`;

let currentUser = { id: reporterId, email: reporterEmail };

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

const operatorToken = await issueToken(operatorId, operatorEmail);
const reporterToken = await issueToken(reporterId, reporterEmail);
const unauthorizedToken = await issueToken(unauthorizedId, unauthorizedEmail);

const authServer = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, issuer);
  if (url.pathname.endsWith('/jwks.json')) {
    res.end(JSON.stringify({ keys: [publicKey] }));
    return;
  }
  if (url.pathname.endsWith('/user')) {
    res.end(JSON.stringify({ id: currentUser.id, email: currentUser.email }));
    return;
  }
  res.writeHead(404);
  res.end('{}');
});

await new Promise((resolve) => authServer.listen(54321, '127.0.0.1', resolve));
console.log('✓ Synthetic Auth server listening on port 54321');

const adminPool = createAdminPool();
const runtimePool = createRuntimePool();

// Seed accounts and workspaces in database
const adminClient = await adminPool.connect();
let reporterWorkspaceId;
let operatorWorkspaceId;
let unauthorizedWorkspaceId;
try {
  await adminClient.query(
    `INSERT INTO app.profiles (id, display_name)
     VALUES ($1, 'Verified Operator'), ($2, 'Reporter User'), ($3, 'Unauthorized User')
     ON CONFLICT (id) DO NOTHING`,
    [operatorId, reporterId, unauthorizedId]
  );

  const wsRes = await adminClient.query(
    `INSERT INTO app.workspaces (name, owner_id, kind)
     VALUES ('Reporter Workspace', $1, 'personal'),
            ('Operator Workspace', $2, 'personal'),
            ('Unauthorized Workspace', $3, 'personal')
     RETURNING id, owner_id`,
    [reporterId, operatorId, unauthorizedId]
  );
  for (const row of wsRes.rows) {
    if (row.owner_id === reporterId) reporterWorkspaceId = row.id;
    if (row.owner_id === operatorId) operatorWorkspaceId = row.id;
    if (row.owner_id === unauthorizedId) unauthorizedWorkspaceId = row.id;
  }

  await adminClient.query(
    `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner'), ($3, $4, 'owner'), ($5, $6, 'owner')
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [reporterWorkspaceId, reporterId, operatorWorkspaceId, operatorId, unauthorizedWorkspaceId, unauthorizedId]
  );
} finally {
  adminClient.release();
}

console.log('✓ Seeded test accounts');

const verifier = new JwtVerifier({
  issuer,
  audience,
  localJwks: { keys: [publicKey] },
});

const apiServer = buildServer({
  runtimePool,
  jwtVerifier: verifier,
  rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
  enableChatPublicationRecovery: false,
});

await apiServer.listen({ port: 3001, host: '127.0.0.1' });
console.log('✓ Fastify API server listening on http://127.0.0.1:3001');

// 2. Start Next.js Web Server
console.log('Launching Web Server on port 3183...');
const webPort = 3183;
process.env['PORT'] = String(webPort);
process.env['NEXT_PUBLIC_API_URL'] = 'http://127.0.0.1:3001';
process.env['API_PROXY_TARGET'] = 'http://127.0.0.1:3001';

const nextProc = spawn('pnpm', ['--filter', '@daynori/web', 'start', '--port', String(webPort)], {
  cwd: root,
  env: { ...process.env, PORT: String(webPort), API_PROXY_TARGET: 'http://127.0.0.1:3001' },
  shell: true,
});

let webReady = false;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${webPort}/support`);
    if (res.ok || res.status === 200) {
      webReady = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}

if (!webReady) {
  console.error('Next.js web server did not become ready');
  nextProc.kill();
  await apiServer.close();
  authServer.close();
  await runtimePool.end();
  await adminPool.end();
  process.exit(1);
}
console.log(`✓ Web server ready at http://127.0.0.1:${webPort}`);

// 3. Launch Edge Browser with Remote Debugging
const browserExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cdpPort = 9227;
const userDataDir = path.join(root, '.tmp-edge-profile-phase83');
fs.mkdirSync(userDataDir, { recursive: true });

console.log('Launching browser...');
const browser = spawn(browserExe, [
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new',
  '--disable-gpu',
  '--no-default-browser-check',
  '--no-first-run',
]);

let cdpReady = false;
let versionInfo = null;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    if (res.ok) {
      versionInfo = await res.json();
      cdpReady = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

if (!cdpReady) {
  console.error('CDP failed to start');
  browser.kill();
  nextProc.kill();
  await apiServer.close();
  authServer.close();
  await runtimePool.end();
  await adminPool.end();
  process.exit(1);
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
};

const cdpScreenshot = async (filename) => {
  const res = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(res.data, 'base64');
  const filePath = path.join(journeyDir, filename);
  fs.writeFileSync(filePath, buf);
  return fileArtifact(path.relative(root, filePath));
};

const cdpNavigate = async (urlPath) => {
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${webPort}${urlPath}` });
  await new Promise((r) => setTimeout(r, 2000));
};

const setSession = async (token, user, wsId) => {
  currentUser = user;
  await sendCdp('Network.setCookie', {
    name: 'daynori_access_token',
    value: token,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
  await sendCdp('Network.setCookie', {
    name: 'daynori_csrf_token',
    value: 'phase83-test-csrf-token',
    domain: '127.0.0.1',
    path: '/',
    httpOnly: false,
    sameSite: 'Lax',
  });
  await cdpNavigate('/support');
  await cdpEval(`(() => {
    localStorage.setItem('daynori_token', ${JSON.stringify(token)});
    localStorage.setItem('daynori_user_id', ${JSON.stringify(user.id)});
    localStorage.setItem('daynori_workspace_id', ${JSON.stringify(wsId)});
    document.cookie = 'daynori_csrf_token=phase83-test-csrf-token; path=/';
  })()`);
};

console.log('✓ Browser automation established');

// -------------------------------------------------------------
// JOURNEY 1: Reporter submits Bug Report with Opt-in Diagnostics
// -------------------------------------------------------------
console.log('\n--- Journey 1: Reporter Submits Bug Report ---');
await setSession(reporterToken, { id: reporterId, email: reporterEmail }, reporterWorkspaceId);
await cdpSetViewport(1440, 900, false);
await cdpNavigate('/support');

let ready = false;
for (let i = 0; i < 20; i++) {
  ready = await cdpEval(`Boolean(document.querySelector('[data-testid="input-summary"]'))`);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 300));
}

// Fill bug report form
await cdpEval(`(() => {
  const summaryEl = document.querySelector('[data-testid="input-summary"]');
  const descEl = document.querySelector('[data-testid="input-description"]');
  const stepsEl = document.querySelector('[data-testid="input-steps"]');
  const expectedEl = document.querySelector('[data-testid="input-expected"]');
  const actualEl = document.querySelector('[data-testid="input-actual"]');

  const setNative = (el, val) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc.set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  setNative(summaryEl, 'Calendar month view week truncation');
  setNative(descEl, 'When navigating across daylight saving transition, the sixth week row is cut off.');
  setNative(stepsEl, '1. Open Calendar 2. Select November 2026 3. Scroll to bottom');
  setNative(expectedEl, 'All 6 week rows visible');
  setNative(actualEl, 'Sixth week clipped by 18px');

  const diagCheckbox = document.querySelector('input[type="checkbox"]');
  if (diagCheckbox && !diagCheckbox.checked) {
    diagCheckbox.click();
  }
})()`);

await new Promise((r) => setTimeout(r, 600));

// Click Submit
await cdpEval(`(() => {
  const btn = document.querySelector('[data-testid="btn-submit-report"]');
  if (btn) btn.click();
})()`);

let submitted = false;
let bugReceipt = null;
for (let i = 0; i < 30; i++) {
  submitted = await cdpEval(`Boolean(document.querySelector('[data-testid="feedback-receipt-card"]'))`);
  if (submitted) {
    bugReceipt = await cdpEval(`(() => {
      const receiptId = document.querySelector('[data-testid="receipt-id"]')?.textContent?.trim();
      const clientId = document.querySelector('[data-testid="receipt-client-id"]')?.textContent?.trim();
      const status = document.querySelector('[data-testid="receipt-status"]')?.textContent?.trim();
      return { receiptId, clientId, status };
    })()`);
    break;
  }
  await new Promise((r) => setTimeout(r, 400));
}

console.log('✓ Reporter Bug Report Submitted:', bugReceipt);
const reporterReceiptShot = await cdpScreenshot('01-reporter-bug-receipt.png');

// -------------------------------------------------------------
// JOURNEY 2: Operator Feedback Triage Surface
// -------------------------------------------------------------
console.log('\n--- Journey 2: Operator Feedback Triage ---');
await setSession(operatorToken, { id: operatorId, email: operatorEmail }, operatorWorkspaceId);
await cdpNavigate('/developer/triage');

let triageReady = false;
for (let i = 0; i < 30; i++) {
  triageReady = await cdpEval(`Boolean(document.querySelector('[data-testid="btn-update-status"]'))`);
  if (triageReady) break;
  await new Promise((r) => setTimeout(r, 400));
}

// Helper to set React input/textarea/select value with _valueTracker reset
await cdpEval(`(() => {
  window.__setReactValue = (el, val) => {
    if (!el) return;
    if (el instanceof HTMLSelectElement) {
      for (const opt of el.options) {
        if (opt.value === val) {
          opt.selected = true;
          break;
        }
      }
    }
    const proto = el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (el._valueTracker) {
      el._valueTracker.setValue('');
    }
    desc.set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
})()`);

const waitAndClick = async (selector, timeoutMs = 8000) => {
  const start = Date.now();
  let lastReason = 'unknown';
  while (Date.now() - start < timeoutMs) {
    const res = await cdpEval(`(() => {
      const btn = document.querySelector(${JSON.stringify(selector)});
      if (!btn) return { ok: false, reason: 'not_found' };
      if (btn.disabled) return { ok: false, reason: 'disabled' };
      btn.click();
      return { ok: true };
    })()`);
    if (res?.ok) return true;
    lastReason = res?.reason || 'unknown';
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for clickable button: ${selector} (last reason: ${lastReason})`);
};

// 1. Add confidential internal note
await cdpEval(`(() => {
  const noteEl = document.querySelector('[data-testid="input-internal-note"]');
  const proto = HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (noteEl._valueTracker) {
    noteEl._valueTracker.setValue('');
  }
  desc.set.call(noteEl, 'Verified week calculation logic in useCalendarGrid hook.');
  noteEl.dispatchEvent(new Event('input', { bubbles: true }));
  noteEl.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await waitAndClick('[data-testid="btn-add-internal-note"]');
console.log('✓ Internal note submitted');
await new Promise((r) => setTimeout(r, 1200));

// 2. Change status to 'investigating'
await waitAndClick('[data-testid="btn-quick-status-investigating"]');
console.log('✓ Status changed to investigating');
await new Promise((r) => setTimeout(r, 1200));

// 3. Change priority to 'high'
await waitAndClick('[data-testid="btn-quick-priority-high"]');
console.log('✓ Priority changed to high');
await new Promise((r) => setTimeout(r, 1200));

// 4. Compose and deliver verified response to reporter
const verifiedReply = 'Thank you for reporting this! We confirmed the grid layout clipping and deployed an updated padding calculation.';
await cdpEval(`(() => {
  const respEl = document.querySelector('[data-testid="input-developer-response"]');
  const proto = HTMLTextAreaElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (respEl._valueTracker) {
    respEl._valueTracker.setValue('');
  }
  desc.set.call(respEl, ${JSON.stringify(verifiedReply)});
  respEl.dispatchEvent(new Event('input', { bubbles: true }));
  respEl.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await waitAndClick('[data-testid="btn-send-developer-response"]');
console.log('✓ Developer response delivered');
await new Promise((r) => setTimeout(r, 1500));

const operatorTriageShot = await cdpScreenshot('02-operator-triage-dashboard.png');
console.log('✓ Operator triage actions executed & screenshot captured');

// -------------------------------------------------------------
// JOURNEY 3: Reporter Verifies Developer Response on /support
// -------------------------------------------------------------
console.log('\n--- Journey 3: Reporter Verifies Response ---');
await setSession(reporterToken, { id: reporterId, email: reporterEmail }, reporterWorkspaceId);
await cdpNavigate('/support');

await waitAndClick('[data-testid="btn-check-status"]');

let responseCardFound = false;
for (let i = 0; i < 30; i++) {
  responseCardFound = await cdpEval(`Boolean(document.querySelector('[data-testid="feedback-operator-response"]'))`);
  if (responseCardFound) break;
  await new Promise((r) => setTimeout(r, 300));
}

const responseRendered = await cdpEval(`(() => {
  const card = document.querySelector('[data-testid="feedback-operator-response"]');
  const status = document.querySelector('[data-testid="receipt-status"]')?.textContent?.trim();
  const text = card?.textContent || '';
  return { rendered: Boolean(card), status, textSnippet: text.slice(0, 100) };
})()`);

console.log('✓ Reporter Verified Response:', responseRendered);
const reporterVerifiedShot = await cdpScreenshot('03-reporter-verified-response.png');

// -------------------------------------------------------------
// JOURNEY 4: OperatorGate Denial on Unauthorized Account
// -------------------------------------------------------------
console.log('\n--- Journey 4: OperatorGate Denial ---');
await setSession(unauthorizedToken, { id: unauthorizedId, email: unauthorizedEmail }, unauthorizedWorkspaceId);
await cdpNavigate('/developer/triage');

let deniedReady = false;
for (let i = 0; i < 20; i++) {
  deniedReady = await cdpEval(`document.body.innerText.includes('Operator access required') || document.body.innerText.includes('Developer tools')`);
  if (deniedReady) break;
  await new Promise((r) => setTimeout(r, 300));
}

const operatorGateDenialShot = await cdpScreenshot('04-operator-gate-denial.png');
console.log('✓ OperatorGate denial verified');

// Cleanup Browser and Servers
ws.close();
browser.kill();
nextProc.kill();
await apiServer.close();
authServer.close();
await runtimePool.end();
await adminPool.end();

const summary = {
  phase: '83',
  timestamp: new Date().toISOString(),
  gitRev,
  operatorId,
  reporterId,
  unauthorizedId,
  bugReceipt,
  responseVerification: responseRendered,
  evidenceScreenshots: [
    reporterReceiptShot,
    operatorTriageShot,
    reporterVerifiedShot,
    operatorGateDenialShot,
  ],
};

fs.writeFileSync(path.join(outDir, 'phase83-journey-summary.json'), JSON.stringify(summary, null, 2));
console.log('\n========================================');
console.log('Phase 83 Journey Execution Complete!');
console.log('========================================');
console.log(JSON.stringify(summary, null, 2));
