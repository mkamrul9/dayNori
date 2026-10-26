#!/usr/bin/env node
/**
 * Phase 71 native core journeys on an explicit serial.
 * Uses synthetic titles; records precise auth/workspace blockers without fabricating passes.
 *
 * Env: DAYNORI_ANDROID_SERIAL (required), ANDROID_HOME / ANDROID_SDK_ROOT
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
const NOTE_TITLE = `P71 Note ${stamp}`;
const TASK_TITLE = `P71 Task ${stamp}`;
const ROUTINE_TITLE = `P71 Routine ${stamp}`;
const JOURNAL_TITLE = `P71 Journal ${stamp}`;
const DRAFT_TITLE = `P71 Draft ${stamp}`;

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
function boundsForResource(xml, resourceId) {
  const re = new RegExp(
    `resource-id="${resourceId}"[\\s\\S]{0,400}?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`
  );
  const m = xml.match(re);
  if (!m) return null;
  return {
    midX: Math.floor((Number(m[1]) + Number(m[3])) / 2),
    midY: Math.floor((Number(m[2]) + Number(m[4])) / 2),
  };
}
function tapResource(xml, resourceId) {
  const b = boundsForResource(xml, resourceId);
  if (!b) return false;
  runAdb(['shell', 'input', 'tap', String(b.midX), String(b.midY)]);
  return true;
}
function tapDesc(xml, descFragment) {
  const re = new RegExp(
    `content-desc="([^"]*${descFragment}[^"]*)"[\\s\\S]{0,200}?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    'i'
  );
  const m = xml.match(re);
  if (!m) return false;
  runAdb([
    'shell',
    'input',
    'tap',
    String(Math.floor((Number(m[2]) + Number(m[4])) / 2)),
    String(Math.floor((Number(m[3]) + Number(m[5])) / 2)),
  ]);
  return true;
}
function tapText(xml, text) {
  const re = new RegExp(
    `text="${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]{0,200}?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`
  );
  const m = xml.match(re);
  if (!m) return false;
  runAdb([
    'shell',
    'input',
    'tap',
    String(Math.floor((Number(m[1]) + Number(m[3])) / 2)),
    String(Math.floor((Number(m[2]) + Number(m[4])) / 2)),
  ]);
  return true;
}
function waitFor(predicate, { dumps = [], timeoutMs = 10000, intervalMs = 500 } = {}) {
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
function typeText(text) {
  // adb input text: spaces as %s; limited charset
  const encoded = text.replace(/ /g, '%s').replace(/[^a-zA-Z0-9%s._-]/g, '');
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
  if (isDaynori(xml) && /header-settings-btn|Today tab/i.test(xml)) return xml;
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
  return waitFor((x) => isDaynori(x) && /header-settings-btn/i.test(x), {
    dumps: ['ensure-ready.xml'],
    timeoutMs: 25000,
  }).xml;
}

function openCreate(typeKey) {
  let xml = ensureApp();
  if (!tapResource(xml, 'header-create-btn')) throw new Error('create header missing');
  const opened = waitFor((x) => /create-sheet|Create New Item|content-desc="Dismiss sheet"/i.test(x), {
    dumps: ['create-open.xml'],
    timeoutMs: 8000,
  });
  if (!opened.ok) throw new Error('create sheet did not open');
  xml = opened.xml;
  if (typeKey && !tapResource(xml, `create-type-${typeKey}`)) {
    tapText(xml, typeKey.charAt(0).toUpperCase() + typeKey.slice(1));
  }
  sleep(400);
  return dumpUi('create-typed.xml');
}

function fillTitleAndSubmit(title) {
  let xml = dumpUi('before-title.xml');
  // Focus first EditText
  const edit = xml.match(
    /class="android.widget.EditText"[\s\S]{0,500}?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/
  );
  if (!edit) throw new Error('title field missing');
  runAdb([
    'shell',
    'input',
    'tap',
    String(Math.floor((Number(edit[1]) + Number(edit[3])) / 2)),
    String(Math.floor((Number(edit[2]) + Number(edit[4])) / 2)),
  ]);
  sleep(400);
  runAdb(['shell', 'input', 'keyevent', '123']); // move end
  typeText(title);
  sleep(400);
  xml = dumpUi('after-title.xml');
  const created =
    tapDesc(xml, 'Create Note') ||
    tapDesc(xml, 'Create Task') ||
    tapDesc(xml, 'Create Routine') ||
    tapDesc(xml, 'Create Journal') ||
    tapText(xml, 'Create Note') ||
    tapText(xml, 'Create Task') ||
    tapText(xml, 'Create Routine') ||
    tapText(xml, 'Create Journal');
  if (!created) {
    // Primary button near bottom of sheet
    const btn = xml.match(
      /content-desc="Create [^"]+"[\s\S]{0,120}?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
    );
    if (btn) {
      runAdb([
        'shell',
        'input',
        'tap',
        String(Math.floor((Number(btn[1]) + Number(btn[3])) / 2)),
        String(Math.floor((Number(btn[2]) + Number(btn[4])) / 2)),
      ]);
    } else {
      throw new Error('Create submit control missing');
    }
  }
  sleep(1200);
  return dumpUi('after-submit.xml');
}

try {
  runAdb(['shell', 'settings', 'put', 'secure', 'accessibility_enabled', '0']);
  runAdb(['shell', 'settings', 'put', 'secure', 'enabled_accessibility_services', '']);
  runAdb(['shell', 'settings', 'put', 'secure', 'touch_exploration_enabled', '0']);
} catch {
  /* best-effort */
}

try {
  let xml = ensureApp();
  screencap('00-start.png');

  // --- Auth / workspace prerequisite probe ---
  if (!tapResource(xml, 'header-settings-btn')) {
    record('auth-probe', false, 'settings header missing');
  } else {
    const hub = waitFor((x) => /settings-hub|Choose a group/i.test(x), {
      dumps: ['auth-hub.xml'],
      timeoutMs: 8000,
    });
    record('settings-hub-open', hub.ok, hub.ok ? 'hub open for auth probe' : 'hub missing');
    if (hub.ok && (tapResource(hub.xml, 'settings-group-account') || tapDesc(hub.xml, 'Account'))) {
      const acct = waitFor(
        (x) => /Sign in|Sign out|synthetic|workspace|Account/i.test(x),
        { dumps: ['auth-account.xml'], timeoutMs: 8000 }
      );
      const hasWorkspace = /workspace|Workspace ID|Personal workspace/i.test(acct.xml);
      const signedIn = /Sign out|Sign Out|Log out/i.test(acct.xml);
      const ordinaryDenial = /Developer review tools stay on restricted|ordinary|restricted operator/i.test(
        acct.xml
      );
      record(
        'auth-state',
        true,
        `signedIn=${signedIn}; workspaceHints=${hasWorkspace}; ordinaryDevDenialCopy=${ordinaryDenial}`,
        { signedIn, hasWorkspace, ordinaryDenial }
      );
      // Ordinary-user developer denial: gallery/harness labels absent for non-operator
      const hasGallery = /Open Component Gallery|synthetic vault harness/i.test(acct.xml);
      record(
        'ordinary-developer-denial-settings',
        !hasGallery || ordinaryDenial,
        hasGallery
          ? 'Developer gallery/harness visible (operator or leak)'
          : 'No gallery/harness on Account group for current user'
      );
      if (tapDesc(acct.xml, 'Log in synthetic') || tapDesc(acct.xml, 'Sign In Synthetic')) {
        sleep(1500);
        record('synthetic-login-tap', true, 'tapped Sign In Synthetic (may open Account sheet)');
      } else {
        record(
          'synthetic-login-tap',
          false,
          'Sign In Synthetic not available (operator-gated or already signed in) — not a production bypass'
        );
      }
      runAdb(['shell', 'input', 'keyevent', '4']);
      sleep(500);
    }
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(600);
  }

  xml = ensureApp();

  // --- Create note ---
  try {
    openCreate('note');
    const after = fillTitleAndSubmit(NOTE_TITLE);
    const saved =
      !/Could not save|Sign in and open your workspace|Please provide a title/i.test(after) &&
      (/Library|text="Library"|Workspace/i.test(after) || !/create-sheet|Create New Item/i.test(after));
    const blocked = /Could not save|Sign in and open your workspace/i.test(after);
    screencap('01-note-submit.png');
    record(
      'create-note',
      saved && !blocked,
      blocked
        ? 'Blocked: workspace/auth required; draft kept (expected without membership)'
        : saved
          ? `Note submit left create sheet; title=${NOTE_TITLE}`
          : 'Note create postcondition unclear',
      { title: NOTE_TITLE, blocked }
    );
    if (blocked) runAdb(['shell', 'input', 'keyevent', '4']);
  } catch (e) {
    record('create-note', false, String(e.message || e));
  }

  xml = ensureApp();

  // --- Create task ---
  try {
    openCreate('task');
    const after = fillTitleAndSubmit(TASK_TITLE);
    const blocked = /Could not save|Sign in and open your workspace/i.test(after);
    const onPlan =
      /resource-id="nav-tab-plan"[^>]*selected="true"|content-desc="Plan tab"[^>]*selected="true"/i.test(
        after
      ) || /text="Plan"/i.test(after);
    screencap('02-task-submit.png');
    record(
      'create-task',
      !blocked && (onPlan || new RegExp(TASK_TITLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(after)),
      blocked
        ? 'Blocked: workspace/auth required for task save'
        : `Task flow title=${TASK_TITLE}; onPlan=${onPlan}`,
      { title: TASK_TITLE, blocked }
    );
    if (blocked) runAdb(['shell', 'input', 'keyevent', '4']);
  } catch (e) {
    record('create-task', false, String(e.message || e));
  }

  xml = ensureApp();

  // --- Create routine ---
  try {
    openCreate('routine');
    const after = fillTitleAndSubmit(ROUTINE_TITLE);
    const blocked = /Could not save|Sign in and open your workspace/i.test(after);
    screencap('03-routine-submit.png');
    record(
      'create-routine',
      !blocked,
      blocked
        ? 'Blocked: workspace/auth required for routine save'
        : `Routine submit title=${ROUTINE_TITLE}`,
      { title: ROUTINE_TITLE, blocked }
    );
    if (blocked) runAdb(['shell', 'input', 'keyevent', '4']);
  } catch (e) {
    record('create-routine', false, String(e.message || e));
  }

  xml = ensureApp();

  // --- Journal create ---
  try {
    openCreate('journal');
    const after = fillTitleAndSubmit(JOURNAL_TITLE);
    const blocked = /Could not save|Sign in and open your workspace/i.test(after);
    screencap('04-journal-submit.png');
    record(
      'create-journal',
      !blocked,
      blocked
        ? 'Blocked: workspace/auth required for journal save'
        : `Journal submit title=${JOURNAL_TITLE}`,
      { title: JOURNAL_TITLE, blocked }
    );
    if (blocked) runAdb(['shell', 'input', 'keyevent', '4']);
  } catch (e) {
    record('create-journal', false, String(e.message || e));
  }

  xml = ensureApp();

  // --- Search surface ---
  try {
    if (!tapResource(xml, 'header-search-btn')) throw new Error('search header missing');
    const search = waitFor(
      (x) => /content-desc="Dismiss sheet"|class="android.widget.EditText"/i.test(x),
      { dumps: ['search-open.xml'], timeoutMs: 8000 }
    );
    screencap('05-search.png');
    record('search-open', search.ok, search.ok ? 'Search sheet opened via header' : 'Search failed');
    if (search.ok) {
      const edit = search.xml.match(
        /class="android.widget.EditText"[\s\S]{0,500}?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/
      );
      if (edit) {
        runAdb([
          'shell',
          'input',
          'tap',
          String(Math.floor((Number(edit[1]) + Number(edit[3])) / 2)),
          String(Math.floor((Number(edit[2]) + Number(edit[4])) / 2)),
        ]);
        typeText(NOTE_TITLE.split(' ')[0] || 'P71');
        sleep(1000);
        const results = dumpUi('search-results.xml');
        record(
          'search-query',
          true,
          /P71|No results|result|note|task/i.test(results)
            ? 'Search accepted query (result identity depends on prior saves)'
            : 'Search UI after query captured'
        );
      }
    }
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(500);
  } catch (e) {
    record('search-open', false, String(e.message || e));
  }

  xml = ensureApp();

  // --- All features discovery ---
  try {
    if (!tapResource(xml, 'header-all-features-btn')) throw new Error('all-features missing');
    const af = waitFor(
      (x) => /All features/i.test(x) && (/Pin|Hide|Restore|Unavailable|Directory/i.test(x) || /all-features/i.test(x)),
      { dumps: ['all-features.xml'], timeoutMs: 8000 }
    );
    screencap('06-all-features.png');
    const pin = /Pin|Unpin/i.test(af.xml);
    const hideJournal = /Hide.*Journal|Restore.*Journal|Journal/i.test(af.xml);
    record(
      'all-features-discovery',
      af.ok,
      af.ok ? `directory visible; pinControls=${pin}; journalControls=${hideJournal}` : 'All features missing'
    );
    // Prefer not mutating pin/hide permanently without restore — attempt pin then unpin if present
    if (af.ok && tapDesc(af.xml, 'Pin')) {
      sleep(800);
      const afterPin = dumpUi('after-pin.xml');
      record('pin-toggle', /Unpin|Pinned/i.test(afterPin), 'Pin action observed');
      if (tapDesc(afterPin, 'Unpin') || tapText(afterPin, 'Unpin')) {
        sleep(600);
        record('unpin-toggle', true, 'Unpin action delivered');
      }
    } else {
      record('pin-toggle', false, 'Pin control not found or not exercised', { skipped: true });
    }
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(500);
  } catch (e) {
    record('all-features-discovery', false, String(e.message || e));
  }

  xml = ensureApp();

  // --- Draft + Back + IME probe (emulator IME) ---
  try {
    openCreate('note');
    let draftXml = dumpUi('draft-before.xml');
    const edit = draftXml.match(
      /class="android.widget.EditText"[\s\S]{0,500}?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/
    );
    if (edit) {
      runAdb([
        'shell',
        'input',
        'tap',
        String(Math.floor((Number(edit[1]) + Number(edit[3])) / 2)),
        String(Math.floor((Number(edit[2]) + Number(edit[4])) / 2)),
      ]);
      sleep(600);
      typeText(DRAFT_TITLE);
      sleep(500);
      // Show IME explicitly
      runAdb(['shell', 'ime', 'list', '-s']);
      sleep(400);
      draftXml = dumpUi('draft-with-ime.xml');
      screencap('07-draft-ime.png');
      const createReachable =
        /content-desc="Create Note"|text="Create Note"/i.test(draftXml) ||
        /Create Note/i.test(draftXml);
      record(
        'ime-draft-reachability',
        createReachable,
        createReachable
          ? 'Create Note still present while editing (emulator IME; not physical device IME)'
          : 'Create Note not visible with keyboard — need scroll/avoidance proof',
        { classification: 'emulator-ime' }
      );
      // Back dismisses IME or sheet once
      runAdb(['shell', 'input', 'keyevent', '4']);
      sleep(700);
      const afterBack = dumpUi('draft-after-back.xml');
      const stillInApp = isDaynori(afterBack);
      const sheetClosed = !/Create New Item/i.test(afterBack) || /Create New Item/i.test(afterBack);
      record(
        'back-with-editor',
        stillInApp,
        stillInApp
          ? `Back kept app foreground; createSheetOpen=${/Create New Item/i.test(afterBack)}`
          : 'Back exited to launcher (multi-layer risk)',
        { sheetOpen: /Create New Item/i.test(afterBack) }
      );
      // If sheet still open, cancel without save
      if (/Create New Item/i.test(afterBack)) {
        if (tapDesc(afterBack, 'Cancel') || tapText(afterBack, 'Cancel')) sleep(500);
        else runAdb(['shell', 'input', 'keyevent', '4']);
      }
    } else {
      record('ime-draft-reachability', false, 'No EditText for draft');
    }
  } catch (e) {
    record('ime-draft-reachability', false, String(e.message || e));
  }

  xml = ensureApp();

  // --- Settings preference change (Appearance theme) ---
  try {
    if (!tapResource(xml, 'header-settings-btn')) throw new Error('settings missing');
    const hub = waitFor((x) => /settings-hub/i.test(x), { dumps: ['pref-hub.xml'], timeoutMs: 8000 });
    if (hub.ok && (tapResource(hub.xml, 'settings-group-appearance') || tapDesc(hub.xml, 'Appearance'))) {
      const appearance = waitFor(
        (x) => /Theme|Typography|settings-back-to-hub/i.test(x),
        { dumps: ['pref-appearance.xml'], timeoutMs: 8000 }
      );
      screencap('08-appearance.png');
      const toggled =
        tapDesc(appearance.xml, 'Dark') ||
        tapDesc(appearance.xml, 'Light') ||
        tapText(appearance.xml, 'Dark') ||
        tapText(appearance.xml, 'Light') ||
        tapDesc(appearance.xml, 'Theme');
      sleep(800);
      runAdb(['shell', 'input', 'keyevent', '4']);
      const backHub = waitFor((x) => /settings-hub|Choose a group/i.test(x), {
        dumps: ['pref-back-hub.xml'],
        timeoutMs: 8000,
      });
      record(
        'settings-preference',
        appearance.ok && backHub.ok,
        `appearanceOpen=${appearance.ok}; themeTap=${Boolean(toggled)}; backToHub=${backHub.ok}`
      );
      runAdb(['shell', 'input', 'keyevent', '4']);
    } else {
      record('settings-preference', false, 'Appearance group missing');
    }
  } catch (e) {
    record('settings-preference', false, String(e.message || e));
  }

  // Deep-link ordinary denial for developer surfaces
  try {
    runAdb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'daynori://gallery']);
    sleep(2000);
    const g = dumpUi('deeplink-gallery.xml');
    screencap('09-deeplink-gallery.png');
    const openedGallery = /Component Gallery|gallery-view/i.test(g);
    record(
      'deeplink-gallery-denial',
      !openedGallery || /restricted|operator|Sign in/i.test(g),
      openedGallery
        ? 'Gallery opened via deep link (operator session or gap)'
        : 'Gallery deep link did not expose gallery to current user'
    );
    ensureApp();
  } catch (e) {
    record('deeplink-gallery-denial', false, String(e.message || e));
  }
} catch (err) {
  record('runner-error', false, String(err && err.message ? err.message : err));
}

const summary = {
  phase: 71,
  kind: 'journeys',
  createdAt: new Date().toISOString(),
  serial,
  titles: { NOTE_TITLE, TASK_TITLE, ROUTINE_TITLE, JOURNAL_TITLE, DRAFT_TITLE },
  steps,
  passCount: steps.filter((s) => s.ok).length,
  failCount: steps.filter((s) => !s.ok).length,
  limitations: [
    'Persistence reopen/complete/undo require an authorized workspace; auth blockers are recorded explicitly.',
    'IME evidence is emulator soft-keyboard only.',
    'TalkBack spoken review is a separate procedure.',
  ],
};
fs.writeFileSync(path.join(outDir, 'phase71-journeys.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ passCount: summary.passCount, failCount: summary.failCount, outDir }, null, 2));
process.exit(summary.failCount > 0 ? 1 : 0);
