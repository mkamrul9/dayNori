#!/usr/bin/env node
/**
 * Copy Phase 71 (and related) working-tree sources into the short-path APK build root.
 * The APK helper checks out Git HEAD; uncommitted mobile/ui-mobile edits must be synced
 * explicitly so the tested APK matches intended Phase 71 sources.
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

const SYNC_GLOBS = [
  'apps/mobile',
  'packages/ui-mobile',
  'packages/design-tokens',
  'packages/domain',
  'packages/contracts',
  'packages/sync',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  // .npmrc intentionally omitted: short-root build forces node-linker=hoisted
  // after sync to keep Windows NDK/CMake paths under CMAKE_OBJECT_PATH_MAX.
  'scripts/build-android-debug-apk.mjs',
  'scripts/sync-short-build-working-tree.mjs',
  'scripts/test-android-e2e.mjs',
];

function copyRecursive(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === 'node_modules' || name === 'android' || name === 'ios' || name === '.expo') {
        continue;
      }
      copyRecursive(path.join(src, name), path.join(dst, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function fingerprintPaths(root, rels) {
  const hash = crypto.createHash('sha256');
  const files = [];
  function walk(abs, rel) {
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(abs).sort()) {
        if (name === 'node_modules' || name === 'android' || name === 'ios' || name === '.expo') {
          continue;
        }
        walk(path.join(abs, name), path.join(rel, name).replace(/\\/g, '/'));
      }
      return;
    }
    files.push(rel);
    hash.update(rel);
    hash.update(fs.readFileSync(abs));
  }
  for (const rel of rels) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    walk(abs, rel.replace(/\\/g, '/'));
  }
  return { sha256: hash.digest('hex'), fileCount: files.length };
}

function main() {
  if (!fs.existsSync(SHORT_ROOT)) {
    throw new Error(`Short build root missing: ${SHORT_ROOT}`);
  }

  for (const rel of SYNC_GLOBS) {
    const src = path.join(SOURCE_ROOT, rel);
    const dst = path.join(SHORT_ROOT, rel);
    if (!fs.existsSync(src)) {
      console.warn(`[apk-sync] skip missing ${rel}`);
      continue;
    }
    console.log(`[apk-sync] ${rel}`);
    copyRecursive(src, dst);
  }

  const rev = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: SOURCE_ROOT,
    encoding: 'utf8',
  }).stdout.trim();
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: SOURCE_ROOT,
    encoding: 'utf8',
  }).stdout.trim();
  const fp = fingerprintPaths(SOURCE_ROOT, [
    'apps/mobile/App.tsx',
    'apps/mobile/src',
    'packages/ui-mobile/src',
  ]);

  const out = {
    createdAt: new Date().toISOString(),
    gitRevision: rev,
    workingTreeDirty: status.length > 0,
    workingTreeFingerprint: fp.sha256,
    fingerprintFileCount: fp.fileCount,
    syncedPaths: SYNC_GLOBS,
    shortRoot: SHORT_ROOT,
  };
  const destDir = path.join(SOURCE_ROOT, 'artifacts', 'release');
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(
    path.join(destDir, 'android-working-tree-sync.json'),
    JSON.stringify(out, null, 2) + '\n'
  );
  console.log(`[apk-sync] fingerprint ${fp.sha256} (${fp.fileCount} files)`);
  console.log(`[apk-sync] dirty=${out.workingTreeDirty}`);
}

try {
  main();
} catch (err) {
  console.error('[apk-sync:FAIL]', err instanceof Error ? err.message : err);
  process.exit(1);
}
