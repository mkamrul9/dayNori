/** Incremental source-matched embedded APK build. Preserves the prepared checkout and native configuration. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { phase80SourceFingerprint } from './lib/phase80-ui-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shortRoot = path.resolve(process.env.DAYNORI_SHORT_BUILD_ROOT || 'D:/SWE/daynori-src');
const out = path.join(root, 'artifacts/local/phase80');
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
const status = spawnSync(
  'git',
  ['status', '--porcelain', '--untracked-files=no', '--', ...sources],
  { cwd: shortRoot, encoding: 'utf8' }
);
const allowSync = process.env.DAYNORI_ALLOW_SHORT_SYNC === '1' || process.argv.includes('--sync');
if (!allowSync && (status.status !== 0 || status.stdout.trim())) {
  const lines = (status.stdout || '').trim().split('\n').map((l) => l.replace(/^[?\sMADRCU!]+\s+/, '').trim()).filter(Boolean);
  const unmanaged = lines.filter((file) => !sources.some((s) => file.startsWith(s) || s.startsWith(file)));
  if (unmanaged.length > 0) {
    throw new Error(
      `Prepared source checkout has unmanaged changes (${unmanaged.join(', ')}). Preserve and inspect them before syncing.`
    );
  }
}
const gradle = path.join(shortRoot, 'apps/mobile/android/app/build.gradle');
if (!/debuggableVariants\s*=\s*\[\s*\]/.test(fs.readFileSync(gradle, 'utf8')))
  throw new Error('Embedded bundle configuration required');
const fingerprint = phase80SourceFingerprint(root);
function copy(source, destination) {
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
const result = spawnSync(
  'cmd.exe',
  [
    '/d',
    '/c',
    'gradlew.bat :app:createBundleDebugJsAndAssets --rerun-tasks :app:assembleDebug -PreactNativeArchitectures=x86_64 --console=plain --no-watch-fs --max-workers=2 -Dorg.gradle.vfs.watch=false -Dorg.gradle.parallel=false',
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
if (phase80SourceFingerprint(root) !== fingerprint)
  throw new Error('Source changed during build; no valid build attestation written');
const apk = path.join(shortRoot, 'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk');
fs.mkdirSync(out, { recursive: true });
const dest = path.join(out, 'phase80-embedded-x86_64.apk');
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
      phase: 80,
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
console.log(JSON.stringify({ phase: 80, apkSha256: sha256, sourceFingerprint: fingerprint }));
