#!/usr/bin/env node
/**
 * iOS development-path inspection (Phase 61).
 *
 * - Validates Expo app.json iOS configuration invariants on any host.
 * - Detects whether this machine can run Xcode/simulator native builds.
 * - Never claims a successful native iOS build from TypeScript or config alone.
 *
 * Usage:
 *   node scripts/mobile-ios-path.mjs inspect
 *   node scripts/mobile-ios-path.mjs host-capability
 *   node scripts/mobile-ios-path.mjs write-evidence
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MOBILE_ROOT = path.join(REPO_ROOT, 'apps', 'mobile');
const APP_JSON = path.join(MOBILE_ROOT, 'app.json');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'artifacts', 'release');
const EVIDENCE_PATH = path.join(EVIDENCE_DIR, 'ios-path-inspection.json');

const REQUIRED_BUNDLE_ID = 'com.daynori.app';
const REQUIRED_SCHEME = 'daynori';
const MIN_IOS_DEPLOYMENT = '15.1';

function fail(message, code = 1) {
  console.error(`[ios-path:FAIL] ${message}`);
  process.exit(code);
}

function info(message) {
  console.log(`[ios-path] ${message}`);
}

function readAppConfig() {
  if (!fs.existsSync(APP_JSON)) {
    return { ok: false, errors: [`Missing ${APP_JSON}`], config: null };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
    return { ok: true, errors: [], config: raw?.expo ?? null };
  } catch (err) {
    return {
      ok: false,
      errors: [`Invalid app.json: ${err instanceof Error ? err.message : String(err)}`],
      config: null,
    };
  }
}

/**
 * Inspect Expo iOS configuration without requiring Xcode.
 */
export function inspectIosAppConfig(expoConfig) {
  const errors = [];
  const warnings = [];
  const findings = {
    bundleIdentifier: null,
    scheme: null,
    sqlCipherIos: false,
    sqlCipherTopLevel: false,
    microphoneUsageDescription: false,
    associatedDomains: false,
    deploymentTarget: null,
    usesNonExemptEncryptionDeclared: false,
    iosDirPresent: fs.existsSync(path.join(MOBILE_ROOT, 'ios')),
  };

  if (!expoConfig) {
    errors.push('expo config missing');
    return { ok: false, errors, warnings, findings };
  }

  const ios = expoConfig.ios ?? {};
  findings.bundleIdentifier = ios.bundleIdentifier ?? null;
  findings.scheme = expoConfig.scheme ?? null;

  if (findings.bundleIdentifier !== REQUIRED_BUNDLE_ID) {
    errors.push(`ios.bundleIdentifier must be ${REQUIRED_BUNDLE_ID}`);
  }
  if (findings.scheme !== REQUIRED_SCHEME) {
    errors.push(`scheme must be ${REQUIRED_SCHEME}`);
  }

  const infoPlist = ios.infoPlist ?? {};
  findings.microphoneUsageDescription = typeof infoPlist.NSMicrophoneUsageDescription === 'string';
  findings.usesNonExemptEncryptionDeclared =
    typeof infoPlist.ITSAppUsesNonExemptEncryption === 'boolean';

  if (!findings.microphoneUsageDescription) {
    warnings.push(
      'NSMicrophoneUsageDescription missing — required before enabling recording UI on iOS'
    );
  }

  const associated = ios.associatedDomains;
  findings.associatedDomains = Array.isArray(associated) && associated.length > 0;

  const plugins = Array.isArray(expoConfig.plugins) ? expoConfig.plugins : [];
  for (const plugin of plugins) {
    if (Array.isArray(plugin) && plugin[0] === 'expo-sqlite') {
      const opts = plugin[1] ?? {};
      findings.sqlCipherTopLevel = opts.useSQLCipher === true;
      findings.sqlCipherIos = opts.ios?.useSQLCipher === true || findings.sqlCipherTopLevel;
    }
    if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
      const iosProps = plugin[1]?.ios ?? {};
      findings.deploymentTarget = iosProps.deploymentTarget ?? null;
    }
  }

  if (!findings.sqlCipherIos) {
    errors.push('expo-sqlite must enable useSQLCipher for iOS (development build required)');
  }

  if (findings.deploymentTarget) {
    const [maj, min] = String(findings.deploymentTarget)
      .split('.')
      .map((p) => Number(p));
    const [reqMaj, reqMin] = MIN_IOS_DEPLOYMENT.split('.').map((p) => Number(p));
    if (maj < reqMaj || (maj === reqMaj && (min ?? 0) < reqMin)) {
      errors.push(`ios.deploymentTarget must be >= ${MIN_IOS_DEPLOYMENT}`);
    }
  } else {
    warnings.push(`ios.deploymentTarget not set via expo-build-properties (default Expo SDK applies)`);
  }

  if (findings.iosDirPresent) {
    warnings.push(
      'Checked-in or generated apps/mobile/ios present — regenerate with prebuild on macOS before release evidence'
    );
  }

  return { ok: errors.length === 0, errors, warnings, findings };
}

export function detectHostCapability() {
  const isDarwin = process.platform === 'darwin';
  const xcodebuild = isDarwin
    ? spawnSync('xcodebuild', ['-version'], { encoding: 'utf8' })
    : null;
  const pod = isDarwin ? spawnSync('pod', ['--version'], { encoding: 'utf8' }) : null;
  const simctl = isDarwin
    ? spawnSync('xcrun', ['simctl', 'list', 'devices', 'available'], { encoding: 'utf8' })
    : null;

  const capability = {
    platform: process.platform,
    isDarwin,
    canRunNativeIosBuild: false,
    xcodebuildAvailable: Boolean(xcodebuild && xcodebuild.status === 0),
    cocoaPodsAvailable: Boolean(pod && pod.status === 0),
    simctlAvailable: Boolean(simctl && simctl.status === 0),
    xcodeVersionLine:
      xcodebuild && xcodebuild.status === 0
        ? String(xcodebuild.stdout || '')
            .split('\n')
            .find((l) => l.startsWith('Xcode')) || null
        : null,
    note: isDarwin
      ? 'macOS host — native verification possible when Xcode/tools installed'
      : 'Non-macOS host — native iOS build/simulator verification cannot run here',
  };

  capability.canRunNativeIosBuild =
    capability.isDarwin && capability.xcodebuildAvailable && capability.simctlAvailable;

  return capability;
}

function writeEvidence(payload) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  info(`Wrote ${EVIDENCE_PATH}`);
}

function main() {
  const command = process.argv[2] || 'inspect';
  const { ok: parseOk, errors: parseErrors, config } = readAppConfig();
  if (!parseOk) {
    fail(parseErrors.join('; '));
  }

  const inspection = inspectIosAppConfig(config);
  const host = detectHostCapability();

  if (command === 'inspect') {
    info(`bundleIdentifier=${inspection.findings.bundleIdentifier}`);
    info(`sqlCipherIos=${inspection.findings.sqlCipherIos}`);
    info(`iosDirPresent=${inspection.findings.iosDirPresent}`);
    for (const w of inspection.warnings) info(`WARN: ${w}`);
    for (const e of inspection.errors) console.error(`[ios-path:ERROR] ${e}`);
    if (!inspection.ok) fail('iOS app config inspection failed');
    info('PASS — Expo iOS configuration invariants');
    return;
  }

  if (command === 'host-capability') {
    console.log(JSON.stringify(host, null, 2));
    if (!host.canRunNativeIosBuild) {
      info('Native iOS build unavailable on this host (expected on Windows).');
      process.exit(0);
    }
    info('Host can attempt native iOS builds.');
    return;
  }

  if (command === 'write-evidence') {
    const payload = {
      schemaVersion: 1,
      phase: 61,
      reviewedAt: new Date().toISOString().slice(0, 10),
      inspection,
      host,
      nativeBuildStatus: host.canRunNativeIosBuild ? 'host-capable-unexecuted' : 'unavailable-on-host',
      disclaimer:
        'Config/host inspection is not a successful native iOS build, simulator run, or physical-device verification.',
    };
    writeEvidence(payload);
    if (!inspection.ok) fail('Evidence written but iOS config inspection failed');
    info('PASS — evidence written');
    return;
  }

  fail(`Unknown command: ${command}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main();
}
