#!/usr/bin/env node
/**
 * Build an installable debug APK from a space-free short path.
 *
 * The primary workspace path containing spaces (e.g. "UNIQUE WORK") breaks
 * Android NDK/prefab on Windows. This script clones/checks out into D:\d\daynori
 * (override with DAYNORI_SHORT_BUILD_ROOT), uses hoisted node_modules, builds
 * arm64-v8a debug APK, and copies hash evidence back to the source repo.
 *
 * Usage (from primary repo root, Node ^24.21.0 on PATH):
 *   node scripts/build-android-debug-apk.mjs
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(__dirname, '..');
const SHORT_ROOT = process.env.DAYNORI_SHORT_BUILD_ROOT || 'D:\\d\\daynori';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32' && /\.cmd$/i.test(cmd),
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with ${r.status}`);
  }
}

function main() {
  if (SOURCE_ROOT.includes(' ')) {
    console.log(
      `[apk-build] Source path has spaces (${SOURCE_ROOT}); using short root ${SHORT_ROOT}`
    );
  }

  if (!fs.existsSync(SHORT_ROOT)) {
    fs.mkdirSync(path.dirname(SHORT_ROOT), { recursive: true });
    run('git', ['clone', '--local', '--shared', SOURCE_ROOT, SHORT_ROOT]);
  }

  const rev = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: SOURCE_ROOT,
    encoding: 'utf8',
  }).stdout.trim();

  run('git', ['fetch', 'origin', rev], { cwd: SHORT_ROOT, stdio: 'pipe' });
  // Shared local clone: checkout matching revision
  run('git', ['checkout', '--force', rev], { cwd: SHORT_ROOT });

  // Prefer hoisted linker for shorter native paths
  const npmrc = path.join(SHORT_ROOT, '.npmrc');
  let npmrcText = fs.existsSync(npmrc) ? fs.readFileSync(npmrc, 'utf8') : '';
  if (!/node-linker\s*=\s*hoisted/.test(npmrcText)) {
    npmrcText += '\nnode-linker=hoisted\n';
    fs.writeFileSync(npmrc, npmrcText);
  }

  // Sync critical plugin from source (may be ahead of last commit)
  const pluginSrc = path.join(SOURCE_ROOT, 'apps/mobile/plugins/withReleaseSigningGuard.js');
  const pluginDst = path.join(SHORT_ROOT, 'apps/mobile/plugins/withReleaseSigningGuard.js');
  fs.copyFileSync(pluginSrc, pluginDst);

  // Sync uncommitted mobile/ui-mobile (and related) sources so Phase APKs are not HEAD-only.
  run(process.execPath, [path.join(SOURCE_ROOT, 'scripts/sync-short-build-working-tree.mjs')], {
    env: { ...process.env, DAYNORI_SHORT_BUILD_ROOT: SHORT_ROOT },
  });

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  run(pnpm, ['install'], { cwd: SHORT_ROOT });
  run(pnpm, ['prebuild'], { cwd: path.join(SHORT_ROOT, 'apps', 'mobile') });

  // Match selected device/emulator ABI (default arm64-v8a; x86_64 AVD uses DAYNORI_ANDROID_ABI=x86_64).
  const abi = process.env.DAYNORI_ANDROID_ABI || 'arm64-v8a';
  const gp = path.join(SHORT_ROOT, 'apps/mobile/android/gradle.properties');
  let gpText = fs.readFileSync(gp, 'utf8');
  gpText = gpText.replace(/reactNativeArchitectures=.*/g, `reactNativeArchitectures=${abi}`);
  fs.writeFileSync(gp, gpText);

  const androidDir = path.join(SHORT_ROOT, 'apps/mobile/android');
  const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (process.platform === 'win32') {
    const r = spawnSync(`"${gradlew}" :app:assembleDebug --console=plain`, {
      cwd: androidDir,
      encoding: 'utf8',
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    if (r.status !== 0) throw new Error(`assembleDebug failed with ${r.status}`);
  } else {
    run(gradlew, [':app:assembleDebug', '--console=plain'], { cwd: androidDir });
  }

  const apk = path.join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(apk)) throw new Error(`APK missing at ${apk}`);

  const destDir = path.join(SOURCE_ROOT, 'artifacts', 'release');
  fs.mkdirSync(destDir, { recursive: true });
  const apkName = abi === 'arm64-v8a' ? 'app-debug-arm64.apk' : `app-debug-${abi}.apk`;
  const destApk = path.join(destDir, apkName);
  fs.copyFileSync(apk, destApk);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(destApk)).digest('hex');

  let workingTreeSync = null;
  const syncPath = path.join(destDir, 'android-working-tree-sync.json');
  if (fs.existsSync(syncPath)) {
    workingTreeSync = JSON.parse(fs.readFileSync(syncPath, 'utf8'));
  }

  const evidence = {
    createdAt: new Date().toISOString(),
    gitRevision: rev,
    workingTreeFingerprint: workingTreeSync?.workingTreeFingerprint ?? null,
    workingTreeDirty: workingTreeSync?.workingTreeDirty ?? null,
    buildRoot: SHORT_ROOT,
    apkPath: `artifacts/release/${apkName}`,
    sha256,
    architecture: abi,
    packageId: 'com.daynori.app',
    signing: 'debug (local-test only — not release-eligible)',
    targetSdk: 36,
    note: 'Installable debug APK includes synced working-tree mobile sources when dirty; not release-eligible',
  };
  fs.writeFileSync(
    path.join(destDir, 'android-debug-apk-evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n'
  );
  console.log(`[apk-build] PASS ${destApk}`);
  console.log(`[apk-build] SHA256 ${sha256}`);
  console.log('[apk-build] Not release-eligible (debug-signed). No adb install performed.');
}

try {
  main();
} catch (err) {
  console.error('[apk-build:FAIL]', err instanceof Error ? err.message : err);
  process.exit(1);
}
