#!/usr/bin/env node
/**
 * Authoritative Android release-path verification (Phase 59 repair / Phase 60).
 *
 * - Treats Expo prebuild + withReleaseSigningGuard as source of truth.
 * - Stale checked-out/generated android/ trees that still fall back to debug.keystore
 *   are rejected for release eligibility.
 * - Does not print keystore passwords or private key material.
 *
 * Usage:
 *   node scripts/mobile-android-release-path.mjs inspect [--android-dir <path>]
 *   node scripts/mobile-android-release-path.mjs prebuild-disposable
 *   node scripts/mobile-android-release-path.mjs exercise-gradle [--android-dir <path>]
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MOBILE_ROOT = path.join(REPO_ROOT, 'apps', 'mobile');
const DEFAULT_ANDROID = path.join(MOBILE_ROOT, 'android');
const GUARD_MARKER = 'daynoriReleaseSigningGuard';
const REQUIRED_TARGET_SDK = 36;
const REQUIRED_COMPILE_SDK = 36;

function fail(message, code = 1) {
  console.error(`[android-release-path:FAIL] ${message}`);
  process.exit(code);
}

function info(message) {
  console.log(`[android-release-path] ${message}`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Inspect a generated android/ tree for signing + SDK invariants.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], findings: Record<string, unknown> }}
 */
export function inspectAndroidTree(androidDir) {
  const errors = [];
  const warnings = [];
  const findings = {
    androidDir,
    guardPresent: false,
    silentDebugFallbackInReleaseSigningConfig: false,
    targetSdk: null,
    compileSdk: null,
    versionCode: null,
  };

  if (!fs.existsSync(androidDir)) {
    errors.push(`Android directory missing: ${androidDir}`);
    return { ok: false, errors, warnings, findings };
  }

  const appGradle = path.join(androidDir, 'app', 'build.gradle');
  const rootGradle = path.join(androidDir, 'build.gradle');
  const gradleProps = path.join(androidDir, 'gradle.properties');

  if (!fs.existsSync(appGradle)) {
    errors.push(`Missing ${appGradle}`);
    return { ok: false, errors, warnings, findings };
  }

  const appContents = readText(appGradle);
  const hasWhenReady = /gradle\.taskGraph\.whenReady/.test(appContents);
  const hasGuardAnchor = appContents.includes(`// ${GUARD_MARKER}`);
  findings.guardPresent = hasGuardAnchor && hasWhenReady;

  // Classic Expo/stale pattern: release signingConfigs block falls back to debug.keystore
  const hasSilentFallback =
    /Local build fallback when release keystore is not externally supplied/.test(appContents) ||
    (/signingConfigs\s*\{[\s\S]*\brelease\s*\{[\s\S]*storeFile\s+file\(['"]debug\.keystore['"]\)/.test(
      appContents
    ) &&
      !hasWhenReady);

  findings.silentDebugFallbackInReleaseSigningConfig = hasSilentFallback;

  if (hasSilentFallback) {
    errors.push(
      'Stale release signingConfig silently falls back to debug.keystore. Regenerate via Expo prebuild with withReleaseSigningGuard; do not treat this tree as release-eligible.'
    );
  }

  if (!findings.guardPresent) {
    errors.push(
      `Missing fail-closed ${GUARD_MARKER} whenReady block in app/build.gradle — run authoritative prebuild before release packaging.`
    );
  }

  // Prefer gradle.properties / root ext for SDK numbers
  let propsText = '';
  if (fs.existsSync(gradleProps)) propsText += readText(gradleProps);
  if (fs.existsSync(rootGradle)) propsText += '\n' + readText(rootGradle);
  propsText += '\n' + appContents;

  const targetMatch = propsText.match(/targetSdkVersion\s*=?\s*(\d+)/);
  const compileMatch =
    propsText.match(/compileSdkVersion\s*=?\s*(\d+)/) || propsText.match(/compileSdk\s+(\d+)/);
  const versionCodeMatch = appContents.match(/versionCode\s+(\d+)/);

  findings.targetSdk = targetMatch ? Number(targetMatch[1]) : null;
  findings.compileSdk = compileMatch ? Number(compileMatch[1]) : null;
  findings.versionCode = versionCodeMatch ? Number(versionCodeMatch[1]) : null;

  if (findings.targetSdk !== REQUIRED_TARGET_SDK) {
    errors.push(
      `Effective targetSdk must be ${REQUIRED_TARGET_SDK} (found ${findings.targetSdk ?? 'unset'}). app.json alone is not artifact evidence.`
    );
  }
  if (findings.compileSdk !== REQUIRED_COMPILE_SDK) {
    errors.push(
      `Effective compileSdk must be ${REQUIRED_COMPILE_SDK} (found ${findings.compileSdk ?? 'unset'}).`
    );
  }

  // Partial ANDROID_KEYSTORE_* config without passwords must not be treated as complete
  // (documented expectation; runtime enforcement is in the Gradle whenReady block).
  if (
    findings.guardPresent &&
    !/DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING/.test(appContents)
  ) {
    warnings.push('Guard should document DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING local-test path.');
  }

  return { ok: errors.length === 0, errors, warnings, findings };
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function runPrebuildDisposable() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'daynori-android-prebuild-'));
  info(`Disposable prebuild directory: ${tmp}`);

  // Copy mobile app sources needed for Expo prebuild without mutating repo android/
  const copyRoot = path.join(tmp, 'mobile');
  fs.mkdirSync(copyRoot, { recursive: true });

  const copyNames = [
    'app.json',
    'package.json',
    'index.ts',
    'App.tsx',
    'tsconfig.json',
    'babel.config.js',
    'metro.config.js',
    'plugins',
    'assets',
    'src',
  ];
  for (const name of copyNames) {
    const src = path.join(MOBILE_ROOT, name);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(copyRoot, name);
    fs.cpSync(src, dest, { recursive: true });
  }

  // Point node_modules at the monorepo install via junction/symlink when possible
  const nm = path.join(MOBILE_ROOT, 'node_modules');
  if (fs.existsSync(nm)) {
    try {
      fs.symlinkSync(nm, path.join(copyRoot, 'node_modules'), 'junction');
    } catch {
      warningsOrCopy(nm, path.join(copyRoot, 'node_modules'));
    }
  }

  const env = {
    ...process.env,
    // Ensure prebuild does not inherit release credentials into logs
    DAYNORI_RELEASE_STORE_PASSWORD: undefined,
    DAYNORI_RELEASE_KEY_PASSWORD: undefined,
    ANDROID_KEYSTORE_PASSWORD: undefined,
    ANDROID_KEY_PASSWORD: undefined,
  };
  delete env.DAYNORI_RELEASE_STORE_PASSWORD;
  delete env.DAYNORI_RELEASE_KEY_PASSWORD;
  delete env.ANDROID_KEYSTORE_PASSWORD;
  delete env.ANDROID_KEY_PASSWORD;

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    npx,
    ['expo', 'prebuild', '--no-install', '-p', 'android', '--clean'],
    {
      cwd: copyRoot,
      env,
      encoding: 'utf8',
      shell: process.platform === 'win32', // npx.cmd requires shell on Windows
    }
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    fail(`Disposable prebuild failed with exit ${result.status}`, result.status ?? 1);
  }

  const androidDir = path.join(copyRoot, 'android');
  const inspection = inspectAndroidTree(androidDir);
  printInspection(inspection);

  const reportPath = path.join(
    REPO_ROOT,
    'artifacts',
    'release',
    'android-prebuild-inspection.json'
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report = {
    createdAt: new Date().toISOString(),
    disposableRoot: tmp,
    inspection,
    appGradleSha256: fs.existsSync(path.join(androidDir, 'app', 'build.gradle'))
      ? sha256File(path.join(androidDir, 'app', 'build.gradle'))
      : null,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  info(`Wrote ${reportPath}`);

  if (!inspection.ok) {
    fail('Disposable prebuild produced a non-release-eligible android tree.');
  }

  info('Disposable prebuild PASS — guard + SDK settings verified.');
  return { tmp, androidDir, inspection, reportPath };
}

function warningsOrCopy(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function printInspection(inspection) {
  console.log(JSON.stringify(inspection.findings, null, 2));
  for (const w of inspection.warnings) {
    console.warn(`[android-release-path:WARN] ${w}`);
  }
  for (const e of inspection.errors) {
    console.error(`[android-release-path:FAIL] ${e}`);
  }
}

function exerciseGradle(androidDir) {
  const inspection = inspectAndroidTree(androidDir);
  printInspection(inspection);
  if (!inspection.ok) {
    fail('Refusing to exercise Gradle on a non-compliant android tree. Run prebuild-disposable first.');
  }

  const gradlew = path.join(
    androidDir,
    process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'
  );
  if (!fs.existsSync(gradlew)) {
    fail(`gradlew missing under ${androidDir}`);
  }

  const env = { ...process.env };
  delete env.DAYNORI_RELEASE_STORE_FILE;
  delete env.DAYNORI_RELEASE_STORE_PASSWORD;
  delete env.DAYNORI_RELEASE_KEY_ALIAS;
  delete env.DAYNORI_RELEASE_KEY_PASSWORD;
  delete env.ANDROID_KEYSTORE_PATH;
  delete env.ANDROID_KEYSTORE_PASSWORD;
  delete env.ANDROID_KEY_ALIAS;
  delete env.ANDROID_KEY_PASSWORD;
  delete env.DAYNORI_ALLOW_DEBUG_RELEASE_SIGNING;

  function runGradle(gradleArgs) {
    // Quote gradlew on Windows so paths with spaces (e.g. "UNIQUE WORK") survive.
    if (process.platform === 'win32') {
      const cmdline = `"${gradlew}" ${gradleArgs.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`;
      return spawnSync(cmdline, {
        cwd: androidDir,
        env,
        encoding: 'utf8',
        shell: true,
      });
    }
    return spawnSync(gradlew, gradleArgs, {
      cwd: androidDir,
      env,
      encoding: 'utf8',
      shell: false,
    });
  }

  // Harmless configuration task — must succeed without credentials
  info('Running :app:tasks (expect success without release credentials)...');
  const tasks = runGradle([':app:tasks', '--all', '--console=plain']);
  if (tasks.status !== 0) {
    if (tasks.stdout) process.stdout.write(tasks.stdout.slice(-4000));
    if (tasks.stderr) process.stderr.write(tasks.stderr.slice(-4000));
    fail(`Configuration task failed without credentials (exit ${tasks.status})`);
  }
  info(':app:tasks PASS without release credentials');

  // Distributable release packaging — must fail closed
  info('Running :app:assembleRelease without credentials (expect fail-closed)...');
  const assemble = runGradle([':app:assembleRelease', '--console=plain']);
  const combined = `${assemble.stdout ?? ''}\n${assemble.stderr ?? ''}`;
  const refused =
    assemble.status !== 0 &&
    /Release signing refused|signing refused|DAYNORI_RELEASE_STORE/i.test(combined);

  if (!refused) {
    if (assemble.stdout) process.stdout.write(assemble.stdout.slice(-6000));
    if (assemble.stderr) process.stderr.write(assemble.stderr.slice(-6000));
    fail(
      `assembleRelease did not fail closed without credentials (exit ${assemble.status}). Silent debug-signed release risk.`
    );
  }
  info('assembleRelease FAIL-CLOSED PASS (no silent debug-signed distributable)');
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'inspect';
  const dirFlag = args.indexOf('--android-dir');
  const androidDir =
    dirFlag >= 0 && args[dirFlag + 1] ? path.resolve(args[dirFlag + 1]) : DEFAULT_ANDROID;

  if (cmd === 'inspect') {
    const inspection = inspectAndroidTree(androidDir);
    printInspection(inspection);
    if (!inspection.ok) process.exit(1);
    info('inspect PASS');
    return;
  }

  if (cmd === 'prebuild-disposable') {
    runPrebuildDisposable();
    return;
  }

  if (cmd === 'exercise-gradle') {
    exerciseGradle(androidDir);
    return;
  }

  fail(`Unknown command: ${cmd}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
