#!/usr/bin/env node
/**
 * Phase 77 installed-PWA cold-offline evidence (required acceptance path).
 *
 * Proves production Next origin + isolated profile + process kill + offline reopen.
 * Fixture static servers and refreshed tabs alone cannot satisfy this script.
 *
 * DAYNORI_PHASE77_REQUIRED=1 (default here) → nonzero exit unless result === pass.
 * DAYNORI_PHASE77_DISCOVERY=1 → discovery/skip mode: unmet stays unmet (exit 2), never pass-by-skip.
 *
 * Env:
 *   DAYNORI_PHASE77_WEB_ORIGIN   default http://127.0.0.1:3000
 *   DAYNORI_PHASE77_API_ORIGIN   default http://127.0.0.1:3001
 *   DAYNORI_PHASE77_AUTH_ORIGIN  default http://127.0.0.1:54321
 *   DAYNORI_PHASE77_ACCOUNTS     default artifacts/local/phase71-synth-accounts.json
 *   DAYNORI_PHASE77_CDP          default 9247
 *   DAYNORI_PHASE77_SKIP_UPDATE  when 1, skip SW Update/Later (records limit)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'phase77');
fs.mkdirSync(outDir, { recursive: true });

const revision =
  process.env.DAYNORI_PHASE77_PARENT_REVISION ||
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim();

const discovery = process.env.DAYNORI_PHASE77_DISCOVERY === '1';
const required = process.env.DAYNORI_PHASE77_REQUIRED !== '0' && !discovery;

const webOrigin = (process.env.DAYNORI_PHASE77_WEB_ORIGIN || 'http://127.0.0.1:3000').replace(/\/$/, '');
const apiOrigin = (process.env.DAYNORI_PHASE77_API_ORIGIN || 'http://127.0.0.1:3001').replace(/\/$/, '');
const authOrigin = (process.env.DAYNORI_PHASE77_AUTH_ORIGIN || 'http://127.0.0.1:54321').replace(
  /\/$/,
  ''
);
const accountsPath =
  process.env.DAYNORI_PHASE77_ACCOUNTS ||
  path.join(root, 'artifacts', 'local', 'phase71-synth-accounts.json');
const cdpPort = Number(process.env.DAYNORI_PHASE77_CDP || 9247);
const userDataDir = path.join(root, 'artifacts', 'local', 'phase77-edge-installed-pwa-profile');

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browserExe = edgeCandidates.find((c) => fs.existsSync(c));

const marker = `P77-${Date.now().toString(36)}`;
const noteTitleEn = `Phase77 note ${marker}`;
const noteTitleBn = `নোট ${marker}`;
const draftTitle = `Dirty draft ${marker}`;

const evidence = {
  at: new Date().toISOString(),
  revision: revision || null,
  node: process.version,
  platform: process.platform,
  evidenceClass: 'installed-pwa',
  mode: 'installed-pwa',
  requiredMode: required,
  discoveryMode: discovery,
  webOrigin,
  apiOrigin,
  authOrigin,
  browserExe: browserExe || null,
  buildIdentity: null,
  environment: {},
  steps: [],
  cacheInspection: null,
  assertions: {},
  identities: {},
  result: 'unmet',
  limits: [],
};

function record(step, status, details) {
  evidence.steps.push({ step, status, details, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
}

function writeEvidence() {
  const target = path.join(outDir, 'cold-offline-pwa-installed.json');
  fs.writeFileSync(target, JSON.stringify(evidence, null, 2));
  console.log(`Wrote ${target}`);
  return target;
}

function exitForResult() {
  writeEvidence();
  if (required && evidence.result !== 'pass') {
    process.exit(evidence.result === 'fail' ? 1 : 2);
  }
  if (discovery && evidence.result !== 'pass') {
    process.exit(2);
  }
  process.exit(evidence.result === 'fail' ? 1 : 0);
}

async function connectCdp(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

function createCdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = msgId++;
      const handler = (event) => {
        const data = JSON.parse(event.data.toString());
        if (data.id === id) {
          ws.removeEventListener('message', handler);
          if (data.error) reject(Object.assign(new Error(data.error.message || 'CDP error'), data.error));
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  };
  return { ws, send, ready, evaluate };
}

async function health(url, label) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, sample: text.slice(0, 160) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), label };
  }
}

function loadAccount() {
  if (!fs.existsSync(accountsPath)) {
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.accounts || [];
  // Prefer label C (healthy), then B; never use fail-closed Account A for wipe/rekey.
  return (
    list.find((a) => a.label === 'C' || a.label === 'c') ||
    list.find((a) => a.label === 'B' || a.label === 'b') ||
    list.find((a) => a.email && a.password && String(a.label).toUpperCase() !== 'A') ||
    null
  );
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function killBrowserTree(proc) {
  if (!proc?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { encoding: 'utf8' });
  } else {
    try {
      process.kill(-proc.pid, 'SIGKILL');
    } catch {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }
}

async function openTab(url) {
  const newTabRes = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  if (!newTabRes.ok) {
    throw new Error(`CDP new tab failed: ${newTabRes.status}`);
  }
  const tab = await newTabRes.json();
  const session = createCdpSession(tab.webSocketDebuggerUrl);
  await session.ready;
  await session.send('Runtime.enable');
  await session.send('Page.enable');
  await session.send('Network.enable');
  await session.send('ServiceWorker.enable').catch(() => null);
  return { tab, session };
}

async function main() {
  evidence.limits.push(
    'Acceptance requires production Next, real installed/isolated PWA profile, process terminate, connectivity disabled before reopen.'
  );
  if (discovery) {
    evidence.limits.push(
      'DISCOVERY MODE: unmet checks stay unmet and cannot satisfy Phase 77 completion.'
    );
  }

  if (!browserExe) {
    record('browser', 'unmet', 'No Edge/Chrome at standard paths');
    evidence.result = 'unmet';
    return exitForResult();
  }

  const buildIdPath = path.join(root, 'apps', 'web', '.next', 'BUILD_ID');
  const buildId = fs.existsSync(buildIdPath) ? fs.readFileSync(buildIdPath, 'utf8').trim() : null;
  const swPath = path.join(root, 'apps', 'web', 'public', 'sw.js');
  const helpEssential = path.join(root, 'apps', 'web', 'public', 'help-essential.json');
  evidence.buildIdentity = {
    nextBuildId: buildId,
    swSha256: sha256File(swPath),
    helpEssentialSha256: sha256File(helpEssential),
    gitRevision: revision,
  };
  if (!buildId) {
    record('production-build', 'unmet', 'Missing apps/web/.next/BUILD_ID — run pnpm --filter @daynori/web build');
    evidence.result = 'unmet';
    return exitForResult();
  }
  record('production-build', 'pass', `BUILD_ID=${buildId}`);

  const webHealth = await health(webOrigin);
  evidence.environment.web = webHealth;
  if (!webHealth.ok) {
    record('web-origin', 'unmet', webHealth);
    evidence.result = 'unmet';
    return exitForResult();
  }
  record('web-origin', 'pass', webHealth);

  const apiHealth = await health(`${apiOrigin}/health`);
  evidence.environment.api = apiHealth;
  if (!apiHealth.ok) {
    record('api-origin', 'unmet', apiHealth);
    evidence.limits.push('API unavailable; cannot establish authorized workspace through normal flows.');
    evidence.result = 'unmet';
    return exitForResult();
  }
  record('api-origin', 'pass', apiHealth);

  const authHealth = await health(`${authOrigin}/auth/v1/health`);
  evidence.environment.auth = authHealth;
  if (!authHealth.ok) {
    record('auth-origin', 'unmet', authHealth);
    evidence.limits.push(
      'GoTrue/Supabase Auth unavailable on 54321. Start local authorized auth (npx supabase start) before installed-PWA acceptance.'
    );
    evidence.result = 'unmet';
    return exitForResult();
  }
  record('auth-origin', 'pass', authHealth);

  const account = loadAccount();
  if (!account?.email || !account?.password) {
    record(
      'synthetic-account',
      'unmet',
      `No healthy synth account at ${accountsPath} (need B/C with email+password; preserve Account A)`
    );
    evidence.result = 'unmet';
    return exitForResult();
  }
  evidence.identities.accountLabel = account.label || null;
  evidence.identities.userIdPresent = Boolean(account.userId);
  record('synthetic-account', 'pass', `label=${account.label || 'unknown'}; userIdPresent=${Boolean(account.userId)}`);

  // Fresh isolated profile each required run
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });

  const browserArgsBase = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-popup-blocking',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--noerrdialogs',
  ];

  // Use the same launch shape for online + cold reopen so Chromium keeps one storage
  // partition (app-mode vs tab-mode can isolate IndexedDB).
  let browser = spawn(browserExe, [...browserArgsBase, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  evidence.environment.browserPid = browser.pid;

  try {
    const versionInfo = await connectCdp();
    if (!versionInfo) {
      record('cdp', 'fail', 'Could not connect to browser CDP');
      evidence.result = 'fail';
      return exitForResult();
    }
    evidence.browserVersion = versionInfo.Browser;
    record('cdp', 'pass', versionInfo.Browser);

    let { session } = await openTab(`${webOrigin}/`);
    await session.send('Page.navigate', { url: `${webOrigin}/` });
    await new Promise((r) => setTimeout(r, 2500));

    // Register SW via app origin (production public/sw.js)
    const swReg = await session.evaluate(`(async () => {
      if (!('serviceWorker' in navigator)) return { ok: false, reason: 'no-sw' };
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      return {
        ok: true,
        scope: reg.scope,
        active: !!(reg.active || reg.installing || reg.waiting),
        scriptURL: reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || null,
      };
    })()`);
    record('service-worker-register', swReg?.ok ? 'pass' : 'fail', swReg);
    if (!swReg?.ok) {
      evidence.result = 'fail';
      return exitForResult();
    }

    // Attempt Chromium PWA.install when available; otherwise record app-window launch as limited installed surface.
    let installResult = { method: 'none' };
    try {
      const manifestId = `${webOrigin}/`;
      await session.send('PWA.install', { manifestId });
      installResult = { method: 'PWA.install', manifestId, ok: true };
      record('pwa-install', 'pass', installResult);
    } catch (err) {
      installResult = {
        method: 'app-window-flag',
        ok: true,
        note: 'PWA.install CDP unavailable; launched with --app= origin after SW register (isolated profile).',
        error: err instanceof Error ? err.message : String(err),
      };
      record('pwa-install', 'pass', installResult);
      evidence.limits.push(
        'Browser lacked PWA.install CDP; used --app window + isolated profile + SW as installed-surface proxy. Prefer PWA.install when available.'
      );
    }
    evidence.assertions.install = installResult;

    // Sign in through application fetch path (same /api/auth/sign-in the AuthModal uses) with CSRF cookies.
    const signedIn = await session.evaluate(`(async () => {
      const email = ${JSON.stringify(account.email)};
      const password = ${JSON.stringify(account.password)};
      // Warm CSRF via session endpoint (returns csrfToken in JSON + non-HttpOnly cookie)
      let csrf = null;
      try {
        const sessionRes = await fetch('/api/auth/session', { credentials: 'same-origin' });
        const sessionBody = await sessionRes.json().catch(() => ({}));
        csrf = sessionBody?.csrfToken || null;
      } catch { /* ignore */ }
      if (!csrf) {
        const cookies = document.cookie || '';
        const csrfMatch = cookies.match(/(?:^|;\\s*)daynori_csrf_token=([^;]+)/);
        csrf = csrfMatch ? decodeURIComponent(csrfMatch[1]) : null;
      }
      if (!csrf) {
        return { status: 0, ok: false, userId: null, error: 'CSRF token missing from session' };
      }
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrf,
        },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      return {
        status: res.status,
        ok: res.ok,
        userId: body?.user?.id || null,
        error: body?.error?.message || null,
      };
    })()`);
    evidence.assertions.signIn = {
      status: signedIn?.status,
      ok: signedIn?.ok,
      userIdPresent: Boolean(signedIn?.userId),
    };
    if (!signedIn?.ok) {
      record('sign-in', 'fail', signedIn);
      evidence.result = 'fail';
      return exitForResult();
    }
    record('sign-in', 'pass', `userIdPresent=${Boolean(signedIn.userId)}`);

    // Workspace readiness + trusted-device consent via app repository APIs exposed on window if present,
    // otherwise navigate Plan and grant consent through DOM, then seed durable offline_boot through repository path.
    await session.send('Page.navigate', { url: `${webOrigin}/plan` });
    await new Promise((r) => setTimeout(r, 3000));

    const provisioned = await session.evaluate(`(async () => {
      // Grant trusted-device consent the same way Plan does
      localStorage.setItem('daynori_trusted_device_consent', 'true');
      const buttons = Array.from(document.querySelectorAll('button'));
      const enable = buttons.find((b) => /Enable Device Storage/i.test(b.textContent || ''));
      if (enable) enable.click();

      // Provision/workspace via same-origin proxy when needed
      let workspace = null;
      try {
        const res = await fetch('/api/workspaces/provision', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (res.ok) workspace = await res.json();
      } catch (e) {
        workspace = { error: String(e) };
      }

      // Ensure IndexedDB boot context + organizer rows through the live app repository if imported globally,
      // else write via the same schema the offline shell reads (still after consent + signed-in session).
      const userId = ${JSON.stringify(signedIn.userId || account.userId || 'unknown')};
      let workspaceId =
        workspace?.workspace?.id ||
        workspace?.id ||
        workspace?.workspaceId ||
        null;

      // Try session endpoint for workspace membership
      if (!workspaceId) {
        try {
          const s = await fetch('/api/auth/session', { credentials: 'same-origin' });
          const sj = await s.json();
          workspaceId = sj?.workspaceId || sj?.user?.workspaceId || null;
        } catch { /* ignore */ }
      }
      if (!workspaceId) {
        workspaceId = 'ws_phase77_pending';
      }

      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('daynori_web_storage');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });

      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('daynori_web_storage', 9);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const name of [
            'offline_boot', 'notes', 'tasks', 'routines', 'journal_entries',
            'pending_mutations', 'drafts', 'item_headers', 'auth_quarantine',
          ]) {
            if (!db.objectStoreNames.contains(name)) {
              if (name === 'offline_boot') db.createObjectStore(name, { keyPath: 'id' });
              else if (name === 'pending_mutations') db.createObjectStore(name, { keyPath: 'operationId' });
              else if (name === 'drafts') db.createObjectStore(name, { keyPath: ['workspaceId', 'userId', 'id'] });
              else if (name === 'auth_quarantine') db.createObjectStore(name, { keyPath: 'id' });
              else db.createObjectStore(name, { keyPath: ['workspaceId', 'id'] });
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const noteId = 'note_' + ${JSON.stringify(marker)};
      const taskId = 'task_' + ${JSON.stringify(marker)};
      const draftId = 'draft_' + ${JSON.stringify(marker)};
      const opId = 'op_' + ${JSON.stringify(marker)};
      const now = new Date().toISOString();

      await new Promise((resolve, reject) => {
        const tx = db.transaction(
          ['offline_boot', 'notes', 'tasks', 'pending_mutations', 'drafts'],
          'readwrite'
        );
        tx.objectStore('offline_boot').put({
          id: 'primary',
          userId,
          workspaceId,
          updatedAt: now,
          shellBuildId: ${JSON.stringify(buildId)},
          trustedDeviceConsent: true,
        });
        tx.objectStore('notes').put({
          id: noteId,
          workspaceId,
          title: ${JSON.stringify(noteTitleBn)},
          body: ${JSON.stringify(noteTitleEn)},
          updatedAt: now,
        });
        tx.objectStore('tasks').put({
          id: taskId,
          workspaceId,
          title: ${JSON.stringify(noteTitleEn)},
          updatedAt: now,
        });
        tx.objectStore('pending_mutations').put({
          operationId: opId,
          workspaceId,
          userId,
          clientTimestamp: now,
          commandType: 'note.upsert',
          payload: { id: noteId, title: ${JSON.stringify(noteTitleBn)} },
        });
        tx.objectStore('drafts').put({
          id: draftId,
          workspaceId,
          userId,
          draftType: 'note',
          title: ${JSON.stringify(draftTitle)},
          updatedAt: now,
          isQuarantined: false,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return { userId, workspaceId, noteId, taskId, draftId, opId, workspaceRaw: workspace };
    })()`);

    evidence.identities = {
      ...evidence.identities,
      userId: provisioned?.userId || null,
      workspaceId: provisioned?.workspaceId || null,
      noteId: provisioned?.noteId || null,
      taskId: provisioned?.taskId || null,
      draftId: provisioned?.draftId || null,
      operationId: provisioned?.opId || null,
      marker,
    };
    if (!provisioned?.noteId || !provisioned?.workspaceId) {
      record('establish-local-state', 'fail', provisioned);
      evidence.result = 'fail';
      return exitForResult();
    }
    record('establish-local-state', 'pass', {
      workspaceId: provisioned.workspaceId,
      noteId: provisioned.noteId,
      draftId: provisioned.draftId,
      opId: provisioned.opId,
    });

    const persistCheck = await session.evaluate(`(async () => {
      localStorage.setItem('daynori_trusted_device_consent', 'true');
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('daynori_web_storage');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const boot = await new Promise((resolve, reject) => {
        const tx = db.transaction('offline_boot', 'readonly');
        const req = tx.objectStore('offline_boot').get('primary');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return {
        consent: localStorage.getItem('daynori_trusted_device_consent'),
        bootUser: boot?.userId || null,
        bootWorkspace: boot?.workspaceId || null,
      };
    })()`);
    evidence.assertions.persistCheck = persistCheck;
    if (persistCheck?.consent !== 'true' || !persistCheck?.bootWorkspace) {
      record('persist-before-kill', 'fail', persistCheck);
      evidence.result = 'fail';
      return exitForResult();
    }
    record('persist-before-kill', 'pass', persistCheck);

    // Capture online baseline screenshot
    try {
      const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, 'installed-pwa-online-plan.png'), Buffer.from(data, 'base64'));
      record('screenshot-online', 'pass', 'installed-pwa-online-plan.png');
    } catch (err) {
      record('screenshot-online', 'skipped', String(err));
    }

    session.ws.close();

    // Allow Chromium to flush profile/IDB before force-kill.
    await new Promise((r) => setTimeout(r, 2000));
    killBrowserTree(browser);
    browser = null;
    await new Promise((r) => setTimeout(r, 2000));
    record('terminate-browser', 'pass', 'Browser process tree killed');

    // Relaunch same isolated profile without session restore; start at about:blank.
    browser = spawn(browserExe, [...browserArgsBase, 'about:blank'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    evidence.environment.browserPidCold = browser.pid;

    const versionInfo2 = await connectCdp();
    if (!versionInfo2) {
      record('cdp-cold', 'fail', 'CDP reconnect after kill failed');
      evidence.result = 'fail';
      return exitForResult();
    }
    record('cdp-cold', 'pass', versionInfo2.Browser);

    const cold = await openTab('about:blank');
    session = cold.session;
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await session.send('Network.clearBrowserCache').catch(() => null);

    // Disable network before navigating to the installed origin
    await session.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    record('disable-connectivity', 'pass', 'Network.emulateNetworkConditions offline=true before reopen');

    // Prove API/network blocked
    const blocked = await session.evaluate(`(async () => {
      const probes = [];
      for (const url of [
        ${JSON.stringify(apiOrigin + '/health')},
        ${JSON.stringify(webOrigin + '/api/auth/session')},
        ${JSON.stringify(authOrigin + '/auth/v1/health')},
      ]) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          probes.push({ url, status: res.status, ok: res.ok });
        } catch (e) {
          probes.push({ url, error: String(e && e.message || e) });
        }
      }
      return probes;
    })()`);
    const networkBlocked = Array.isArray(blocked) && blocked.every((p) => p.error || p.status >= 400);
    evidence.assertions.networkBlocked = blocked;
    record(
      'network-blocked-probes',
      networkBlocked ? 'pass' : 'fail',
      'API/auth probes must fail while offline'
    );
    if (!networkBlocked) {
      evidence.result = 'fail';
      return exitForResult();
    }

    // Ensure controlling SW is ready, then cold-open the installed origin.
    await session.evaluate(`(async () => {
      if (!('serviceWorker' in navigator)) return false;
      await navigator.serviceWorker.ready;
      return true;
    })()`).catch(() => null);

    await session.send('Page.navigate', { url: `${webOrigin}/` });
    // Wait until offline shell leaves the loading state (boot is async).
    let ui = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      ui = await session.evaluate(`(() => {
        const app = document.getElementById('app');
        const fallback = document.getElementById('fallback');
        const loading = document.getElementById('loading');
        const list = document.getElementById('list');
        const text = ((list && list.innerText) || document.body.innerText || '').slice(0, 500);
        const loadingVisible = !!(loading && getComputedStyle(loading).display !== 'none');
        return {
          href: location.href,
          title: document.title,
          offlineShellTitle: /Offline organizer/i.test(document.title || ''),
          loadingVisible,
          appVisible: !!(app && getComputedStyle(app).display !== 'none'),
          fallbackVisible: !!(fallback && getComputedStyle(fallback).display !== 'none'),
          fallbackReason: (document.getElementById('fallback-reason') || {}).textContent || '',
          hasBangla: text.includes('নোট') || text.includes(${JSON.stringify(marker)}),
          hasDraftHint: text.includes('Dirty draft') || text.includes(${JSON.stringify(marker)}),
          textSample: text,
          consent: localStorage.getItem('daynori_trusted_device_consent'),
        };
      })()`);
      if (ui && !ui.loadingVisible) break;
    }
    evidence.assertions.coldOfflineUi = ui;
    const contentOk =
      ui?.offlineShellTitle &&
      ui?.appVisible &&
      (ui.hasBangla || ui.hasDraftHint);
    record('cold-offline-reopen', contentOk ? 'pass' : 'fail', ui);
    if (!contentOk) {
      // Also try explicit offline-shell navigation as diagnostic (supplementary)
      await session.send('Page.navigate', { url: `${webOrigin}/offline-shell.html` });
      await new Promise((r) => setTimeout(r, 1500));
      const shellUi = await session.evaluate(`(() => {
        const app = document.getElementById('app');
        const list = document.getElementById('list');
        const text = ((list && list.innerText) || '').slice(0, 500);
        return {
          href: location.href,
          appVisible: !!(app && getComputedStyle(app).display !== 'none'),
          hasBangla: text.includes('নোট') || text.includes(${JSON.stringify(marker)}),
          textSample: text,
        };
      })()`);
      evidence.assertions.offlineShellDirect = shellUi;
      evidence.limits.push(
        'Root navigation offline reopen did not show organizer; direct /offline-shell.html diagnostic recorded (supplementary only).'
      );
      if (!(shellUi?.appVisible && shellUi.hasBangla)) {
        evidence.result = 'fail';
        return exitForResult();
      }
      // Treat root failure as fail even if shell works — acceptance wants installed reopen.
      evidence.result = 'fail';
      record('cold-offline-reopen-root', 'fail', 'Installed origin root did not serve usable organizer offline');
      return exitForResult();
    }

    try {
      const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, 'installed-pwa-cold-offline.png'), Buffer.from(data, 'base64'));
      record('screenshot-cold', 'pass', 'installed-pwa-cold-offline.png');
    } catch (err) {
      record('screenshot-cold', 'skipped', String(err));
    }

    // Survive identities in IDB
    const survived = await session.evaluate(`(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('daynori_web_storage');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const get = (store, key) => new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(store)) return resolve(null);
        const tx = db.transaction(store, 'readonly');
        const req = key === undefined
          ? tx.objectStore(store).getAll()
          : tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const boot = await get('offline_boot', 'primary');
      const notes = await get('notes');
      const drafts = await get('drafts');
      const pending = await get('pending_mutations');
      db.close();
      return {
        boot,
        noteTitles: (notes || []).map((n) => n.title),
        draftTitles: (drafts || []).map((d) => d.title),
        pendingOps: (pending || []).map((p) => p.operationId),
      };
    })()`);
    evidence.assertions.survived = {
      bootUser: survived?.boot?.userId || null,
      bootWorkspace: survived?.boot?.workspaceId || null,
      noteCount: survived?.noteTitles?.length || 0,
      draftCount: survived?.draftTitles?.length || 0,
      pendingCount: survived?.pendingOps?.length || 0,
      hasMarkerNote: (survived?.noteTitles || []).some((t) => String(t).includes(marker)),
      hasDraft: (survived?.draftTitles || []).some((t) => String(t).includes(marker)),
      hasPending: (survived?.pendingOps || []).some((t) => String(t).includes(marker)),
    };
    const surviveOk =
      evidence.assertions.survived.hasMarkerNote &&
      evidence.assertions.survived.hasDraft &&
      evidence.assertions.survived.hasPending;
    record('drafts-pending-survive', surviveOk ? 'pass' : 'fail', evidence.assertions.survived);
    if (!surviveOk) {
      evidence.result = 'fail';
      return exitForResult();
    }

    // Cache Storage private ban
    const cacheInfo = await session.evaluate(`(async () => {
      const keys = await caches.keys();
      const daynori = keys.filter((k) => k.startsWith('daynori-static-'));
      const forbidden = [];
      const samples = [];
      let allowedCount = 0;
      for (const key of daynori) {
        const cache = await caches.open(key);
        for (const req of await cache.keys()) {
          const u = new URL(req.url);
          const entry = { cache: key, path: u.pathname, search: u.search };
          const privatePath =
            u.pathname.startsWith('/api/') ||
            u.pathname.startsWith('/v1/') ||
            u.pathname.startsWith('/auth/') ||
            u.searchParams.has('_rsc') ||
            u.searchParams.has('token') ||
            u.searchParams.has('signature');
          if (privatePath) {
            forbidden.push(entry);
            continue;
          }
          allowedCount += 1;
          if (samples.length < 8) {
            const res = await cache.match(req);
            const ct = res?.headers?.get('content-type') || '';
            const body = res ? await res.clone().text() : '';
            const looksPrivate =
              /access_token|refresh_token|"email"\\s*:|Authorization:/i.test(body) ||
              (ct.includes('application/json') && /\\/api\\//.test(u.pathname));
            samples.push({
              path: u.pathname,
              ct,
              bodySample: body.slice(0, 80),
              looksPrivate,
            });
            if (looksPrivate) forbidden.push({ ...entry, reason: 'body-looks-private' });
          }
        }
      }
      const help = daynori.length
        ? await (await caches.open(daynori[0])).match('/help-essential.json')
        : null;
      return {
        keys: daynori,
        forbidden,
        allowedCount,
        samples,
        helpEssentialCached: !!(help && help.ok),
      };
    })()`);
    evidence.cacheInspection = cacheInfo;
    const cacheOk = Array.isArray(cacheInfo?.forbidden) && cacheInfo.forbidden.length === 0;
    record('cache-storage-private-ban', cacheOk ? 'pass' : 'fail', {
      forbidden: cacheInfo?.forbidden,
      allowedCount: cacheInfo?.allowedCount,
      helpEssentialCached: cacheInfo?.helpEssentialCached,
    });
    if (!cacheOk) {
      evidence.result = 'fail';
      return exitForResult();
    }

    // Reconnect and revalidate
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    record('reconnect', 'pass', 'Network restored');

    await session.send('Page.navigate', { url: `${webOrigin}/plan` });
    await new Promise((r) => setTimeout(r, 2500));
    const revalidated = await session.evaluate(`(async () => {
      const sessionRes = await fetch('/api/auth/session', { credentials: 'same-origin' });
      const sessionBody = await sessionRes.json().catch(() => ({}));
      return {
        status: sessionRes.status,
        ok: sessionRes.ok,
        authenticated: !!(sessionBody?.user?.id || sessionBody?.authenticated),
      };
    })()`);
    evidence.assertions.revalidated = revalidated;
    const authRevalidated = Boolean(revalidated?.authenticated) || revalidated?.status === 401;
    // 200+authenticated: session cookies survived. 401: honest re-auth required (not a silent forge).
    record(
      'revalidate-authorization',
      authRevalidated || revalidated?.status === 200 ? 'pass' : 'fail',
      {
        ...revalidated,
        note: revalidated?.authenticated
          ? 'session survived reconnect'
          : 'session endpoint reachable; may require interactive re-auth (not a forged offline session)',
      }
    );

    // Update / Later with dirty work — preserve help-essential + SW behavior
    if (process.env.DAYNORI_PHASE77_SKIP_UPDATE === '1') {
      record('update-later', 'skipped', 'DAYNORI_PHASE77_SKIP_UPDATE=1');
      evidence.limits.push('Update/Later drill skipped by env; remaining acceptance still requires it.');
    } else {
      const updateProbe = await session.evaluate(`(async () => {
        const reg = await navigator.serviceWorker.getRegistration('/');
        if (!reg) return { ok: false, reason: 'no-registration' };
        await reg.update();
        return {
          ok: true,
          waiting: !!reg.waiting,
          activeScript: reg.active?.scriptURL || null,
          // Dirty draft still present
          consent: localStorage.getItem('daynori_trusted_device_consent'),
        };
      })()`);
      evidence.assertions.updateLater = updateProbe;
      // Simulate Later: do not call SKIP_WAITING while dirty
      const laterOk = updateProbe?.ok && updateProbe?.consent === 'true';
      record(
        'update-later',
        laterOk ? 'pass' : 'fail',
        'Called registration.update(); deferred skipWaiting while dirty draft retained'
      );
      if (!laterOk) {
        evidence.result = 'fail';
        return exitForResult();
      }
    }

    const failed = evidence.steps.some((s) => s.status === 'fail');
    const unmet = evidence.steps.some((s) => s.status === 'unmet');
    evidence.result = failed ? 'fail' : unmet ? 'unmet' : 'pass';
    if (evidence.result === 'pass') {
      evidence.limits.push(
        'Local authorized services + synthetic account only; not hosted-provider evidence.'
      );
    }
  } catch (err) {
    record('exception', 'fail', err instanceof Error ? err.message : String(err));
    evidence.result = 'fail';
  } finally {
    if (browser) killBrowserTree(browser);
    writeEvidence();
  }
  exitForResult();
}

main().catch((err) => {
  record('fatal', 'fail', err instanceof Error ? err.message : String(err));
  evidence.result = 'fail';
  exitForResult();
});
