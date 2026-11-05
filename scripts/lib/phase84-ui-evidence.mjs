import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const PHASE84_JOURNEYS = [
  'web-push-capability-agenda',
  'web-push-subscription',
  'web-push-test-notification',
  'web-push-content-privacy',
  'web-push-quiet-hours',
  'web-push-source-lifecycle',
  'web-push-unsubscribe',
];

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function phase84SourceFingerprint(root) {
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

export function validatePhase84UiEvidence(evidence, context = {}) {
  const unmet = [];
  const reject = (id) => unmet.push(id);
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, unmet: ['evidence_missing'] };
  }
  if (evidence.phase !== 84) reject('phase_mismatch');
  if (context.head && evidence.gitRev !== context.head) reject('head_mismatch');
  if (context.sourceFingerprint && evidence.sourceFingerprint !== context.sourceFingerprint) {
    reject('source_fingerprint_mismatch');
  }

  const platforms = evidence.platforms || {};
  for (const plat of ['desktopWeb', 'narrowPwa']) {
    const p = platforms[plat];
    if (!p) {
      reject(`platform:${plat}`);
      continue;
    }
    const seen = new Set((p.journeys || []).map((j) => j.id));
    for (const expected of PHASE84_JOURNEYS) {
      if (!seen.has(expected)) reject(`${plat}:${expected}`);
    }
    for (const journey of p.journeys || []) {
      for (const artifact of journey.artifacts || []) {
        if (!artifact.path || !artifact.sha256) {
          reject(`${plat}:${journey.id}:artifact_malformed`);
          continue;
        }
        if (context.artifactsDir) {
          const full = path.resolve(context.artifactsDir, artifact.path);
          if (!fs.existsSync(full)) {
            reject(`${plat}:${journey.id}:artifact_missing:${artifact.path}`);
          } else {
            const actual = hash(fs.readFileSync(full));
            if (actual !== artifact.sha256) {
              reject(`${plat}:${journey.id}:sha_mismatch:${artifact.path}`);
            }
          }
        }
      }
    }
  }

  const reviews = evidence.reviews || {};
  for (const reviewId of ['physicalIphoneHomeScreen', 'physicalAndroidDevice']) {
    const review = reviews[reviewId];
    if (
      !review ||
      review.status !== 'unmet' ||
      !review.reason ||
      review.deviceClass !== 'physical'
    ) {
      reject(`review:${reviewId}:physical_device_truthful_accounting`);
    }
  }

  return { ok: unmet.length === 0, unmet };
}
