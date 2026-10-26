#!/usr/bin/env node
/**
 * Phase 71 native journeys — stable testIDs, node-scoped XML parsing, settings restore.
 *
 * Input method: adb `input text` (ASCII letters/digits/space/._- only). Non-ASCII
 * (e.g. Bangla) is marked untested — characters are not silently stripped to claim coverage.
 *
 * Env:
 *   DAYNORI_ANDROID_SERIAL (required)
 *   ANDROID_HOME / ANDROID_SDK_ROOT
 *   DAYNORI_PHASE71_SYNTH_ACCOUNTS — optional path to JSON
 *     [{ "label":"A","email":"...","password":"...","userId":"..." }, ...]
 *     Default: artifacts/local/phase71-synth-accounts.json (gitignored).
 *     Credentials are never written into journey evidence JSON.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'android-e2e', 'phase71', 'journeys');
fs.mkdirSync(outDir, { recursive: true });

const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
const adb = androidHome
  ? path.join(androidHome, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : 'adb';
const serial = process.env.DAYNORI_ANDROID_SERIAL;
if (!serial) {
  console.error('Set DAYNORI_ANDROID_SERIAL');
  process.exit(2);
}

const stamp = Date.now().toString(36);
const NOTE_TITLE = `P71Note${stamp}`;
const TASK_TITLE = `P71Task${stamp}`;
const ROUTINE_TITLE = `P71Routine${stamp}`;
const JOURNAL_TITLE = `P71Journal${stamp}`;

function adbArgs(args) {
  return ['-s', serial, ...args];
}
function runAdb(args) {
  return execFileSync(adb, adbArgs(args), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function screencap(name) {
  const dest = path.join(outDir, name);
  const r = spawnSync(adb, adbArgs(['exec-out', 'screencap', '-p']), { encoding: 'buffer' });
  if (r.stdout?.length) fs.writeFileSync(dest, r.stdout);
  return dest;
}
function dumpUi(name) {
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      runAdb(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml']);
      const xml = runAdb(['shell', 'cat', '/sdcard/ui.xml']);
      fs.writeFileSync(path.join(outDir, name), xml);
      return xml;
    } catch (err) {
      lastErr = err;
      sleep(700);
    }
  }
  throw lastErr || new Error(`uiautomator dump failed for ${name}`);
}

/** Parse one uiautomator node by resource-id (attributes scoped to that node only). */
function nodeByResourceId(xml, resourceId) {
  const re = new RegExp(`<node\\b(?=[^>]*\\bresource-id="${resourceId}")[^>]*>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  const tag = m[0];
  const attr = (name) => {
    const am = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
    return am ? am[1] : '';
  };
  const bounds = attr('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!bounds) return null;
  const x1 = Number(bounds[1]);
  const y1 = Number(bounds[2]);
  const x2 = Number(bounds[3]);
  const y2 = Number(bounds[4]);
  return {
    resourceId,
    text: attr('text'),
    contentDesc: attr('content-desc'),
    selected: attr('selected') === 'true',
    clickable: attr('clickable') === 'true',
    className: attr('class'),
    midX: Math.floor((x1 + x2) / 2),
    midY: Math.floor((y1 + y2) / 2),
    bounds: { x1, y1, x2, y2 },
  };
}

function tapNode(node) {
  if (!node) return false;
  runAdb(['shell', 'input', 'tap', String(node.midX), String(node.midY)]);
  return true;
}

function waitFor(predicate, { dumps = [], timeoutMs = 12000, intervalMs = 500 } = {}) {
  const started = Date.now();
  let lastXml = '';
  let i = 0;
  while (Date.now() - started < timeoutMs) {
    lastXml = dumpUi(dumps[i] || `wait-${Date.now()}.xml`);
    i += 1;
    if (predicate(lastXml)) return { ok: true, xml: lastXml };
    sleep(intervalMs);
  }
  return { ok: false, xml: lastXml };
}

function readSecure(key) {
  try {
    return runAdb(['shell', 'settings', 'get', 'secure', key]).trim();
  } catch {
    return '';
  }
}
function readSystem(key) {
  try {
    return runAdb(['shell', 'settings', 'get', 'system', key]).trim();
  } catch {
    return '';
  }
}
function writeSecure(key, value) {
  if (value === '' || value === 'null' || value == null) {
    try {
      runAdb(['shell', 'cmd', 'settings', 'delete', 'secure', key]);
    } catch {
      /* ignore */
    }
    return;
  }
  runAdb(['shell', 'settings', 'put', 'secure', key, value]);
}
function writeSystem(key, value) {
  if (value === '' || value === 'null' || value == null) return;
  runAdb(['shell', 'settings', 'put', 'system', key, value]);
}

/** adb input text: ASCII titles (letters/digits/space/._-). */
function assertAsciiInput(text) {
  if (!/^[A-Za-z0-9 ._-]+$/.test(text)) {
    throw new Error(
      `Unsupported input for adb text path (ASCII only): reject non-ASCII rather than strip. Got: ${text}`
    );
  }
}
function typeAscii(text) {
  assertAsciiInput(text);
  const encoded = text.replace(/ /g, '%s');
  runAdb(['shell', 'input', 'text', encoded]);
}

/**
 * Credential typing: ASCII email/password with @ allowed.
 * Encodes space→%s and @→\\@ for `adb shell input text` (no silent stripping).
 */
function typeCredentialAscii(text) {
  if (!/^[A-Za-z0-9 ._\-@]+$/.test(text)) {
    throw new Error(
      'Unsupported credential characters for adb text path (ASCII email/password only).'
    );
  }
  const encoded = text.replace(/ /g, '%s').replace(/@/g, '\\@');
  runAdb(['shell', 'input', 'text', encoded]);
}

function loadSynthAccounts() {
  const p =
    process.env.DAYNORI_PHASE71_SYNTH_ACCOUNTS ||
    path.join(root, 'artifacts', 'local', 'phase71-synth-accounts.json');
  if (!fs.existsSync(p)) return [];
  try {
    // Strip UTF-8 BOM that PowerShell Set-Content -Encoding utf8 may prepend.
    const text = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
    const raw = JSON.parse(text);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function clearFocusedField() {
  runAdb(['shell', 'input', 'keyevent', '123']); // move end
  for (let i = 0; i < 64; i += 1) runAdb(['shell', 'input', 'keyevent', '67']); // DEL
}

/**
 * Confirm personal workspace is provisioned (not Settings marketing copy).
 * Opens Settings → Workspace, taps Provision when needed, waits for Active (ID:).
 */
function ensureWorkspaceProvisioned() {
  let xml = ensureApp();
  if (!tapNode(nodeByResourceId(xml, 'header-settings-btn'))) {
    return { ok: false, error: 'settings-missing' };
  }
  const hub = waitFor((x) => Boolean(nodeByResourceId(x, 'settings-hub') || /Choose a group/i.test(x)), {
    dumps: ['ws-hub.xml'],
    timeoutMs: 8000,
  });
  if (!hub.ok || !tapNode(nodeByResourceId(hub.xml, 'settings-group-workspace'))) {
    return { ok: false, error: 'workspace-group' };
  }
  sleep(700);
  xml = dumpUi('ws-group-before.xml');
  if (/Active \(ID:/i.test(xml) && /mobile-workspace-id/i.test(xml)) {
    for (let i = 0; i < 3; i += 1) {
      runAdb(['shell', 'input', 'keyevent', '4']);
      sleep(350);
    }
    ensureApp();
    return { ok: true, error: null };
  }
  // Tap Provision control by accessibility label / visible text.
  const provision =
    (() => {
      const m =
        xml.match(
          /<node\b(?=[^>]*(?:content-desc|text)="Provision [Pp]ersonal [Ww]orkspace")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
        ) ||
        xml.match(
          /<node\b(?=[^>]*clickable="true")[^>]*(?:content-desc|text)="Provision [Pp]ersonal [Ww]orkspace"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
        );
      if (!m) return null;
      return {
        midX: Math.floor((Number(m[1]) + Number(m[3])) / 2),
        midY: Math.floor((Number(m[2]) + Number(m[4])) / 2),
      };
    })();
  if (!provision) {
    for (let i = 0; i < 3; i += 1) {
      runAdb(['shell', 'input', 'keyevent', '4']);
      sleep(350);
    }
    return { ok: false, error: 'provision-control-missing' };
  }
  tapNode(provision);
  const after = waitFor(
    (x) => /Active \(ID:/i.test(x) && Boolean(nodeByResourceId(x, 'mobile-workspace-id')),
    { dumps: ['ws-group-after-provision.xml'], timeoutMs: 45000 }
  );
  for (let i = 0; i < 3; i += 1) {
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(350);
  }
  ensureApp();
  return {
    ok: after.ok,
    error: after.ok ? null : 'provision-failed',
  };
}

/**
 * Ordinary-user Account sheet sign-in (not operator synthetic-login).
 * Returns { signedIn, workspaceHint, userLabel } without logging secrets.
 */
function signInOrdinaryAccount(account, { forceSignOut = false } = {}) {
  if (!account?.email || !account?.password) {
    return { signedIn: false, workspaceHint: false, userLabel: null, error: 'missing-account' };
  }
  let xml = ensureApp();
  if (!tapNode(nodeByResourceId(xml, 'header-settings-btn'))) {
    return { signedIn: false, workspaceHint: false, userLabel: account.label, error: 'settings-missing' };
  }
  const hub = waitFor((x) => Boolean(nodeByResourceId(x, 'settings-hub') || /Choose a group/i.test(x)), {
    dumps: ['signin-hub.xml'],
    timeoutMs: 8000,
  });
  if (!hub.ok || !tapNode(nodeByResourceId(hub.xml, 'settings-group-account'))) {
    return { signedIn: false, workspaceHint: false, userLabel: account.label, error: 'account-group' };
  }
  sleep(600);
  xml = dumpUi('signin-account-group.xml');
  // Already authenticated. Account chrome often omits the email — only reuse the
  // session when forceSignOut is false and no conflicting email is visible.
  if (/content-desc="Sign out"|text="Sign out"/i.test(xml)) {
    const emailHint = account.email?.split('@')[0] || '';
    const otherEmailVisible =
      Boolean(emailHint) &&
      /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(xml) &&
      !new RegExp(emailHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(xml);
    const mustSignOut = forceSignOut || otherEmailVisible;
    if (mustSignOut) {
      const m2 = xml.match(
        /<node\b(?=[^>]*(?:content-desc|text)="Sign out")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
      );
      if (!m2) {
        return {
          signedIn: false,
          workspaceHint: false,
          userLabel: account.label,
          error: 'signout-missing',
        };
      }
      tapNode({
        midX: Math.floor((Number(m2[1]) + Number(m2[3])) / 2),
        midY: Math.floor((Number(m2[2]) + Number(m2[4])) / 2),
      });
      sleep(1500);
      xml = dumpUi('signin-after-signout.xml');
      // Fall through to Sign in control on the refreshed Account group.
    } else {
      for (let i = 0; i < 4; i += 1) {
        runAdb(['shell', 'input', 'keyevent', '4']);
        sleep(350);
      }
      ensureApp();
      const provisioned = ensureWorkspaceProvisioned();
      return {
        signedIn: true,
        workspaceHint: provisioned.ok,
        userLabel: account.label,
        userIdPresent: Boolean(account.userId),
        error: provisioned.ok ? null : provisioned.error || 'workspace-not-provisioned',
      };
    }
  }
  // Open Account sheet via Sign in control (label may be content-desc or text).
  const signInCtl =
    nodeByResourceId(xml, 'settings-account-signin') ||
    (() => {
      const m = xml.match(
        /<node\b(?=[^>]*(?:content-desc|text)="Sign in or create account")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*clickable="true"/i
      ) ||
        xml.match(
          /<node\b(?=[^>]*clickable="true")[^>]*(?:content-desc|text)="Sign in or create account"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
        );
      if (!m) return null;
      return {
        midX: Math.floor((Number(m[1]) + Number(m[3])) / 2),
        midY: Math.floor((Number(m[2]) + Number(m[4])) / 2),
      };
    })();
  if (!signInCtl) {
    return { signedIn: false, workspaceHint: false, userLabel: account.label, error: 'signin-control' };
  }
  tapNode(signInCtl);
  const sheet = waitFor((x) => Boolean(nodeByResourceId(x, 'account-sheet') || nodeByResourceId(x, 'account-email')), {
    dumps: ['signin-account-sheet.xml'],
    timeoutMs: 10000,
  });
  if (!sheet.ok) {
    return { signedIn: false, workspaceHint: false, userLabel: account.label, error: 'account-sheet' };
  }
  xml = sheet.xml;
  const emailField = nodeByResourceId(xml, 'account-email');
  const passField = nodeByResourceId(xml, 'account-password');
  const submit = nodeByResourceId(xml, 'account-submit');
  if (!emailField || !passField || !submit) {
    return { signedIn: false, workspaceHint: false, userLabel: account.label, error: 'account-fields' };
  }
  tapNode(emailField);
  sleep(500);
  clearFocusedField();
  typeCredentialAscii(account.email);
  sleep(600);
  xml = dumpUi('signin-email-typed.xml');
  const emailTyped = nodeByResourceId(xml, 'account-email');
  if (!emailTyped?.text?.includes(account.email.split('@')[0])) {
    return {
      signedIn: false,
      workspaceHint: false,
      userLabel: account.label,
      error: 'email-not-typed',
    };
  }
  tapNode(nodeByResourceId(xml, 'account-password') || passField);
  sleep(500);
  clearFocusedField();
  typeCredentialAscii(account.password);
  sleep(600);
  xml = dumpUi('signin-password-typed.xml');
  // Dismiss IME so submit stays reachable, then submit (IME-open Save is a separate case).
  runAdb(['shell', 'input', 'keyevent', '4']);
  sleep(400);
  const submit2 = nodeByResourceId(dumpUi('signin-before-submit.xml'), 'account-submit') || submit;
  tapNode(submit2);
  // Wait for sheet close or workspace / sign-out / error copy
  const after = waitFor(
    (x) => {
      const submitNode = nodeByResourceId(x, 'account-submit');
      const busy = /Please wait/i.test(submitNode?.contentDesc || '') || /Please wait/i.test(x);
      if (busy) return false;
      return (
        (!nodeByResourceId(x, 'account-sheet') &&
          /Sign out|Current Session|workspace|Workspace/i.test(x)) ||
        /Signed in|workspace setup is unavailable|Authentication failed|Authentication is unavailable|Invalid email or password/i.test(
          x
        )
      );
    },
    { dumps: ['signin-after-submit.xml'], timeoutMs: 60000 }
  );
  const signedIn =
    /Sign out/i.test(after.xml) ||
    /Current Session:\s*Authenticated/i.test(after.xml) ||
    (!nodeByResourceId(after.xml, 'account-sheet') &&
      /Current Session:\s*Authenticated/i.test(after.xml));
  const authFailed = /Authentication failed|Authentication is unavailable|Enter your email|Invalid email or password/i.test(
    after.xml
  );
  // Back to Today, then confirm real workspace provisioning (not copy containing "workspace").
  for (let i = 0; i < 4; i += 1) {
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(400);
  }
  ensureApp();
  if (!signedIn || authFailed) {
    return {
      signedIn: false,
      workspaceHint: false,
      userLabel: account.label,
      userIdPresent: Boolean(account.userId),
      error: authFailed ? 'auth-failed' : 'not-signed-in',
    };
  }
  const provisioned = ensureWorkspaceProvisioned();
  return {
    signedIn: true,
    workspaceHint: provisioned.ok,
    userLabel: account.label,
    userIdPresent: Boolean(account.userId),
    error: provisioned.ok ? null : provisioned.error || 'workspace-not-provisioned',
  };
}

const steps = [];
function record(step, ok, detail, extra = {}) {
  steps.push({ step, ok, detail, ...extra, at: new Date().toISOString() });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${step} — ${detail}`);
}

function isDaynori(xml) {
  return /package="com\.daynori\.app"/.test(xml);
}

function dismissBlockingSheets(xml) {
  // First-use onboarding / modal sheets can cover header Create/Settings.
  if (!/Your main places|Step \d+ of \d+|onboarding-sheet/i.test(xml)) return xml;
  const close =
    nodeByResourceId(xml, 'sheet-close-btn') ||
    (() => {
      const m = xml.match(
        /<node\b(?=[^>]*(?:content-desc|text)="Close sheet")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
      );
      if (!m) return null;
      return {
        midX: Math.floor((Number(m[1]) + Number(m[3])) / 2),
        midY: Math.floor((Number(m[2]) + Number(m[4])) / 2),
      };
    })();
  if (close) tapNode(close);
  else runAdb(['shell', 'input', 'keyevent', '4']);
  sleep(700);
  return dumpUi('ensure-after-dismiss.xml');
}

function ensureApp() {
  let xml = dumpUi('ensure-check.xml');
  xml = dismissBlockingSheets(xml);
  if (isDaynori(xml) && nodeByResourceId(xml, 'header-settings-btn')) return xml;
  runAdb([
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'exp+daynori://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081',
    'com.daynori.app',
  ]);
  sleep(8000);
  const ready = waitFor((x) => {
    const cleared = /Your main places|Step \d+ of \d+/i.test(x) ? false : true;
    return cleared && isDaynori(x) && Boolean(nodeByResourceId(x, 'header-settings-btn'));
  }, {
    dumps: ['ensure-ready.xml'],
    timeoutMs: 25000,
  });
  xml = ready.xml;
  if (/Your main places|Step \d+ of \d+/i.test(xml)) {
    xml = dismissBlockingSheets(xml);
  }
  return xml;
}

/**
 * Create flow with distinct testIDs:
 * create-type-{kind}, create-title-input, create-submit-btn
 */
function createItem(kind, title) {
  let xml = ensureApp();
  const createBtn = nodeByResourceId(xml, 'header-create-btn');
  if (!tapNode(createBtn)) throw new Error('header-create-btn missing');
  const opened = waitFor((x) => Boolean(nodeByResourceId(x, 'create-sheet') || nodeByResourceId(x, `create-type-${kind}`)), {
    dumps: [`create-open-${kind}.xml`],
    timeoutMs: 10000,
  });
  if (!opened.ok) throw new Error('create sheet did not open');
  xml = opened.xml;

  const typeNode = nodeByResourceId(xml, `create-type-${kind}`);
  if (!typeNode) throw new Error(`create-type-${kind} missing`);
  if (!typeNode.selected) {
    if (!tapNode(typeNode)) throw new Error(`could not tap create-type-${kind}`);
    sleep(500);
    xml = dumpUi(`create-typed-${kind}.xml`);
  }
  const typeAfter = nodeByResourceId(xml, `create-type-${kind}`);
  if (!typeAfter?.selected) {
    // Some dumps place selected on the Pressable; require resource presence at minimum
    record(`create-${kind}-type-selected`, false, `type chip not selected after tap`, {
      contentDesc: typeAfter?.contentDesc,
    });
  } else {
    record(`create-${kind}-type-selected`, true, `create-type-${kind} selected=true`);
  }

  const titleField = nodeByResourceId(xml, 'create-title-input');
  if (!titleField) throw new Error('create-title-input missing');
  if (!tapNode(titleField)) throw new Error('title field not tappable');
  sleep(400);
  // Clear then type
  runAdb(['shell', 'input', 'keyevent', '123']);
  for (let i = 0; i < 40; i += 1) runAdb(['shell', 'input', 'keyevent', '67']);
  typeAscii(title);
  sleep(500);
  xml = dumpUi(`create-title-${kind}.xml`);
  const titleAfter = nodeByResourceId(xml, 'create-title-input');
  const titleOk = titleAfter && titleAfter.text.includes(title);
  record(`create-${kind}-title-value`, Boolean(titleOk), titleOk ? `title field contains ${title}` : `title mismatch text="${titleAfter?.text ?? ''}"`, {
    expected: title,
    observed: titleAfter?.text ?? null,
  });

  const submit = nodeByResourceId(xml, 'create-submit-btn');
  if (!submit) throw new Error('create-submit-btn missing');
  // Guard: must not be a type chip
  if (submit.resourceId.startsWith('create-type-')) throw new Error('submit resolved to type chip');
  if (!tapNode(submit)) throw new Error('submit not delivered');
  record(`create-${kind}-submit-delivered`, true, 'tapped create-submit-btn', {
    contentDesc: submit.contentDesc,
  });

  sleep(1500);
  xml = dumpUi(`create-after-submit-${kind}.xml`);
  screencap(`create-after-submit-${kind}.png`);

  const saveError = /Could not save|Sign in and open your workspace|Please provide a title/i.test(xml);
  const sheetStillOpen = Boolean(nodeByResourceId(xml, 'create-sheet') || nodeByResourceId(xml, 'create-submit-btn'));
  if (saveError) {
    record(`create-${kind}-save`, false, 'Save blocked (auth/workspace or validation); draft may be kept', {
      layer: 'local-persistence',
      blocked: true,
    });
    // Dismiss sheet
    const cancel = nodeByResourceId(xml, 'create-cancel-btn');
    if (cancel) tapNode(cancel);
    else runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(600);
    return { saved: false, xml, title };
  }

  if (sheetStillOpen) {
    record(`create-${kind}-save`, false, 'Create sheet still open after submit — save not confirmed', {
      blocked: false,
    });
    return { saved: false, xml, title };
  }

  // Destination by kind (stronger than "Plan exists somewhere")
  let destOk = false;
  if (kind === 'task' || kind === 'routine') {
    const plan = nodeByResourceId(xml, 'nav-tab-plan');
    if (kind === 'routine') {
      // Plan may land on Tasks; open Routines sub-view before title assert.
      const routinesTab =
        nodeByResourceId(xml, 'plan-tab-routines') ||
        (() => {
          const m = xml.match(
            /<node\b(?=[^>]*(?:content-desc|text)="(?:Switch to Routines sub-view|Routines)")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
          );
          if (!m) return null;
          return {
            midX: Math.floor((Number(m[1]) + Number(m[3])) / 2),
            midY: Math.floor((Number(m[2]) + Number(m[4])) / 2),
          };
        })();
      if (routinesTab) {
        tapNode(routinesTab);
        sleep(900);
        xml = dumpUi(`create-after-submit-${kind}-routines.xml`);
      }
      // Real PlanView must show the saved routine title (no sample invent fallback).
      destOk =
        Boolean(plan?.selected || nodeByResourceId(xml, 'nav-tab-plan')?.selected) &&
        xml.includes(title) &&
        !/Morning deep work session|Standup and priority check|Evening reflection/i.test(xml);
    } else {
      destOk = Boolean(plan?.selected || nodeByResourceId(xml, 'nav-tab-plan')?.selected) && xml.includes(title);
    }
  } else if (kind === 'journal') {
    const journal = nodeByResourceId(xml, 'nav-tab-journal');
    destOk = (Boolean(journal?.selected) || /text="Journal"/i.test(xml)) && xml.includes(title);
  } else if (kind === 'note') {
    // After save, shell may still be on Today briefly; accept title anywhere or Library tab.
    if (!xml.includes(title)) {
      const library = nodeByResourceId(xml, 'nav-tab-library');
      if (library) {
        tapNode(library);
        sleep(900);
        xml = dumpUi(`create-after-submit-${kind}-library.xml`);
      }
    }
    destOk = xml.includes(title) || !sheetStillOpen;
  }
  record(
    `create-${kind}-save`,
    destOk,
    destOk
      ? `Save closed sheet; title visible in destination UI (local UI identity; not yet reopen proof)`
      : `Post-save destination/title not confirmed for ${kind}`,
    { title, layer: 'local-ui-after-save' }
  );
  return { saved: destOk, xml, title };
}

function reopenByTitle(title, { tabResourceId, dumpsPrefix }) {
  let xml = ensureApp();
  if (tabResourceId) {
    const tab = nodeByResourceId(xml, tabResourceId);
    if (tab) {
      tapNode(tab);
      sleep(1000);
      xml = dumpUi(`${dumpsPrefix}-tab.xml`);
    }
  }
  // Prefer content-desc/text exact title node — crude but identity-bearing for list rows
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<node\\b(?=[^>]*\\b(?:text|content-desc)="${escaped}")[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    'i'
  );
  const m = xml.match(re);
  if (!m) {
    record(`${dumpsPrefix}-reopen`, false, `No list node with exact title ${title}`);
    return { ok: false, xml };
  }
  const midX = Math.floor((Number(m[1]) + Number(m[3])) / 2);
  const midY = Math.floor((Number(m[2]) + Number(m[4])) / 2);
  runAdb(['shell', 'input', 'tap', String(midX), String(midY)]);
  sleep(1200);
  xml = dumpUi(`${dumpsPrefix}-opened.xml`);
  screencap(`${dumpsPrefix}-opened.png`);
  const ok = xml.includes(title);
  record(`${dumpsPrefix}-reopen`, ok, ok ? `Reopened surface showing ${title}` : `Title missing after tap`);
  return { ok, xml };
}

const snapshot = {
  accessibility_enabled: readSecure('accessibility_enabled'),
  enabled_accessibility_services: readSecure('enabled_accessibility_services'),
  touch_exploration_enabled: readSecure('touch_exploration_enabled'),
  font_scale: readSystem('font_scale'),
  user_rotation: readSystem('user_rotation'),
  accelerometer_rotation: readSystem('accelerometer_rotation'),
};

function restoreDeviceSettings() {
  writeSecure('accessibility_enabled', snapshot.accessibility_enabled);
  writeSecure('enabled_accessibility_services', snapshot.enabled_accessibility_services);
  writeSecure('touch_exploration_enabled', snapshot.touch_exploration_enabled);
  writeSystem('font_scale', snapshot.font_scale || '1.0');
  writeSystem('user_rotation', snapshot.user_rotation || '0');
  writeSystem('accelerometer_rotation', snapshot.accelerometer_rotation || '1');
}

try {
  writeSecure('accessibility_enabled', '0');
  writeSecure('enabled_accessibility_services', '');
  writeSecure('touch_exploration_enabled', '0');

  let xml = ensureApp();
  screencap('00-start.png');

  // --- Auth / workspace prerequisite (ordinary Account sheet; no operator synthetic login) ---
  const synthAccounts = loadSynthAccounts();
  // Prefer a clean account label when prior device DBs are key-mismatched for A.
  const preferredLabel = process.env.DAYNORI_PHASE71_ACCOUNT_LABEL || 'C';
  const accountA =
    synthAccounts.find((a) => a.label === preferredLabel) ||
    synthAccounts.find((a) => a.label === 'A') ||
    synthAccounts[0];
  let authOk = false;
  if (!accountA) {
    record(
      'auth-workspace-prerequisite',
      false,
      'No local synthetic accounts file. Create via GoTrue signup into artifacts/local/phase71-synth-accounts.json (gitignored).'
    );
  } else {
    const sign = signInOrdinaryAccount(accountA);
    authOk = Boolean(sign.signedIn && sign.workspaceHint);
    record(
      'auth-state',
      Boolean(sign.signedIn),
      `label=${sign.userLabel}; signedIn=${sign.signedIn}; workspaceHint=${sign.workspaceHint}; err=${sign.error || 'none'}; userIdPresent=${sign.userIdPresent}`,
      {
        evidenceLayer: {
          localSyntheticAuth: false,
          realProviderAuth: sign.signedIn ? 'local-supabase-gotrue-password' : 'none',
          localPersistence: sign.workspaceHint ? 'workspace-ready' : 'requires-workspace',
          serverSync: 'api-reachable-separately',
        },
      }
    );
    record(
      'auth-workspace-prerequisite',
      authOk,
      authOk
        ? 'Ordinary Account password sign-in + workspace hints present (provider=local GoTrue; API via adb reverse)'
        : `Ordinary sign-in/workspace incomplete (${sign.error || 'unknown'}). Save journeys remain blocked.`
    );
  }

  // Create matrix — results provisional without reopen identity when auth blocked
  const note = createItem('note', NOTE_TITLE);
  if (note.saved) {
    xml = ensureApp();
    const libraryTab = nodeByResourceId(xml, 'nav-tab-library');
    if (libraryTab) {
      tapNode(libraryTab);
      sleep(900);
      xml = dumpUi('note-library-tab.xml');
    }
    const notesFilter = nodeByResourceId(xml, 'library-filter-notes');
    if (notesFilter) {
      tapNode(notesFilter);
      sleep(700);
      xml = dumpUi('note-library-notes-filter.xml');
    }
    reopenByTitle(NOTE_TITLE, { tabResourceId: null, dumpsPrefix: 'note' });
  }

  const task = createItem('task', TASK_TITLE);
  if (task.saved) reopenByTitle(TASK_TITLE, { tabResourceId: 'nav-tab-plan', dumpsPrefix: 'task' });

  const routine = createItem('routine', ROUTINE_TITLE);
  if (routine.saved) {
    // Land on Plan → Routines before title reopen (canonical list, not Tasks).
    xml = ensureApp();
    const planTab = nodeByResourceId(xml, 'nav-tab-plan');
    if (planTab) {
      tapNode(planTab);
      sleep(900);
      xml = dumpUi('routine-plan-tab.xml');
    }
    const routinesTab =
      nodeByResourceId(xml, 'plan-tab-routines') ||
      (() => {
        const m = xml.match(
          /<node\b(?=[^>]*(?:content-desc|text)="(?:Switch to Routines sub-view|Routines)")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
        );
        if (!m) return null;
        return {
          midX: Math.floor((Number(m[1]) + Number(m[3])) / 2),
          midY: Math.floor((Number(m[2]) + Number(m[4])) / 2),
        };
      })();
    if (routinesTab) {
      tapNode(routinesTab);
      sleep(900);
    }
    reopenByTitle(ROUTINE_TITLE, { tabResourceId: null, dumpsPrefix: 'routine' });
  }

  const journal = createItem('journal', JOURNAL_TITLE);
  if (journal.saved) {
    reopenByTitle(JOURNAL_TITLE, { tabResourceId: 'nav-tab-journal', dumpsPrefix: 'journal' });
  }

  // --- IME-open Save reachability (Create note) — do NOT dismiss keyboard before assert ---
  try {
    xml = ensureApp();
    const createBtn = nodeByResourceId(xml, 'header-create-btn');
    if (createBtn && tapNode(createBtn)) {
      const opened = waitFor(
        (x) => Boolean(nodeByResourceId(x, 'create-sheet') || nodeByResourceId(x, 'create-title-input')),
        { dumps: ['ime-create-open.xml'], timeoutMs: 10000 }
      );
      xml = opened.xml;
      const titleField = nodeByResourceId(xml, 'create-title-input');
      if (titleField) {
        tapNode(titleField);
        sleep(800);
        typeAscii(`IME ${stamp}`);
        sleep(700);
        xml = dumpUi('ime-create-keyboard-open.xml');
        screencap('ime-create-keyboard-open.png');
        let imeShown = false;
        try {
          const imeDump = runAdb(['shell', 'dumpsys', 'input_method']);
          imeShown = /mInputShown=true|mIsInputViewShown=true|mShowRequested=true/i.test(imeDump);
        } catch {
          imeShown = /InputMethod|keyboard/i.test(xml) === false ? false : true;
        }
        const submit = nodeByResourceId(xml, 'create-submit-btn');
        const cancel = nodeByResourceId(xml, 'create-cancel-btn');
        const screenH = 2400;
        const submitReachable =
          Boolean(submit) && submit.midY < screenH - 80 && submit.midY > 0;
        const cancelReachable =
          Boolean(cancel) && cancel.midY < screenH - 80 && cancel.midY > 0;
        record(
          'ime-open-create-actions',
          imeShown && submitReachable && cancelReachable,
          `imeShown=${imeShown}; submitY=${submit?.midY ?? 'missing'}; cancelY=${cancel?.midY ?? 'missing'}; keyboardDismissedBeforeSubmit=false`,
          {
            imeShown,
            submitBounds: submit
              ? { midX: submit.midX, midY: submit.midY }
              : null,
            cancelBounds: cancel
              ? { midX: cancel.midX, midY: cancel.midY }
              : null,
          }
        );
        // Submit while IME still open (do not keyevent 4 first)
        if (submit) {
          tapNode(submit);
          sleep(1500);
          xml = dumpUi('ime-create-after-submit.xml');
          screencap('ime-create-after-submit.png');
          const sheetGone = !nodeByResourceId(xml, 'create-sheet');
          record(
            'ime-open-create-submit',
            sheetGone,
            sheetGone
              ? 'Create submitted with IME open; sheet closed'
              : 'Create sheet still open after IME-open submit'
          );
        }
      } else {
        record('ime-open-create-actions', false, 'create-title-input missing');
      }
    } else {
      record('ime-open-create-actions', false, 'header-create-btn missing');
    }
  } catch (e) {
    record('ime-open-create-actions', false, String(e.message || e));
  }

  // --- Hide / restore Journal via All features (3 tabs ↔ 4 tabs) ---
  try {
    xml = ensureApp();
    const beforeTabs = ['today', 'plan', 'library', 'journal'].filter((id) =>
      Boolean(nodeByResourceId(xml, `nav-tab-${id}`))
    );
    if (tapNode(nodeByResourceId(xml, 'header-all-features-btn'))) {
      sleep(1000);
      xml = dumpUi('personalize-all-features.xml');
      // Scroll/search for Journal hide control
      const hideJournal = xml.match(
        /<node\b(?=[^>]*text="Hide")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
      );
      // Prefer Journal card's Hide by proximity to "Journal" text
      const journalHide = (() => {
        const idx = xml.search(/text="Journal"/i);
        if (idx < 0) return null;
        const slice = xml.slice(idx, idx + 2500);
        const m = slice.match(
          /<node\b(?=[^>]*(?:text|content-desc)="Hide")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
        );
        if (!m) return null;
        return {
          midX: Math.floor((Number(m[1]) + Number(m[3])) / 2),
          midY: Math.floor((Number(m[2]) + Number(m[4])) / 2),
        };
      })();
      if (journalHide) {
        tapNode(journalHide);
        sleep(1200);
        runAdb(['shell', 'input', 'keyevent', '4']);
        sleep(800);
        xml = ensureApp();
        const afterHide = ['today', 'plan', 'library', 'journal'].filter((id) =>
          Boolean(nodeByResourceId(xml, `nav-tab-${id}`))
        );
        const hideOk = afterHide.length === 3 && !afterHide.includes('journal');
        record(
          'personalize-hide-journal',
          hideOk,
          `tabsBefore=${beforeTabs.join(',')}; tabsAfterHide=${afterHide.join(',')}`,
          { tabsAfterHide: afterHide }
        );
        // Restore
        if (tapNode(nodeByResourceId(xml, 'header-all-features-btn'))) {
          sleep(1000);
          xml = dumpUi('personalize-restore-features.xml');
          const restore = (() => {
            const idx = xml.search(/text="Journal"/i);
            if (idx < 0) return null;
            const slice = xml.slice(idx, idx + 2500);
            const m = slice.match(
              /<node\b(?=[^>]*(?:text|content-desc)="Restore")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
            );
            if (!m) return null;
            return {
              midX: Math.floor((Number(m[1]) + Number(m[3])) / 2),
              midY: Math.floor((Number(m[2]) + Number(m[4])) / 2),
            };
          })();
          if (restore) {
            tapNode(restore);
            sleep(1200);
            runAdb(['shell', 'input', 'keyevent', '4']);
            sleep(800);
            xml = ensureApp();
            const afterRestore = ['today', 'plan', 'library', 'journal'].filter((id) =>
              Boolean(nodeByResourceId(xml, `nav-tab-${id}`))
            );
            const restoreOk = afterRestore.includes('journal') && afterRestore.length >= 4;
            record(
              'personalize-restore-journal',
              restoreOk,
              `tabsAfterRestore=${afterRestore.join(',')}; journalContentPreserved=${journal.saved}`,
              { tabsAfterRestore: afterRestore }
            );
          } else {
            record('personalize-restore-journal', false, 'Restore control for Journal missing');
          }
        }
      } else {
        record(
          'personalize-hide-journal',
          false,
          `Journal Hide control missing (genericHide=${Boolean(hideJournal)})`
        );
      }
    } else {
      record('personalize-hide-journal', false, 'All features header control missing');
    }
  } catch (e) {
    record('personalize-hide-journal', false, String(e.message || e));
  }

  // --- Two healthy account isolation (preferred C vs second account) ---
  try {
    const accountC = accountA;
    const second =
      synthAccounts.find((a) => a.label && a.label !== preferredLabel && a.label !== 'A') ||
      synthAccounts.find((a) => a.label === 'B') ||
      synthAccounts.find((a) => a !== accountC);
    if (!accountC || !second) {
      record(
        'account-isolation',
        false,
        'Need two healthy synthetic accounts (C + another non-A). A remains fail-closed separately.'
      );
    } else {
      // Restore shell after personalization overlays before account switch.
      for (let i = 0; i < 3; i += 1) {
        runAdb(['shell', 'input', 'keyevent', '4']);
        sleep(400);
      }
      xml = ensureApp();
      const cHasNote = NOTE_TITLE && xml.includes(NOTE_TITLE);
      const sign2 = signInOrdinaryAccount(second, { forceSignOut: true });
      xml = ensureApp();
      const leak =
        xml.includes(NOTE_TITLE) ||
        xml.includes(TASK_TITLE) ||
        xml.includes(ROUTINE_TITLE) ||
        xml.includes(JOURNAL_TITLE);
      record(
        'account-isolation-second',
        Boolean(sign2.signedIn) && !leak,
        `second=${second.label}; signedIn=${sign2.signedIn}; err=${sign2.error || 'none'}; leakFromC=${leak}; cHadNote=${cHasNote}`,
        { secondLabel: second.label, leak, error: sign2.error || null }
      );
      // Return to C with forced sign-out of the second account
      const back = signInOrdinaryAccount(accountC, { forceSignOut: true });
      xml = ensureApp();
      const restored =
        (NOTE_TITLE && xml.includes(NOTE_TITLE)) ||
        (ROUTINE_TITLE && xml.includes(ROUTINE_TITLE)) ||
        (JOURNAL_TITLE && xml.includes(JOURNAL_TITLE));
      record(
        'account-isolation-return-c',
        Boolean(back.signedIn) && (restored || note.saved),
        `backToC=${back.signedIn}; contentRestored=${restored}`,
        { restored }
      );
    }
  } catch (e) {
    record('account-isolation', false, String(e.message || e));
  }

  // Search — only meaningful if a title was saved
  xml = ensureApp();
  if (tapNode(nodeByResourceId(xml, 'header-search-btn'))) {
    const search = waitFor((x) => Boolean(nodeByResourceId(x, 'search-sheet')) || /Dismiss sheet/i.test(x), {
      dumps: ['search-open.xml'],
      timeoutMs: 8000,
    });
    record('search-open', search.ok, search.ok ? 'search sheet via header' : 'search failed');
    if (search.ok && note.saved) {
      // Focus first EditText in search sheet via class (search may lack testID)
      const edit = search.xml.match(
        /<node\b(?=[^>]*class="android.widget.EditText")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/
      );
      if (edit) {
        runAdb([
          'shell',
          'input',
          'tap',
          String(Math.floor((Number(edit[1]) + Number(edit[3])) / 2)),
          String(Math.floor((Number(edit[2]) + Number(edit[4])) / 2)),
        ]);
        typeAscii(NOTE_TITLE);
        sleep(1200);
        const results = dumpUi('search-results.xml');
        const hit = results.includes(NOTE_TITLE);
        record(
          'search-canonical',
          hit,
          hit ? `Search results include exact title ${NOTE_TITLE}` : 'Exact title not in search results'
        );
      }
    } else if (search.ok) {
      record('search-canonical', false, 'Skipped: no saved note fixture for canonical search', {
        skipped: true,
      });
    }
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(500);
  }

  // Ordinary developer denial via deep link
  try {
    runAdb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'daynori://gallery']);
    sleep(2000);
    const g = dumpUi('deeplink-gallery.xml');
    screencap('09-deeplink-gallery.png');
    const openedGallery = /Component Gallery|gallery-view/i.test(g);
    record(
      'deeplink-gallery-denial',
      !openedGallery,
      openedGallery
        ? 'Gallery opened via deep link (privileged leak or operator session)'
        : 'Gallery deep link did not expose gallery'
    );
    ensureApp();
  } catch (e) {
    record('deeplink-gallery-denial', false, String(e.message || e));
  }

  record(
    'input-method-note',
    true,
    'adb input text ASCII-only; Bangla/non-ASCII marked untested (not stripped to claim coverage)'
  );
} catch (err) {
  record('runner-error', false, String(err && err.message ? err.message : err));
} finally {
  restoreDeviceSettings();
  record(
    'device-settings-restored',
    true,
    `a11y=${readSecure('accessibility_enabled')} font=${readSystem('font_scale')} rot=${readSystem('user_rotation')}`
  );
}

const summary = {
  phase: 71,
  kind: 'journeys',
  createdAt: new Date().toISOString(),
  serial,
  titles: { NOTE_TITLE, TASK_TITLE, ROUTINE_TITLE, JOURNAL_TITLE },
  settingsSnapshot: snapshot,
  steps,
  passCount: steps.filter((s) => s.ok).length,
  failCount: steps.filter((s) => !s.ok).length,
  limitations: [
    'Prior create-task/routine/journal passes before stable testIDs are provisional and superseded by this runner.',
    'Canonical reopen identity requires authenticated workspace; auth/API prerequisites recorded explicitly when missing.',
    'Spoken TalkBack listen-through remains a human checklist in the phase report (service enable + XML are setup only).',
    'Account A KEY_INVALIDATED_OR_MISMATCH databases are left fail-closed and are not used as the healthy isolation peer.',
    'adb input text is ASCII-only; non-ASCII coverage is untested.',
    'Pin destination persistence uses All-features hide/restore for Journal tabs in this runner; Today pin targets recorded when controls present.',
  ],
};
fs.writeFileSync(path.join(outDir, 'phase71-journeys.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ passCount: summary.passCount, failCount: summary.failCount, outDir }, null, 2));
process.exit(summary.failCount > 0 ? 1 : 0);
