import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const PHASE85_JOURNEYS = [
  'native-android-channels-and-categories',
  'native-android-permission-lifecycle',
  'native-android-content-privacy',
  'native-android-quiet-hours-policy',
  'native-android-synthetic-test-notification',
  'native-android-source-lifecycle-cancellation',
  'native-android-account-isolation-and-optout',
];

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function phase85SourceFingerprint(root) {
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
    { cwd: root, encoding: 'utf8' }
  );
  if (listed.status !== 0) throw new Error('source_inventory_unavailable');
  const digest = crypto.createHash('sha256');
  const files = listed.stdout.split('\0').filter(Boolean);
  const added = spawnSync(
    'git',
    [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      'apps',
      'packages',
      'scripts',
      'tests',
    ],
    { cwd: root, encoding: 'utf8' }
  );
  if (added.status === 0) {
    for (const file of added.stdout.split('\0').filter(Boolean)) {
      if (!files.includes(file)) files.push(file);
    }
  }
  files.sort();
  for (const file of files) {
    const full = path.resolve(root, file);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
    digest.update(file);
    digest.update('\0');
    digest.update(fs.readFileSync(full));
    digest.update('\0');
  }
  return digest.digest('hex');
}

export function validatePhase85UiEvidence(evidence, context = {}) {
  const unmet = [];
  const reject = (id) => unmet.push(id);
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, unmet: ['evidence_missing'] };
  }
  if (evidence.phase !== 85) reject('phase_mismatch');
  if (context.head && evidence.gitRev !== context.head) reject('head_mismatch');
  if (context.sourceFingerprint && evidence.sourceFingerprint !== context.sourceFingerprint) {
    reject('source_fingerprint_mismatch');
  }

  const platforms = evidence.platforms || {};
  const nativeAndroid = platforms.nativeAndroid;
  if (!nativeAndroid) {
    reject('platform:nativeAndroid');
  } else {
    const seen = new Set((nativeAndroid.journeys || []).map((j) => j.id));
    for (const expected of PHASE85_JOURNEYS) {
      if (!seen.has(expected)) reject(`nativeAndroid:${expected}`);
    }
    for (const journey of nativeAndroid.journeys || []) {
      for (const artifact of journey.artifacts || []) {
        if (!artifact.path || !artifact.sha256) {
          reject(`nativeAndroid:${journey.id}:artifact_malformed`);
          continue;
        }
        if (context.artifactsDir) {
          const full = path.resolve(context.artifactsDir, artifact.path);
          if (!fs.existsSync(full)) {
            reject(`nativeAndroid:${journey.id}:missing_file:${artifact.path}`);
            continue;
          }
          const actualSha = hash(fs.readFileSync(full));
          if (actualSha !== artifact.sha256) {
            reject(`nativeAndroid:${journey.id}:sha_mismatch:${artifact.path}`);
          }
        }
      }
    }
  }

  // Physical review checks: physical Android hardware is unmet
  const reviews = evidence.physicalReviews || {};
  if (reviews.physicalAndroidDevice?.status !== 'unmet') {
    reject('physicalAndroidDevice_must_be_truthfully_unmet');
  }

  return {
    ok: unmet.length === 0,
    unmet,
  };
}
