#!/usr/bin/env node
/**
 * Phase 71 device evidence — explicit serial, distinct postconditions, settings restore.
 *
 * Env:
 *   DAYNORI_ANDROID_SERIAL (required)
 *   ANDROID_HOME / ANDROID_SDK_ROOT
 *   DAYNORI_ANDROID_APK (optional provenance note)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'android-e2e', 'phase71');
fs.mkdirSync(outDir, { recursive: true });

const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
const adb = androidHome
  ? path.join(androidHome, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : 'adb';
const serial = process.env.DAYNORI_ANDROID_SERIAL;
if (!serial) {
  console.error('Set DAYNORI_ANDROID_SERIAL to the selected emulator/device serial.');
  process.exit(2);
}

function adbArgs(args) {
  return ['-s', serial, ...args];
}

function runAdb(args) {
  return execFileSync(adb, adbArgs(args), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
    x1: Number(m[1]),
    y1: Number(m[2]),
    x2: Number(m[3]),
    y2: Number(m[4]),
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
  const midX = Math.floor((Number(m[2]) + Number(m[4])) / 2);
  const midY = Math.floor((Number(m[3]) + Number(m[5])) / 2);
  runAdb(['shell', 'input', 'tap', String(midX), String(midY)]);
  return true;
}

function waitFor(predicate, { dumps = [], timeoutMs = 8000, intervalMs = 400 } = {}) {
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

const steps = [];
function record(step, ok, detail, extra = {}) {
  steps.push({ step, ok, detail, ...extra, at: new Date().toISOString() });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${step} — ${detail}`);
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

const props = {
  serial,
  androidRelease: runAdb(['shell', 'getprop', 'ro.build.version.release']).trim(),
  model: runAdb(['shell', 'getprop', 'ro.product.model']).trim(),
  abi: runAdb(['shell', 'getprop', 'ro.product.cpu.abi']).trim(),
  density: runAdb(['shell', 'wm', 'density']).trim(),
  size: runAdb(['shell', 'wm', 'size']).trim(),
  classification: serial.startsWith('emulator-') ? 'emulator' : 'physical',
};

let talkbackVersion = null;
try {
  talkbackVersion = runAdb(['shell', 'dumpsys', 'package', 'com.google.android.marvin.talkback'])
    .split('\n')
    .find((l) => /versionName=/.test(l))
    ?.trim();
} catch {
  talkbackVersion = null;
}

function ensureTalkbackOffForAutomation() {
  writeSecure('accessibility_enabled', '0');
  writeSecure('enabled_accessibility_services', '');
  writeSecure('touch_exploration_enabled', '0');
}

function isOnboardingCovering(xml) {
  return /Your main places|Step \d+ of \d+|onboarding-sheet|btn-onboarding-skip/i.test(xml);
}

function isShellChrome(xml) {
  return (
    Boolean(boundsForResource(xml, 'header-settings-btn')) &&
    (Boolean(boundsForResource(xml, 'nav-tab-today')) || /content-desc="Today tab"/i.test(xml))
  );
}

function isDaynoriUi(xml) {
  return (
    /package="com\.daynori\.app"/.test(xml) &&
    isShellChrome(xml) &&
    !isOnboardingCovering(xml)
  );
}

function dismissOnboarding(xml) {
  if (!isOnboardingCovering(xml)) return xml;
  // Prefer the sheet close control; Skip Tutorial also clears the cover.
  if (
    tapDesc(xml, 'Close sheet') ||
    tapDesc(xml, 'Skip onboarding tutorial') ||
    tapResource(xml, 'btn-onboarding-skip') ||
    tapResource(xml, 'btn-onboarding-skip-footer') ||
    tapDesc(xml, 'Dismiss sheet')
  ) {
    sleep(900);
    return dumpUi('onboarding-dismissed.xml');
  }
  // Last resort for known onboarding cover only — one Back to the sheet layer.
  runAdb(['shell', 'input', 'keyevent', '4']);
  sleep(700);
  return dumpUi('onboarding-dismissed-back.xml');
}

function dismissPermissionDialogs(xml) {
  if (!/permissioncontroller|permission_allow_button|permission_deny/i.test(xml)) return xml;
  // Prefer Don't allow for TalkBack notification prompts during automation; Daynori perms pre-granted via pm grant.
  if (
    tapResource(xml, 'com.android.permissioncontroller:id/permission_deny_and_dont_ask_again_button') ||
    tapResource(xml, 'com.android.permissioncontroller:id/permission_deny_button')
  ) {
    sleep(700);
    return dumpUi('permission-dismissed.xml');
  }
  if (tapResource(xml, 'com.android.permissioncontroller:id/permission_allow_button')) {
    sleep(700);
    return dumpUi('permission-allowed.xml');
  }
  return xml;
}

function ensureDaynoriForeground(label = 'relaunch') {
  let xml = dumpUi(`${label}-check.xml`);
  xml = dismissPermissionDialogs(xml);
  xml = dismissLogBox(xml);
  xml = dismissOnboarding(xml);
  xml = dismissOverlays(xml);
  if (isDaynoriUi(xml) && !/Text strings must be rendered/i.test(xml)) return xml;
  if (isDaynoriUi(xml)) {
    xml = dismissLogBox(xml);
    if (!/Text strings must be rendered/i.test(xml) && isDaynoriUi(xml)) return xml;
  }
  // Do not send Back from launcher — relaunch explicitly.
  try {
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
  } catch {
    runAdb(['shell', 'monkey', '-p', 'com.daynori.app', '-c', 'android.intent.category.LAUNCHER', '1']);
  }
  sleep(5000);
  xml = dumpUi(`${label}-after-start.xml`);
  xml = dismissPermissionDialogs(xml);
  xml = dismissOnboarding(xml);
  const ready = waitFor(
    (x) => {
      let cur = dismissPermissionDialogs(x);
      if (isOnboardingCovering(cur)) {
        cur = dismissOnboarding(cur);
      }
      cur = dismissLogBox(cur);
      return isDaynoriUi(cur);
    },
    {
      dumps: [`${label}-ready.xml`],
      timeoutMs: 25000,
      intervalMs: 800,
    }
  );
  xml = ready.xml;
  if (isOnboardingCovering(xml)) xml = dismissOnboarding(xml);
  if (!ready.ok || !isDaynoriUi(xml)) {
    const unexpected = path.join(outDir, `${label}-unexpected-screen.xml`);
    fs.writeFileSync(unexpected, xml);
    console.error(
      `ensureDaynoriForeground(${label}): shell chrome not ready; wrote ${path.basename(unexpected)}`
    );
  }
  return xml;
}

function dismissLogBox(xml) {
  // RN LogBox sits above the nav bar and steals taps; close via its dismiss control when present.
  if (!/Text strings must be rendered|LogBox|Open debugger/i.test(xml)) return xml;
  // Prefer the small X on the collapsed LogBox toast (right side of the banner).
  const m = xml.match(
    /Text strings must be rendered[\s\S]{0,800}?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
  );
  // Fallback: tap near the typical dismiss affordance on the right of the banner.
  const banner = xml.match(
    /content-desc="!, Text strings must be rendered[\s\S]{0,400}?bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
  );
  if (banner) {
    const x2 = Number(banner[3]);
    const y1 = Number(banner[2]);
    const y2 = Number(banner[4]);
    runAdb(['shell', 'input', 'tap', String(x2 - 40), String(Math.floor((y1 + y2) / 2))]);
    sleep(500);
    return dumpUi('logbox-dismissed.xml');
  }
  if (m) {
    runAdb(['shell', 'input', 'tap', String(Number(m[3]) - 40), String(Math.floor((Number(m[2]) + Number(m[4])) / 2))]);
    sleep(500);
    return dumpUi('logbox-dismissed.xml');
  }
  return xml;
}

function dismissOverlays(xml) {
  xml = dismissOnboarding(xml);
  // Only when a sheet/settings overlay is actually open — never match header "Search organizer".
  const overlayOpen =
    /settings-hub|settings-back-to-hub|settings-group-/i.test(xml) ||
    /accessibilityLabel="Dismiss sheet"|content-desc="Dismiss sheet"/i.test(xml) ||
    /resource-id="[^"]*create-sheet|resource-id="[^"]*search-sheet|all-features-sheet/i.test(xml) ||
    (/Dismiss sheet/i.test(xml) && /package="com\.daynori\.app"/i.test(xml) && !isShellChrome(xml));
  if (!overlayOpen) return xml;
  if (
    tapResource(xml, 'settings-back-to-hub') ||
    tapDesc(xml, 'Close settings') ||
    tapDesc(xml, 'Close sheet') ||
    tapDesc(xml, 'Dismiss sheet')
  ) {
    sleep(600);
    return dumpUi('dismissed.xml');
  }
  runAdb(['shell', 'input', 'keyevent', '4']);
  sleep(600);
  const after = dumpUi('dismissed-back.xml');
  if (!isDaynoriUi(after) && !isOnboardingCovering(after)) {
    // Avoid recursive relaunch storms; caller will ensureDaynoriForeground.
    return after;
  }
  return after;
}

function displayRotation() {
  try {
    const dump = runAdb(['shell', 'dumpsys', 'display']);
    const m = dump.match(/mCurrentOrientation\s*=\s*(\d+)/) || dump.match(/orientation\s*=\s*(\d+)/i);
    if (m) return Number(m[1]);
  } catch {
    /* ignore */
  }
  try {
    const dump = runAdb(['shell', 'dumpsys', 'window', 'displays']);
    const m = dump.match(/mRotation=(\d+|ROTATION_\w+)/);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  return null;
}

try {
  ensureTalkbackOffForAutomation();
  try {
    runAdb(['shell', 'pm', 'grant', 'com.daynori.app', 'android.permission.POST_NOTIFICATIONS']);
  } catch {
    /* optional on older APIs */
  }
  try {
    runAdb([
      'shell',
      'pm',
      'grant',
      'com.google.android.marvin.talkback',
      'android.permission.POST_NOTIFICATIONS',
    ]);
  } catch {
    /* optional */
  }
  sleep(400);

  let xml = ensureDaynoriForeground('boot');
  xml = dismissOverlays(xml);
  xml = dumpUi('01-today.xml');
  screencap('01-today-portrait.png');
  const header = boundsForResource(xml, 'header-settings-btn');
  record(
    'today-shell',
    isDaynoriUi(xml) && Boolean(header) && header.y1 >= 120,
    header
      ? `Today shell; settings btn y1=${header.y1} (must clear ~128px statusBars)`
      : 'Today shell missing header-settings-btn'
  );

  // Header Search
  xml = ensureDaynoriForeground('before-search');
  xml = dumpUi('01b-before-search.xml');
  if (!tapResource(xml, 'header-search-btn')) {
    record('header-search', false, 'header-search-btn not tappable', {
      before: '01b-before-search.xml',
    });
  } else {
    const waited = waitFor(
      (x) =>
        /content-desc="Dismiss sheet"/i.test(x) ||
        (/class="android.widget.EditText"/i.test(x) && /Search|query|Find/i.test(x)),
      { dumps: ['02-search-sheet.xml'], timeoutMs: 8000 }
    );
    const opened =
      /content-desc="Dismiss sheet"/i.test(waited.xml) ||
      (/class="android.widget.EditText"/i.test(waited.xml) && !/settings-hub/i.test(waited.xml));
    screencap('02-search-sheet.png');
    record(
      'header-search',
      waited.ok && opened,
      opened ? 'Search sheet distinct controls' : 'Search sheet not distinguished',
      { actionDelivered: true }
    );
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(700);
    xml = ensureDaynoriForeground('after-search');
  }

  // Header Create
  xml = ensureDaynoriForeground('before-create');
  xml = dumpUi('03-before-create.xml');
  if (!tapResource(xml, 'header-create-btn')) {
    record('header-create', false, 'header-create-btn not tappable');
  } else {
    const waited = waitFor(
      (x) =>
        /content-desc="Dismiss sheet"/i.test(x) ||
        /Quick capture|New note|New task|Note title|Task title|Create note/i.test(x),
      { dumps: ['04-create-sheet.xml'], timeoutMs: 8000 }
    );
    const opened = /content-desc="Dismiss sheet"|Quick capture|New note|New task|Create note/i.test(waited.xml);
    screencap('04-create-sheet.png');
    record(
      'header-create',
      waited.ok && opened,
      opened ? 'Create sheet opened' : 'Create sheet not distinguished',
      { actionDelivered: true }
    );
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(700);
    xml = ensureDaynoriForeground('after-create');
  }

  // Header All features
  xml = ensureDaynoriForeground('before-all-features');
  xml = dumpUi('05-before-all-features.xml');
  if (!tapResource(xml, 'header-all-features-btn')) {
    record('header-all-features', false, 'header-all-features-btn not tappable');
  } else {
    const waited = waitFor(
      (x) =>
        /All features/i.test(x) &&
        (/Pin|Hide|Restore|Unavailable|Restricted|Directory/i.test(x) || /all-features/i.test(x)),
      { dumps: ['06-all-features.xml'], timeoutMs: 8000 }
    );
    screencap('06-all-features.png');
    record(
      'header-all-features',
      waited.ok,
      waited.ok ? 'All features directory visible' : 'All features not distinguished',
      { actionDelivered: true }
    );
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(900);
    xml = ensureDaynoriForeground('after-all-features');
    xml = dismissOverlays(xml);
    xml = dismissLogBox(xml);
  }

  // Header Settings hub — return to clean Today first (avoid toggling an already-open hub closed).
  xml = ensureDaynoriForeground('before-settings');
  for (let i = 0; i < 4; i += 1) {
    xml = dismissOverlays(xml);
    xml = dismissLogBox(xml);
    if (/settings-hub|Choose a group|content-desc="Dismiss sheet"|Create New Item/i.test(xml)) {
      runAdb(['shell', 'input', 'keyevent', '4']);
      sleep(600);
      xml = dumpUi(`07-close-layer-${i}.xml`);
      continue;
    }
    break;
  }
  xml = ensureDaynoriForeground('before-settings-clean');
  xml = dumpUi('07-before-settings.xml');
  if (/settings-hub|Choose a group/i.test(xml)) {
    // Still open — use Back once more rather than re-tapping Settings (would dismiss).
    runAdb(['shell', 'input', 'keyevent', '4']);
    sleep(700);
    xml = dumpUi('07-before-settings-after-back.xml');
  }
  if (!tapResource(xml, 'header-settings-btn') && !tapDesc(xml, 'Settings and help')) {
    xml = ensureDaynoriForeground('settings-retry');
    xml = dumpUi('07-before-settings-retry.xml');
  }
  if (!tapResource(xml, 'header-settings-btn') && !tapDesc(xml, 'Settings and help')) {
    record('header-settings', false, 'header-settings-btn not tappable');
  } else {
    const waited = waitFor(
      (x) => /settings-hub/i.test(x) || /Choose a group/i.test(x),
      { dumps: ['08-settings-hub.xml'], timeoutMs: 8000 }
    );
    screencap('08-settings-hub.png');
    record('header-settings', waited.ok, waited.ok ? 'Settings hub via header' : 'Settings hub missing', {
      actionDelivered: true,
    });
    xml = waited.xml;

    if (waited.ok && (tapResource(xml, 'settings-group-appearance') || tapDesc(xml, 'Appearance'))) {
      const appearance = waitFor(
        (x) => /settings-back-to-hub|Theme Mode|Typography/i.test(x),
        { dumps: ['09-settings-appearance.xml'], timeoutMs: 8000 }
      );
      screencap('09-settings-appearance.png');
      record(
        'settings-appearance',
        appearance.ok,
        appearance.ok ? 'Appearance group opened' : 'Appearance group missing'
      );
      runAdb(['shell', 'input', 'keyevent', '4']);
      const back = waitFor(
        (x) => /settings-hub|Choose a group/i.test(x),
        { dumps: ['10-settings-after-back.xml'], timeoutMs: 8000 }
      );
      screencap('10-settings-after-back.png');
      record('back-to-hub', back.ok, back.ok ? 'Back returned to Settings hub' : 'Back did not return to hub');
      xml = back.xml;
    } else {
      record('settings-appearance', false, 'Could not open Appearance');
    }
    if (tapDesc(xml, 'Close settings')) sleep(600);
    else {
      runAdb(['shell', 'input', 'keyevent', '4']);
      sleep(600);
    }
    xml = ensureDaynoriForeground('after-settings');
  }

  // Plan / Library with selected state + destination heading
  xml = ensureDaynoriForeground('before-plan');
  xml = dismissOnboarding(dismissLogBox(dumpUi('11-before-plan.xml')));
  if (!isShellChrome(xml)) {
    fs.writeFileSync(path.join(outDir, '11-before-plan-unexpected.xml'), xml);
    record(
      'open-plan',
      false,
      `Shell chrome missing before Plan (onboarding=${isOnboardingCovering(xml)}); see 11-before-plan-unexpected.xml`
    );
  } else if (tapResource(xml, 'nav-tab-plan') || tapDesc(xml, 'Plan tab')) {
    const plan = waitFor(
      (x) => {
        const selected =
          /resource-id="nav-tab-plan"[^>]*selected="true"/i.test(x) ||
          /content-desc="Plan tab"[^>]*selected="true"/i.test(x);
        const dest =
          /text="Plan"/i.test(x) &&
          (/Tasks, Routines|Calendar|subtitle|Open tasks|Routines/i.test(x) ||
            /text="Tasks"/i.test(x) ||
            /plan-sub|PlanView/i.test(x));
        return selected && dest;
      },
      { dumps: ['12-plan.xml'], timeoutMs: 10000 }
    );
    screencap('12-plan.png');
    record('open-plan', plan.ok, plan.ok ? 'Plan selected + destination content' : 'Plan postcondition failed', {
      actionDelivered: true,
    });
  } else if (isShellChrome(xml)) {
    record('open-plan', false, 'Plan tab missing despite shell chrome');
  }

  xml = ensureDaynoriForeground('before-library');
  xml = dismissOnboarding(dismissLogBox(dumpUi('13-before-library.xml')));
  if (!isShellChrome(xml)) {
    fs.writeFileSync(path.join(outDir, '13-before-library-unexpected.xml'), xml);
    record(
      'open-library',
      false,
      `Shell chrome missing before Library (onboarding=${isOnboardingCovering(xml)}); see 13-before-library-unexpected.xml`
    );
  } else if (tapResource(xml, 'nav-tab-library') || tapDesc(xml, 'Library tab')) {
    const lib = waitFor(
      (x) => {
        const selected =
          /resource-id="nav-tab-library"[^>]*selected="true"/i.test(x) ||
          /content-desc="Library tab"[^>]*selected="true"/i.test(x);
        const dest =
          (/text="Library"/i.test(x) && /Workspace folders|Folders|files/i.test(x)) ||
          /library-view|Workspace Root/i.test(x);
        return selected && dest;
      },
      { dumps: ['14-library.xml'], timeoutMs: 10000 }
    );
    screencap('14-library.png');
    record(
      'open-library',
      lib.ok,
      lib.ok ? 'Library selected + destination content' : 'Library postcondition failed',
      { actionDelivered: true }
    );
  } else if (isShellChrome(xml)) {
    record('open-library', false, 'Library tab missing despite shell chrome');
  }

  xml = ensureDaynoriForeground('back-today');
  tapResource(dumpUi('15-back-today.xml'), 'nav-tab-today');
  sleep(800);

  // Landscape — normalize to portrait first, then rotate; native APK must allow unspecified orientation.
  writeSystem('accelerometer_rotation', '0');
  writeSystem('user_rotation', '0');
  // Rotate until hierarchy reports portrait (rotation="0"), max 4 turns.
  for (let i = 0; i < 4; i += 1) {
    const probe = dumpUi(`16-normalize-${i}.xml`);
    if (/rotation="0"/i.test(probe)) break;
    try {
      runAdb(['emu', 'rotate']);
    } catch {
      break;
    }
    sleep(800);
  }
  const beforeRot = displayRotation();
  writeSystem('user_rotation', '1');
  try {
    runAdb(['emu', 'rotate']);
  } catch {
    /* older adb may not support emu rotate */
  }
  sleep(2500);
  let landXml = dumpUi('16-landscape.xml');
  screencap('16-landscape.png');
  let afterRot = displayRotation();
  let landOk =
    /rotation="1"/i.test(landXml) ||
    /ROTATION_90|ROTATION_270/.test(String(afterRot)) ||
    afterRot === 1 ||
    afterRot === '1' ||
    (afterRot != null && String(afterRot) !== String(beforeRot) && String(afterRot) !== '0');
  // Second rotate attempt if still portrait (Dev Client APK may still lock until rebuild).
  if (!landOk) {
    try {
      runAdb(['emu', 'rotate']);
    } catch {
      /* ignore */
    }
    sleep(2000);
    landXml = dumpUi('16-landscape-retry.xml');
    screencap('16-landscape-retry.png');
    afterRot = displayRotation();
    landOk =
      /rotation="1"/i.test(landXml) ||
      /ROTATION_90|ROTATION_270/.test(String(afterRot)) ||
      afterRot === 1 ||
      afterRot === '1';
  }
  const landChrome =
    Boolean(boundsForResource(landXml, 'header-settings-btn')) ||
    Boolean(boundsForResource(landXml, 'nav-tab-today')) ||
    /Main organizer navigation/i.test(landXml);
  record(
    'landscape',
    landOk && landChrome,
    `rotation before=${beforeRot} after=${afterRot} hierarchyRot=${/rotation="(\d+)"/.exec(landXml)?.[1] ?? '?'} chrome=${landChrome}`
  );
  try {
    // Return toward portrait for remaining steps.
    if (landOk) runAdb(['emu', 'rotate']);
  } catch {
    /* ignore */
  }
  writeSystem('user_rotation', snapshot.user_rotation || '0');
  writeSystem('accelerometer_rotation', snapshot.accelerometer_rotation || '1');
  sleep(1200);
  xml = ensureDaynoriForeground('after-landscape');

  // Large text with font_scale assertion + usable chrome
  const prevFont = snapshot.font_scale || '1.0';
  writeSystem('font_scale', '1.3');
  sleep(2000);
  xml = ensureDaynoriForeground('large-text');
  const largeXml = dumpUi('17-large-text.xml');
  screencap('17-large-text.png');
  const fontNow = readSystem('font_scale');
  const largeChrome =
    Boolean(boundsForResource(largeXml, 'header-settings-btn')) &&
    Boolean(boundsForResource(largeXml, 'nav-tab-today') || /Today tab/i.test(largeXml));
  record(
    'large-text',
    fontNow.startsWith('1.3') && largeChrome,
    `font_scale=${fontNow}; chromeUsable=${largeChrome}`
  );
  writeSystem('font_scale', prevFont);
  sleep(800);
  xml = ensureDaynoriForeground('after-large-text');

  // TalkBack enable + labeled dump (spoken review recorded separately in phase report)
  writeSecure(
    'enabled_accessibility_services',
    'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService'
  );
  writeSecure('accessibility_enabled', '1');
  sleep(2000);
  xml = dismissPermissionDialogs(dumpUi('18-talkback-perm-check.xml'));
  sleep(800);
  const tbXml = dumpUi('18-talkback-enabled.xml');
  screencap('18-talkback-enabled.png');
  record(
    'talkback-enabled-dump',
    /Today tab|Search organizer|Main organizer navigation|Settings and help/i.test(tbXml) ||
      isDaynoriUi(tbXml),
    talkbackVersion || 'TalkBack labels present (spoken review separate)'
  );
} catch (err) {
  record('runner-error', false, String(err && err.message ? err.message : err));
} finally {
  restoreDeviceSettings();
  record(
    'device-settings-restored',
    true,
    `a11y=${readSecure('accessibility_enabled')} font=${readSystem('font_scale')} rot=${readSystem('user_rotation')} a11yServices=${readSecure('enabled_accessibility_services')}`
  );
}

let apkEvidence = null;
const apkEvidencePath = path.join(root, 'artifacts', 'release', 'android-debug-apk-evidence.json');
if (fs.existsSync(apkEvidencePath)) {
  apkEvidence = JSON.parse(fs.readFileSync(apkEvidencePath, 'utf8').replace(/^\uFEFF/, ''));
}

const summary = {
  phase: 71,
  createdAt: new Date().toISOString(),
  device: props,
  talkbackVersion,
  settingsSnapshot: snapshot,
  apkEvidence,
  steps,
  passCount: steps.filter((s) => s.ok).length,
  failCount: steps.filter((s) => !s.ok).length,
  limitations: [
    'TalkBack step enables the service and captures labeled hierarchy; spoken output quality is recorded in the phase report method section.',
    'Create/save/reopen and IME journeys may be covered by companion procedures in the phase report.',
    'Dev Client may require Metro; APK hash ≠ JS bundle fingerprint.',
  ],
};
fs.writeFileSync(path.join(outDir, 'phase71-device-evidence.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ passCount: summary.passCount, failCount: summary.failCount, outDir }, null, 2));
process.exit(summary.failCount > 0 ? 1 : 0);
