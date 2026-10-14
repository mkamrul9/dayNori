import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDir = path.join(root, 'artifacts', 'android-e2e');
fs.mkdirSync(artifactsDir, { recursive: true });

console.log('=== STARTING PHASE 06 ANDROID ON-DEVICE E2E & ACCEPTANCE RUNNER ===');
const logLines = [];
function log(msg) {
  console.log(msg);
  logLines.push(msg);
}

// 1. Locate adb executable
log('\n[1/4] Inspecting Android Debug Bridge (adb) configuration...');
let adbPath = 'adb';
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (androidHome) {
  const candidate = path.join(
    androidHome,
    'platform-tools',
    process.platform === 'win32' ? 'adb.exe' : 'adb'
  );
  if (fs.existsSync(candidate)) {
    adbPath = candidate;
  }
}

// 2. Discover connected devices
let connectedDevices = [];
try {
  const adbOutput = execSync(`"${adbPath}" devices`, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = adbOutput
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length >= 2 && parts[1] === 'device') {
      connectedDevices.push(parts[0]);
    }
  }
} catch (err) {
  log(`Note: adb execution failed: ${err.message}`);
}

// 3. Locate compiled development APK
log('\n[2/4] Verifying Android development APK artifact...');
const apkPath = path.join(
  root,
  'apps',
  'mobile',
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);

const apkExists = fs.existsSync(apkPath);
let apkSize = null;
if (apkExists) {
  apkSize = fs.statSync(apkPath).size;
  log(`✓ Found development APK at ${apkPath}`);
  log(`  Size: ${(apkSize / (1024 * 1024)).toFixed(2)} MB (${apkSize} bytes)`);
} else {
  log(`❌ Development APK not found at ${apkPath}`);
}

// 4. Evaluate prerequisites for genuine on-device testing
log('\n[3/4] Evaluating prerequisite gates for device E2E execution...');

if (connectedDevices.length === 0 || !apkExists) {
  const missing = [];
  if (connectedDevices.length === 0) missing.push('Connected physical Android device or emulator');
  if (!apkExists) missing.push('Compiled debug APK (app-debug.apk)');

  log(`\n❌ ACCEPTANCE BLOCKED: Missing prerequisites for on-device E2E testing:`);
  missing.forEach((m) => log(`   - ${m}`));
  log(
    '\nPer engineering rules, acceptance command test:e2e:android must report missing hardware/APK'
  );
  log('as blocked and exit non-zero rather than substituting mock or unit results.\n');

  const blockedSummary = {
    timestamp: new Date().toISOString(),
    status: 'BLOCKED_MISSING_PREREQUISITE',
    connectedDevices,
    apkExists,
    apkSize,
    missingPrerequisites: missing,
    exitCode: 2,
  };

  fs.writeFileSync(
    path.join(artifactsDir, 'android-e2e-summary.json'),
    JSON.stringify(blockedSummary, null, 2),
    'utf-8'
  );
  fs.writeFileSync(path.join(artifactsDir, 'android-e2e.log'), logLines.join('\n'), 'utf-8');

  process.exit(2);
}

// 5. Genuine On-Device Installation and Deep Link Intent Execution
const targetDevice = connectedDevices[0];
log(`\n[4/4] Executing on-device acceptance tests against target device: ${targetDevice}...`);

try {
  // A. Install fresh APK
  log(`-> Installing APK on ${targetDevice}...`);
  execSync(`"${adbPath}" -s ${targetDevice} install -r "${apkPath}"`, {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  log(`✓ APK successfully installed.`);

  // B. Launch Main Activity
  log(`-> Starting main activity com.daynori.app/.MainActivity...`);
  execSync(`"${adbPath}" -s ${targetDevice} shell am start -n com.daynori.app/.MainActivity -W`, {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  log(`✓ Main activity launched.`);

  // C. Test Cold-Start Deep Link Intent
  log(`-> Dispatching cold-start intent: daynori://today...`);
  execSync(
    `"${adbPath}" -s ${targetDevice} shell am start -a android.intent.action.VIEW -d "daynori://today" com.daynori.app`,
    {
      stdio: 'inherit',
      encoding: 'utf-8',
    }
  );
  log(`✓ Today destination intent accepted by OS.`);

  // D. Test Warm-Start Deep Link Intent to Plan/Calendar
  log(`-> Dispatching warm-start intent: daynori://plan/calendar...`);
  execSync(
    `"${adbPath}" -s ${targetDevice} shell am start -a android.intent.action.VIEW -d "daynori://plan/calendar" com.daynori.app`,
    {
      stdio: 'inherit',
      encoding: 'utf-8',
    }
  );
  log(`✓ Calendar destination intent accepted by OS.`);

  // E. Capture device screenshot for evidence
  const screenshotPath = path.join(artifactsDir, 'device-plan-calendar.png');
  const screencap = spawnSync(`"${adbPath}"`, ['-s', targetDevice, 'exec-out', 'screencap', '-p'], {
    shell: true,
  });
  if (screencap.stdout && screencap.stdout.length > 0) {
    fs.writeFileSync(screenshotPath, screencap.stdout);
    log(`✓ Screen capture saved to ${screenshotPath}`);
  }

  const passSummary = {
    timestamp: new Date().toISOString(),
    status: 'PASSED',
    connectedDevices,
    targetDevice,
    apkPath,
    apkSize,
    onDeviceChecks: {
      installation: 'PASS',
      activityLaunch: 'PASS',
      coldStartIntent: 'PASS',
      warmStartIntent: 'PASS',
      screenCapture: fs.existsSync(screenshotPath) ? 'PASS' : 'WARN',
    },
    exitCode: 0,
  };

  fs.writeFileSync(
    path.join(artifactsDir, 'android-e2e-summary.json'),
    JSON.stringify(passSummary, null, 2),
    'utf-8'
  );
  fs.writeFileSync(path.join(artifactsDir, 'android-e2e.log'), logLines.join('\n'), 'utf-8');

  log('\n=== ANDROID ON-DEVICE E2E ACCEPTANCE PASSED ===\n');
  process.exit(0);
} catch (err) {
  log(`\n❌ Error during on-device execution: ${err.message}`);
  const failSummary = {
    timestamp: new Date().toISOString(),
    status: 'FAILED',
    connectedDevices,
    targetDevice,
    error: err.message,
    exitCode: 1,
  };
  fs.writeFileSync(
    path.join(artifactsDir, 'android-e2e-summary.json'),
    JSON.stringify(failSummary, null, 2),
    'utf-8'
  );
  fs.writeFileSync(path.join(artifactsDir, 'android-e2e.log'), logLines.join('\n'), 'utf-8');
  process.exit(1);
}
