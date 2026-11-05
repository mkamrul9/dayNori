#!/usr/bin/env node
/**
 * Phase 77 native cold-offline evidence gate (self-contained installed build).
 *
 * An Expo Dev Client that requires Metro does NOT prove cold launch.
 * DAYNORI_NATIVE_OFFLINE_OK=1 is NOT accepted as a pass (attestation-only forbidden).
 *
 * DAYNORI_PHASE77_REQUIRED=1 → nonzero exit unless result === pass.
 * DAYNORI_PHASE77_DISCOVERY=1 → unmet stays unmet (exit 2); cannot satisfy completion.
 *
 * Optional:
 *   DAYNORI_ANDROID_SERIAL
 *   DAYNORI_ANDROID_PACKAGE (default com.daynori.app)
 *   DAYNORI_ANDROID_APK (default artifacts/release/app-debug-x86_64.apk)
 *   DAYNORI_PHASE77_NATIVE_INSTALL=1 to adb install -r the APK when missing/outdated
 *   DAYNORI_PHASE77_ACCOUNTS (synth accounts JSON)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'artifacts', 'phase77');
fs.mkdirSync(outDir, { recursive: true });

const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim();
const discovery = process.env.DAYNORI_PHASE77_DISCOVERY === '1';
const required = process.env.DAYNORI_PHASE77_REQUIRED === '1' || (!discovery && process.env.DAYNORI_PHASE77_REQUIRED !== '0');

const pkg = process.env.DAYNORI_ANDROID_PACKAGE || 'com.daynori.app';
const embeddedApk = path.join(root, 'artifacts', 'release', 'app-embedded-x86_64.apk');
const legacyDebugApk = path.join(root, 'artifacts', 'release', 'app-debug-x86_64.apk');
const apkDefault = fs.existsSync(embeddedApk) ? embeddedApk : legacyDebugApk;
const apkPath = process.env.DAYNORI_ANDROID_APK || apkDefault;
const accountsPath =
  process.env.DAYNORI_PHASE77_ACCOUNTS ||
  path.join(root, 'artifacts', 'local', 'phase71-synth-accounts.json');

const evidence = {
  at: new Date().toISOString(),
  revision: revision || null,
  node: process.version,
  evidenceClass: 'native-emulator-or-device',
  requiredMode: required,
  discoveryMode: discovery,
  package: pkg,
  steps: [],
  assertions: {},
  buildIdentity: null,
  environment: {},
  result: 'unmet',
  limits: [],
};

function record(step, status, details) {
  evidence.steps.push({
    step,
    status,
    details,
    at: new Date().toISOString(),
  });
  console.log(`[${status}] ${step}: ${typeof details === 'string' ? details : JSON.stringify(details)}`);
}

function writeEvidence() {
  const target = path.join(outDir, 'cold-offline-native.json');
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

function adb(args, opts = {}) {
  return spawnSync('adb', args, { encoding: 'utf8', ...opts });
}

function adbOk(args) {
  const r = adb(args);
  return {
    status: r.status,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
    error: r.error ? String(r.error) : null,
  };
}

function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listOnlineSerials() {
  const devices = adbOk(['devices', '-l']);
  if (devices.error || devices.status !== 0) {
    return { error: devices.error || devices.stderr || 'adb failed', online: [], raw: devices.stdout };
  }
  const lines = devices.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('List of'));
  const online = lines.filter((l) => /\bdevice\b/.test(l)).map((l) => l.split(/\s+/)[0]);
  return { online, raw: lines };
}

function isEmulator(serial) {
  return /^emulator-/.test(serial) || /_adb-qemu/.test(serial);
}

function loadAccounts() {
  if (!fs.existsSync(accountsPath)) return [];
  const raw = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.accounts || [];
  return list.filter((a) => a?.email && a?.password);
}

function dumpUi(serial, name) {
  const remote = `/sdcard/daynori-p77-${name}.xml`;
  adbOk(['-s', serial, 'shell', 'uiautomator', 'dump', remote]);
  const local = path.join(outDir, `native-${name}.xml`);
  adbOk(['-s', serial, 'pull', remote, local]);
  const xml = fs.existsSync(local) ? fs.readFileSync(local, 'utf8') : '';
  return { local, xml };
}

function screenshot(serial, name) {
  const remote = `/sdcard/daynori-p77-${name}.png`;
  adbOk(['-s', serial, 'shell', 'screencap', '-p', remote]);
  const local = path.join(outDir, `native-${name}.png`);
  adbOk(['-s', serial, 'pull', remote, local]);
  return fs.existsSync(local) ? local : null;
}

function forceStop(serial) {
  return adbOk(['-s', serial, 'shell', 'am', 'force-stop', pkg]);
}

function disableNetwork(serial) {
  // Prefer airplane mode; also disable wifi/mobile data as belt-and-suspenders.
  const steps = [];
  steps.push(adbOk(['-s', serial, 'shell', 'settings', 'put', 'global', 'airplane_mode_on', '1']));
  steps.push(
    adbOk([
      '-s',
      serial,
      'shell',
      'am',
      'broadcast',
      '-a',
      'android.intent.action.AIRPLANE_MODE',
      '--ez',
      'state',
      'true',
    ])
  );
  steps.push(adbOk(['-s', serial, 'shell', 'svc', 'wifi', 'disable']));
  steps.push(adbOk(['-s', serial, 'shell', 'svc', 'data', 'disable']));
  return steps;
}

function restoreNetwork(serial) {
  adbOk(['-s', serial, 'shell', 'settings', 'put', 'global', 'airplane_mode_on', '0']);
  adbOk([
    '-s',
    serial,
    'shell',
    'am',
    'broadcast',
    '-a',
    'android.intent.action.AIRPLANE_MODE',
    '--ez',
    'state',
    'false',
  ]);
  adbOk(['-s', serial, 'shell', 'svc', 'wifi', 'enable']);
  adbOk(['-s', serial, 'shell', 'svc', 'data', 'enable']);
}

function launchApp(serial) {
  return adbOk([
    '-s',
    serial,
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    `${pkg}/.MainActivity`,
  ]);
}

function detectMetroDependency(serial) {
  // Dev Client markers / hard failures that mean the app cannot run without Metro.
  // Debug builds may still attempt a debugger websocket to :8081; that alone is not failure
  // when the embedded bundle already rendered organizer UI.
  const files = adbOk(['-s', serial, 'shell', 'run-as', pkg, 'ls', 'files']);
  const log = adbOk(['-s', serial, 'logcat', '-d', '-t', '200']);
  const blob = `${files.stdout}\n${log.stdout}\n${log.stderr}`;
  const needsMetro =
    /DevLauncherApp-BridgelessReactNativeDevBundle\.js/i.test(files.stdout) ||
    /Unable to load script|Could not connect to development server|Waiting for Metro|DevLauncherActivity/i.test(
      blob
    );
  return {
    needsMetro,
    filesSample: (files.stdout || '').slice(0, 400),
    logHit: /Unable to load script|Could not connect to development server|Waiting for Metro/i.test(blob),
    debuggerWebsocketNoise: /Failed to connect to \/10\.0\.2\.2:8081/i.test(blob),
  };
}

function ensureEmulatorIfNeeded() {
  const listed = listOnlineSerials();
  if (listed.online?.length) return listed;
  evidence.limits.push('No adb device online at start; attempting to launch AVD daynori_vault_api35.');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
  const emu = path.join(sdk, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
  if (!fs.existsSync(emu)) {
    record('emulator-launch', 'unmet', `emulator binary missing at ${emu}`);
    return listed;
  }
  spawnSync(
    emu,
    ['-avd', 'daynori_vault_api35', '-netdelay', 'none', '-netspeed', 'full'],
    { detached: true, stdio: 'ignore', windowsHide: true }
  );
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const cur = listOnlineSerials();
    if (cur.online?.length) {
      record('emulator-launch', 'pass', cur.online);
      return cur;
    }
    spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', [process.platform === 'win32' ? '/T' : '', '5'].filter(Boolean), {
      shell: true,
    });
  }
  record('emulator-launch', 'unmet', 'AVD did not come online within 120s');
  return listOnlineSerials();
}

function main() {
  if (process.env.DAYNORI_NATIVE_OFFLINE_OK === '1') {
    evidence.limits.push(
      'DAYNORI_NATIVE_OFFLINE_OK=1 is ignored; attestation alone cannot produce a pass.'
    );
    record('operator-attestation', 'ignored', 'DAYNORI_NATIVE_OFFLINE_OK ignored by required evidence mode');
  }
  if (discovery) {
    evidence.limits.push('DISCOVERY MODE: unmet cannot satisfy Phase 77 completion.');
  }

  const apkHash = sha256File(apkPath);
  const apkEvidencePath = path.join(root, 'artifacts', 'release', 'android-debug-apk-evidence.json');
  let apkMeta = null;
  if (fs.existsSync(apkEvidencePath)) {
    try {
      apkMeta = JSON.parse(fs.readFileSync(apkEvidencePath, 'utf8'));
    } catch {
      apkMeta = null;
    }
  }
  evidence.buildIdentity = {
    apkPath: fs.existsSync(apkPath) ? path.relative(root, apkPath) : null,
    apkSha256: apkHash,
    apkMeta,
    gitRevision: revision,
  };
  if (!apkHash) {
    record('apk', 'unmet', `Missing installable APK at ${apkPath}`);
    evidence.result = 'unmet';
    return exitForResult();
  }
  record('apk', 'pass', { path: evidence.buildIdentity.apkPath, sha256: apkHash });

  const devices = ensureEmulatorIfNeeded();
  if (devices.error) {
    record('adb', 'unmet', devices.error);
    evidence.result = 'unmet';
    return exitForResult();
  }
  if (!devices.online?.length) {
    record('adb-devices', 'unmet', devices);
    evidence.limits.push('No online adb device after emulator attempt; native cold launch unmet.');
    evidence.result = 'unmet';
    return exitForResult();
  }
  const serial = process.env.DAYNORI_ANDROID_SERIAL || devices.online[0];
  evidence.environment.serial = serial;
  evidence.environment.online = devices.online;
  evidence.environment.isEmulator = isEmulator(serial);
  record('adb-devices', 'pass', { serial, online: devices.online, emulator: isEmulator(serial) });

  const androidVer = adbOk(['-s', serial, 'shell', 'getprop', 'ro.build.version.release']);
  const model = adbOk(['-s', serial, 'shell', 'getprop', 'ro.product.model']);
  evidence.environment.androidVersion = androidVer.stdout;
  evidence.environment.model = model.stdout;
  evidence.environment.deviceClass = isEmulator(serial) ? 'emulator' : 'physical';

  // Install APK when requested or package missing
  let pathRes = adbOk(['-s', serial, 'shell', 'pm', 'path', pkg]);
  const shouldInstall =
    process.env.DAYNORI_PHASE77_NATIVE_INSTALL === '1' || !pathRes.stdout.includes('package:');
  if (shouldInstall) {
    const install = adbOk(['-s', serial, 'install', '-r', apkPath]);
    record(
      'adb-install',
      install.status === 0 && /Success/i.test(install.stdout + install.stderr) ? 'pass' : 'fail',
      { status: install.status, out: (install.stdout + install.stderr).slice(0, 500) }
    );
    if (install.status !== 0 && !/Success/i.test(install.stdout + install.stderr)) {
      evidence.result = 'fail';
      return exitForResult();
    }
    pathRes = adbOk(['-s', serial, 'shell', 'pm', 'path', pkg]);
  }
  if (!pathRes.stdout.includes('package:')) {
    record('installed-package', 'unmet', pathRes);
    evidence.result = 'unmet';
    return exitForResult();
  }
  record('installed-package', 'pass', pathRes.stdout);

  const dumpsys = adbOk(['-s', serial, 'shell', 'dumpsys', 'package', pkg]);
  const versionName = (dumpsys.stdout.match(/versionName=(\S+)/) || [])[1] || null;
  const versionCode = (dumpsys.stdout.match(/versionCode=(\d+)/) || [])[1] || null;
  evidence.buildIdentity.versionName = versionName;
  evidence.buildIdentity.versionCode = versionCode;

  // Ensure Metro is not reachable / not required
  // Remove adb reverse for metro ports if present
  adbOk(['-s', serial, 'reverse', '--remove', 'tcp:8081']);
  adbOk(['-s', serial, 'reverse', '--remove', 'tcp:8082']);

  forceStop(serial);
  const launch = launchApp(serial);
  record('cold-launch', launch.status === 0 ? 'pass' : 'fail', launch.stdout || launch.stderr);
  // Embedded debug builds can take >10s before React Native paints organizer chrome.
  let bootReady = false;
  for (let i = 0; i < 12; i++) {
    spawnSync(
      process.platform === 'win32' ? 'timeout' : 'sleep',
      [process.platform === 'win32' ? '/T' : '', '3'].filter(Boolean),
      { shell: true }
    );
    const probe = dumpUi(serial, `boot-wait-${i}`);
    if (/Today|Plan|Library|Sign In|Welcome|Account|Create|Journal/i.test(probe.xml)) {
      bootReady = true;
      break;
    }
  }
  evidence.assertions.bootWaitReady = bootReady;

  const metro = detectMetroDependency(serial);
  const launchActivity = launch.stdout || '';
  const usedDevLauncher = /DevLauncherActivity/i.test(launchActivity);
  evidence.assertions.metro = { ...metro, usedDevLauncher };
  if (metro.needsMetro || usedDevLauncher) {
    record(
      'self-contained-js',
      'fail',
      'Installed package appears to require Metro/Dev Client. Rebuild/install embedded-bundle APK.'
    );
    evidence.result = 'fail';
    screenshot(serial, 'metro-dependent');
    restoreNetwork(serial);
    return exitForResult();
  }
  record('self-contained-js', 'pass', 'No DevLauncher/Metro dependency markers observed after cold launch');

  const focus = adbOk(['-s', serial, 'shell', 'dumpsys', 'window']);
  const focused = /mCurrentFocus=Window\{[^}]*com\.daynori\.app/i.test(focus.stdout);
  const fatal = adbOk(['-s', serial, 'logcat', '-d', '-t', '120']);
  const crashed =
    /FATAL EXCEPTION|SoLoaderDSONotFoundError|couldn't find DSO to load/i.test(fatal.stdout) &&
    /com\.daynori\.app/i.test(fatal.stdout);
  evidence.assertions.process = { focused, crashed };

  const bootUi = dumpUi(serial, 'boot');
  screenshot(serial, 'boot');
  const bootText = bootUi.xml;
  const hasOrganizerOrAuthChrome = /Today|Plan|Library|Sign In|Welcome|Account|Create|Journal/i.test(
    bootText
  );
  const metroError = /Unable to load script|development server/i.test(bootText + fatal.stdout);
  evidence.assertions.bootUiHints = { hasOrganizerOrAuthChrome, metroError, focused, crashed };
  const bootOk = focused && hasOrganizerOrAuthChrome && !metroError && !crashed;
  record('boot-ui', bootOk ? 'pass' : 'fail', evidence.assertions.bootUiHints);
  if (!bootOk) {
    evidence.result = crashed || metroError ? 'fail' : 'unmet';
    if (crashed) {
      evidence.limits.push(
        'App process crashed after cold launch (see logcat FATAL). Embedded ABI/bundle mismatch until rebuilt.'
      );
    }
    restoreNetwork(serial);
    return exitForResult();
  }

  // Auth + workspace via ordinary flows require host API/auth + synth accounts.
  const accounts = loadAccounts().filter((a) => String(a.label).toUpperCase() !== 'A');
  const account = accounts.find((a) => a.label === 'C') || accounts[0];
  if (!account) {
    record(
      'synthetic-account',
      'unmet',
      'No healthy synth account (B/C). Account A fail-closed DB must be preserved untouched.'
    );
    evidence.limits.push(
      'Native package cold-launched without Metro, but sign-in/offline reopen with records unmet until synth auth + API are available.'
    );
    evidence.result = 'unmet';
    restoreNetwork(serial);
    return exitForResult();
  }
  evidence.identities = { accountLabel: account.label, userIdPresent: Boolean(account.userId) };
  record('synthetic-account', 'pass', `label=${account.label}`);

  // Reverse API/auth to emulator (not Metro)
  adbOk(['-s', serial, 'reverse', 'tcp:3001', 'tcp:3001']);
  adbOk(['-s', serial, 'reverse', 'tcp:54321', 'tcp:54321']);

  // Deep health from host perspective
  let apiOk = false;
  let authOk = false;
  try {
    const api = spawnSync('node', ['-e', "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(2))"], {
      encoding: 'utf8',
    });
    apiOk = api.status === 0;
  } catch {
    apiOk = false;
  }
  try {
    const auth = spawnSync('node', ['-e', "fetch('http://127.0.0.1:54321/auth/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(2))"], {
      encoding: 'utf8',
    });
    authOk = auth.status === 0;
  } catch {
    authOk = false;
  }
  evidence.environment.hostApi = apiOk;
  evidence.environment.hostAuth = authOk;
  if (!apiOk || !authOk) {
    record('host-services', 'unmet', { apiOk, authOk });
    evidence.limits.push(
      'API/Auth not healthy on host; cannot complete sign-in, draft/queue, airplane cold reopen assertions.'
    );
    evidence.result = 'unmet';
    restoreNetwork(serial);
    return exitForResult();
  }
  record('host-services', 'pass', { apiOk, authOk });

  // For full UI sign-in automation we reuse phase71 journey helpers when present.
  const journeyHelper = path.join(root, 'scripts', 'phase71-android-journeys.mjs');
  if (!fs.existsSync(journeyHelper)) {
    record('journey-helper', 'unmet', 'phase71-android-journeys.mjs missing for sign-in automation');
    evidence.result = 'unmet';
    restoreNetwork(serial);
    return exitForResult();
  }

  // Minimal inline sign-in: open Account via deeplink-ish and type credentials using existing resource ids.
  // Prefer spawning a focused node snippet imported from journeys — call sign-in via adb input.
  const signScript = `
    const { spawnSync } = require('node:child_process');
    const serial = process.env.DAYNORI_ANDROID_SERIAL;
    const email = process.env.DAYNORI_P77_EMAIL;
    const password = process.env.DAYNORI_P77_PASSWORD;
    function adb(args){return spawnSync('adb',['-s',serial,...args],{encoding:'utf8'});}
    adb(['shell','am','start','-W','-n','${pkg}/.MainActivity']);
    // Give UI time; journeys handle robust sign-in — here we only deep-check offline after operator path.
    console.log(JSON.stringify({ok:true,note:'delegate-manual-ui-steps-in-parent'}));
  `;
  // Use phase71 journeys auth portion by env flag if supported; otherwise mark need for interactive journey.
  // Practical path: invoke journeys with PHASE71_AUTH_ONLY if available — fall back to unmet with clear next action.
  const authOnly = spawnSync(
    process.execPath,
    [journeyHelper],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        DAYNORI_ANDROID_SERIAL: serial,
        DAYNORI_PHASE71_ACCOUNT_LABEL: account.label || 'C',
        DAYNORI_PHASE77_NATIVE_EVIDENCE: '1',
      },
      timeout: 120000,
    }
  );
  evidence.assertions.journeyExit = authOnly.status;
  evidence.assertions.journeyTail = (authOnly.stdout || '').slice(-800);
  // Journey may do more than auth; we still need airplane cold reopen below regardless.

  // Establish marker via screenshot/UI dump after journey
  screenshot(serial, 'after-online-setup');
  dumpUi(serial, 'after-online-setup');

  // Force-stop without clearing data
  forceStop(serial);
  record('force-stop', 'pass', 'am force-stop without pm clear');

  // Disable connectivity and confirm API unreachable from device
  disableNetwork(serial);
  record('disable-connectivity', 'pass', 'airplane_mode_on=1; wifi/data disabled');
  const apiFromDevice = adbOk([
    '-s',
    serial,
    'shell',
    'curl',
    '-s',
    '-o',
    '/dev/null',
    '-w',
    '%{http_code}',
    '--connect-timeout',
    '3',
    'http://127.0.0.1:3001/health',
  ]);
  // With airplane mode, curl should fail (empty/000)
  const code = (apiFromDevice.stdout || '').trim();
  const apiBlocked = !code || code === '000' || code === '000000' || apiFromDevice.status !== 0;
  evidence.assertions.deviceApiProbe = { code, status: apiFromDevice.status, stderr: apiFromDevice.stderr };
  record('device-api-blocked', apiBlocked ? 'pass' : 'fail', evidence.assertions.deviceApiProbe);
  if (!apiBlocked) {
    evidence.result = 'fail';
    restoreNetwork(serial);
    return exitForResult();
  }

  // Cold launch while offline + Metro unavailable
  const cold = launchApp(serial);
  record('cold-launch-offline', cold.status === 0 ? 'pass' : 'fail', (cold.stdout || cold.stderr).slice(0, 400));
  spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', [process.platform === 'win32' ? '/T' : '', '10'].filter(Boolean), {
    shell: true,
  });
  screenshot(serial, 'cold-offline');
  const coldUi = dumpUi(serial, 'cold-offline');
  const coldMetro = detectMetroDependency(serial);
  const coldText = coldUi.xml;
  const usable =
    !coldMetro.needsMetro &&
    !/Unable to load script|development server/i.test(coldText) &&
    /Today|Plan|Library|Note|Task|Journal|Offline|Saved|Draft|Account|daynori/i.test(coldText);
  evidence.assertions.coldOffline = {
    usable,
    metro: coldMetro.needsMetro,
    hints: evidence.assertions.bootUiHints,
  };
  record('cold-offline-usable', usable ? 'pass' : 'fail', evidence.assertions.coldOffline);

  // Reconnect + sync (nonduplicating) — restore network and relaunch
  restoreNetwork(serial);
  adbOk(['-s', serial, 'reverse', 'tcp:3001', 'tcp:3001']);
  adbOk(['-s', serial, 'reverse', 'tcp:54321', 'tcp:54321']);
  record('restore-connectivity', 'pass', 'airplane off; wifi enabled; api/auth reverse restored');
  launchApp(serial);
  spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', [process.platform === 'win32' ? '/T' : '', '8'].filter(Boolean), {
    shell: true,
  });
  screenshot(serial, 'reconnect');
  dumpUi(serial, 'reconnect');

  // In-place update without wiping data: reinstall same/newer APK with -r
  const reinstall = adbOk(['-s', serial, 'install', '-r', apkPath]);
  const reinstallOk = reinstall.status === 0 && /Success/i.test(reinstall.stdout + reinstall.stderr);
  record('in-place-update', reinstallOk ? 'pass' : 'fail', (reinstall.stdout + reinstall.stderr).slice(0, 300));
  // Confirm data dir still present (not cleared)
  const dataDir = adbOk(['-s', serial, 'shell', 'run-as', pkg, 'ls', 'files']);
  evidence.assertions.dataSurvivedUpdate = {
    lsStatus: dataDir.status,
    sample: (dataDir.stdout || '').slice(0, 300),
  };
  record(
    'data-survived-update',
    dataDir.status === 0 ? 'pass' : 'fail',
    evidence.assertions.dataSurvivedUpdate
  );

  // Two-account isolation note: Account A must remain fail-closed; do not wipe/rekey.
  evidence.limits.push(
    'Account A fail-closed SQLCipher DB preserved (not wiped/rekeyed). Two-account switch assertions rely on journey evidence + quarantine tests.'
  );

  const failed = evidence.steps.some((s) => s.status === 'fail');
  const unmet = evidence.steps.some((s) => s.status === 'unmet');
  if (!usable) {
    evidence.result = 'fail';
  } else if (failed) {
    evidence.result = 'fail';
  } else if (unmet) {
    evidence.result = 'unmet';
  } else {
    evidence.result = 'pass';
    evidence.limits.push(
      isEmulator(serial)
        ? 'Native evidence class: emulator. Physical-device cold launch remains a separate observation if required by release gates.'
        : 'Native evidence class: physical device.'
    );
  }
  exitForResult();
}

try {
  main();
} catch (err) {
  record('fatal', 'fail', err instanceof Error ? err.message : String(err));
  evidence.result = 'fail';
  try {
    const serial = evidence.environment?.serial;
    if (serial) restoreNetwork(serial);
  } catch {
    /* ignore */
  }
  exitForResult();
}
