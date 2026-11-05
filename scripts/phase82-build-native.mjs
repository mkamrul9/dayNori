/** Incremental source-matched embedded APK build for Phase 82. Preserves the prepared checkout and native configuration. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shortRoot = path.resolve(process.env.DAYNORI_SHORT_BUILD_ROOT || 'D:/SWE/daynori-src');
const out = path.join(root, 'artifacts/local/phase82');
const validShortRoots = ['d:/d/daynori', 'd:/swe/daynori-src', 'y:', 'y:/'];
const resolvedShort = fs.existsSync(shortRoot) ? fs.realpathSync(shortRoot).toLowerCase().replaceAll('\\', '/') : '';
if (
  !validShortRoots.includes(shortRoot.toLowerCase().replaceAll('\\', '/')) &&
  !validShortRoots.includes(resolvedShort)
) {
  throw new Error('Unexpected prepared build directory. Inspect it before adapting this helper.');
}

const sources = [
  'apps/mobile/App.tsx',
  'apps/mobile/src',
  'apps/mobile/assets',
  'apps/mobile/metro.config.js',
  'apps/mobile/android/app/src/main/java/com/daynori/app/MainActivity.kt',
  'packages/ui-mobile/assets',
  ...['domain', 'contracts', 'sync', 'api-client', 'ui-mobile', 'design-tokens'].flatMap((name) => [
    `packages/${name}/src`,
    `packages/${name}/dist`,
  ]),
];

function sourceFingerprint(dir) {
  const listed = spawnSync(
    'git',
    [
      'ls-files',
      '-z',
      '--',
      'apps',
      'packages',
      'scripts',
      'tests',
      'package.json',
      'pnpm-lock.yaml',
    ],
    { cwd: dir, encoding: 'utf8' }
  );
  if (listed.status !== 0) throw new Error('source_inventory_unavailable');
  const digest = crypto.createHash('sha256');
  const files = listed.stdout.split('\0').filter(Boolean);
  files.sort();
  for (const rel of files) {
    const full = path.join(dir, rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) continue;
    digest.update(rel);
    digest.update(fs.readFileSync(full));
  }
  return digest.digest('hex');
}

const gradle = path.join(shortRoot, 'apps/mobile/android/app/build.gradle');
if (!/debuggableVariants\s*=\s*\[\s*\]/.test(fs.readFileSync(gradle, 'utf8')))
  throw new Error('Embedded bundle configuration required');

const fingerprint = sourceFingerprint(root);

function copy(source, destination) {
  if (!fs.existsSync(source)) return;
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('Unexpected source symlink');
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source))
      copy(path.join(source, name), path.join(destination, name));
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

for (const relative of sources) copy(path.join(root, relative), path.join(shortRoot, relative));

console.log('Running Gradle :app:createBundleDebugJsAndAssets :app:assembleDebug in', shortRoot);
const result = spawnSync(
  'cmd.exe',
  [
    '/d',
    '/c',
    'gradlew.bat :app:createBundleDebugJsAndAssets :app:assembleDebug -PreactNativeArchitectures=x86_64 --console=plain --no-watch-fs --max-workers=2 -Dorg.gradle.vfs.watch=false -Dorg.gradle.parallel=false',
  ],
  {
    cwd: path.join(shortRoot, 'apps/mobile/android'),
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      EXPO_PUBLIC_DAYNORI_API_URL: 'http://10.0.2.2:3001',
      EXPO_PUBLIC_SUPABASE_URL: 'http://10.0.2.2:54321',
      EXPO_PUBLIC_DAYNORI_CORE_PREVIEW: 'true',
    },
  }
);
if (result.status !== 0) throw new Error(`Native build failed (${result.status})`);

const apk = path.join(shortRoot, 'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk');
fs.mkdirSync(out, { recursive: true });
const dest = path.join(out, 'phase82-embedded-x86_64.apk');
fs.copyFileSync(apk, dest);
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).stdout.trim();

fs.writeFileSync(
  path.join(out, 'native-build.json'),
  JSON.stringify(
    {
      phase: 82,
      sourceRevision: revision,
      sourceFingerprint: fingerprint,
      builtAt: new Date().toISOString(),
      apkSha256: sha256,
      apkPath: path.relative(root, dest).replaceAll('\\', '/'),
      embeddedJs: true,
      deviceClass: 'emulator',
      architecture: 'x86_64',
      nativeConfiguration: 'existing prepared Phase 77 embedded configuration',
    },
    null,
    2
  )
);
console.log(JSON.stringify({ phase: 82, apkSha256: sha256, sourceFingerprint: fingerprint }));

// Install on emulator if running
const adb = 'C:\\Users\\Lenovo\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
if (fs.existsSync(adb)) {
  const devices = spawnSync(adb, ['devices'], { encoding: 'utf8' }).stdout;
  if (devices.includes('emulator-5554')) {
    console.log('Installing fresh APK on emulator-5554...');
    const install = spawnSync(adb, ['-s', 'emulator-5554', 'install', '-r', dest], {
      encoding: 'utf8',
    });
    console.log(install.stdout.trim());
  }
}
