#!/usr/bin/env node
/**
 * Build a Metro-free x86_64 debug-signed APK with an embedded JS bundle for Phase 77.
 * Uses DAYNORI_SHORT_BUILD_ROOT (default D:\d\daynori). Does not force-push or alter primary history.
 *
 * Technique:
 * - sync short root to current revision + working-tree mobile sources
 * - set reactNativeArchitectures=x86_64
 * - set debuggableVariants=[] so the debug variant embeds the Hermes bundle
 * - strip expo-dev-client from the short-root package.json for this build only
 * - assembleDebug and copy to artifacts/release/app-embedded-x86_64.apk
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
  if (!fs.existsSync(SHORT_ROOT)) {
    fs.mkdirSync(path.dirname(SHORT_ROOT), { recursive: true });
    run('git', ['clone', '--local', '--shared', SOURCE_ROOT, SHORT_ROOT]);
  }

  const rev = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: SOURCE_ROOT,
    encoding: 'utf8',
  }).stdout.trim();

  run('git', ['fetch', 'origin', rev], { cwd: SHORT_ROOT, stdio: 'pipe' });
  run('git', ['checkout', '--force', rev], { cwd: SHORT_ROOT });
  run(process.execPath, [path.join(SOURCE_ROOT, 'scripts/sync-short-build-working-tree.mjs')], {
    env: { ...process.env, DAYNORI_SHORT_BUILD_ROOT: SHORT_ROOT },
  });

  const npmrc = path.join(SHORT_ROOT, '.npmrc');
  let npmrcText = fs.existsSync(npmrc) ? fs.readFileSync(npmrc, 'utf8') : '';
  if (/node-linker\s*=\s*\S+/.test(npmrcText)) {
    npmrcText = npmrcText.replace(/node-linker\s*=\s*\S+/g, 'node-linker=hoisted');
  } else {
    npmrcText += '\nnode-linker=hoisted\n';
  }
  fs.writeFileSync(npmrc, npmrcText.trim() + '\n');

  // Remove expo-dev-client for this short-root build so MainActivity is the launcher.
  const mobilePkgPath = path.join(SHORT_ROOT, 'apps/mobile/package.json');
  const mobilePkg = JSON.parse(fs.readFileSync(mobilePkgPath, 'utf8'));
  if (mobilePkg.dependencies?.['expo-dev-client']) {
    delete mobilePkg.dependencies['expo-dev-client'];
    fs.writeFileSync(mobilePkgPath, JSON.stringify(mobilePkg, null, 2) + '\n');
  }
  // Also strip from app.json plugins if present
  const appJsonPath = path.join(SHORT_ROOT, 'apps/mobile/app.json');
  if (fs.existsSync(appJsonPath)) {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    if (Array.isArray(appJson.expo?.plugins)) {
      appJson.expo.plugins = appJson.expo.plugins.filter(
        (p) => !(typeof p === 'string' && p.includes('dev-client')) &&
          !(Array.isArray(p) && String(p[0]).includes('dev-client'))
      );
      fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');
    }
  }

  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  for (const rel of ['apps/mobile/node_modules', 'apps/web/node_modules', 'apps/api/node_modules']) {
    const nested = path.join(SHORT_ROOT, rel);
    if (fs.existsSync(nested)) fs.rmSync(nested, { recursive: true, force: true });
  }
  run(pnpm, ['install'], { cwd: SHORT_ROOT });
  run(pnpm, ['exec', 'expo', 'prebuild', '--no-install', '-p', 'android', '--clean'], {
    cwd: path.join(SHORT_ROOT, 'apps', 'mobile'),
  });

  const gp = path.join(SHORT_ROOT, 'apps/mobile/android/gradle.properties');
  let gpText = fs.readFileSync(gp, 'utf8');
  gpText = gpText.replace(/reactNativeArchitectures=.*/g, 'reactNativeArchitectures=x86_64');
  fs.writeFileSync(gp, gpText);

  const bg = path.join(SHORT_ROOT, 'apps/mobile/android/app/build.gradle');
  let bgText = fs.readFileSync(bg, 'utf8');
  if (!/debuggableVariants\s*=\s*\[\s*\]/.test(bgText)) {
    bgText = bgText.replace(
      /\/\*\s*Variants\s*\*\/[\s\S]*?\/\*\s*Bundling\s*\*\//,
      `/* Variants */\n    // Phase 77: embed JS in debug so Metro is not required.\n    debuggableVariants = []\n\n    /* Bundling */`
    );
    if (!/debuggableVariants\s*=\s*\[\s*\]/.test(bgText)) {
      // Fallback insert after react block start markers
      bgText = bgText.replace(
        /\/\/ debuggableVariants = \["liteDebug", "prodDebug"\]/,
        'debuggableVariants = []'
      );
    }
    fs.writeFileSync(bg, bgText);
  }

  const androidDir = path.join(SHORT_ROOT, 'apps/mobile/android');
  const gradlew = path.join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const gradleArgs = [
    ':app:assembleDebug',
    '--console=plain',
    '--no-watch-fs',
    '--max-workers=2',
    '-Dorg.gradle.vfs.watch=false',
    '-Dorg.gradle.parallel=false',
  ];
  const r = spawnSync(`"${gradlew}" ${gradleArgs.join(' ')}`, {
    cwd: androidDir,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) throw new Error(`assembleDebug failed with ${r.status}`);

  const apk = path.join(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(apk)) throw new Error(`APK missing at ${apk}`);

  const destDir = path.join(SOURCE_ROOT, 'artifacts', 'release');
  fs.mkdirSync(destDir, { recursive: true });
  const destApk = path.join(destDir, 'app-embedded-x86_64.apk');
  fs.copyFileSync(apk, destApk);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(destApk)).digest('hex');

  const evidence = {
    createdAt: new Date().toISOString(),
    gitRevision: rev,
    buildRoot: SHORT_ROOT,
    apkPath: 'artifacts/release/app-embedded-x86_64.apk',
    sha256,
    architecture: 'x86_64',
    packageId: 'com.daynori.app',
    signing: 'debug (local-test only — not release-eligible)',
    embeddedJs: true,
    expoDevClient: false,
    note: 'Phase 77 Metro-free embedded-bundle APK for emulator cold launch',
  };
  fs.writeFileSync(
    path.join(destDir, 'android-embedded-x86_64-apk-evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n'
  );
  console.log(`[phase77-apk] PASS ${destApk}`);
  console.log(`[phase77-apk] SHA256 ${sha256}`);
}

try {
  main();
} catch (err) {
  console.error('[phase77-apk:FAIL]', err instanceof Error ? err.message : err);
  process.exit(1);
}
