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
  runAdb(['shell', 'uiautomator', 'dump', '/sdcard/ui.xml']);
  const xml = runAdb(['shell', 'cat', '/sdcard/ui.xml']);
  fs.writeFileSync(path.join(outDir, name), xml);
  return xml;
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

/** adb input text: only ASCII safe for this automation path. */
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

const steps = [];
function record(step, ok, detail, extra = {}) {
  steps.push({ step, ok, detail, ...extra, at: new Date().toISOString() });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${step} — ${detail}`);
}

function isDaynori(xml) {
  return /package="com\.daynori\.app"/.test(xml);
}

function ensureApp() {
  let xml = dumpUi('ensure-check.xml');
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
  const ready = waitFor((x) => isDaynori(x) && Boolean(nodeByResourceId(x, 'header-settings-btn')), {
    dumps: ['ensure-ready.xml'],
    timeoutMs: 25000,
  });
  return ready.xml;
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
    destOk = Boolean(plan?.selected) && xml.includes(title);
  } else if (kind === 'journal') {
    const journal = nodeByResourceId(xml, 'nav-tab-journal');
    destOk = (Boolean(journal?.selected) || /text="Journal"/i.test(xml)) && xml.includes(title);
  } else if (kind === 'note') {
    destOk = xml.includes(title);
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

  // --- Auth / workspace prerequisite (ordinary Account group; no operator synthetic login) ---
  if (!tapNode(nodeByResourceId(xml, 'header-settings-btn'))) {
    record('auth-probe', false, 'settings header missing');
  } else {
    const hub = waitFor((x) => /settings-hub|Choose a group/i.test(x), {
      dumps: ['auth-hub.xml'],
      timeoutMs: 8000,
    });
    record('settings-hub-open', hub.ok, hub.ok ? 'hub open' : 'hub missing');
    if (hub.ok && tapNode(nodeByResourceId(hub.xml, 'settings-group-account'))) {
      const acct = waitFor((x) => /Sign in|Sign out|Account|workspace/i.test(x), {
        dumps: ['auth-account.xml'],
        timeoutMs: 8000,
      });
      const signedIn = /Sign out|Sign Out/i.test(acct.xml);
      const workspaceHint = /Workspace|workspace/i.test(acct.xml);
      const ordinaryDenial = /Developer review tools stay on restricted|restricted operator/i.test(
        acct.xml
      );
      record(
        'auth-state',
        true,
        `signedIn=${signedIn}; workspaceHints=${workspaceHint}; ordinaryDevDenialCopy=${ordinaryDenial}`,
        {
          signedIn,
          workspaceHint,
          ordinaryDenial,
          evidenceLayer: {
            localSyntheticAuth: false,
            realProviderAuth: signedIn ? 'unknown-provider-session' : 'none',
            localPersistence: 'requires-workspace',
            serverSync: 'not-probed',
          },
        }
      );
      if (!signedIn) {
        record(
          'auth-workspace-prerequisite',
          false,
          'Not authenticated in Account settings. Ordinary-user save journeys blocked until Account sign-in + workspace membership against reachable API/Auth (127.0.0.1 must be adb reverse / 10.0.2.2). Operator synthetic-login is not used for ordinary acceptance.'
        );
      } else {
        record(
          'auth-workspace-prerequisite',
          workspaceHint,
          workspaceHint
            ? 'Signed in with workspace hints present (confirm userId/workspaceId via app Account UI)'
            : 'Signed in but workspace membership not evident in Account UI'
        );
      }
      runAdb(['shell', 'input', 'keyevent', '4']);
      sleep(500);
    }
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(600);
  }

  // Create matrix — results provisional without reopen identity when auth blocked
  const note = createItem('note', NOTE_TITLE);
  if (note.saved) reopenByTitle(NOTE_TITLE, { tabResourceId: 'nav-tab-library', dumpsPrefix: 'note' });

  const task = createItem('task', TASK_TITLE);
  if (task.saved) reopenByTitle(TASK_TITLE, { tabResourceId: 'nav-tab-plan', dumpsPrefix: 'task' });

  const routine = createItem('routine', ROUTINE_TITLE);
  if (routine.saved) {
    reopenByTitle(ROUTINE_TITLE, { tabResourceId: 'nav-tab-plan', dumpsPrefix: 'routine' });
  }

  const journal = createItem('journal', JOURNAL_TITLE);
  if (journal.saved) {
    reopenByTitle(JOURNAL_TITLE, { tabResourceId: 'nav-tab-journal', dumpsPrefix: 'journal' });
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
    'IME Save reachability, pin/hide Journal, account isolation, and spoken TalkBack are separate procedures.',
    'adb input text is ASCII-only; non-ASCII coverage is untested.',
  ],
};
fs.writeFileSync(path.join(outDir, 'phase71-journeys.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ passCount: summary.passCount, failCount: summary.failCount, outDir }, null, 2));
process.exit(summary.failCount > 0 ? 1 : 0);
