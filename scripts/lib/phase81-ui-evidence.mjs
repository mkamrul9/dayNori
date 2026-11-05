import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const PHASE81_JOURNEYS = [
  'files-audio',
  'expenses',
  'custom-sections',
  'offline-sync',
  'trash-recovery',
  'safe-account-deletion',
  'safe-recovery-secrets',
  'safe-billing',
  'safe-sharing',
  'gated-vault-denial',
  'gated-reminders-denial',
  'scope-isolation',
  'cleanup-preservation',
];

const MUTATIONS = new Set([
  'files-audio',
  'expenses',
  'custom-sections',
  'trash-recovery',
  'cleanup-preservation',
]);

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

export function phase81SourceFingerprint(root) {
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
  files.push(...(added.stdout || '').split('\0').filter(Boolean));
  for (const file of [...new Set(files)].sort()) {
    if (!fs.existsSync(path.join(root, file))) {
      digest.update(`${file}\0deleted\0`);
      continue;
    }
    digest.update(`${file}\0${hash(fs.readFileSync(path.join(root, file)))}\0`);
  }
  return digest.digest('hex');
}

/** Structural validation cannot prove a human observation; retain its method and actual evidence. */
export function validatePhase81UiEvidence(
  raw,
  { root, fingerprint, sourceRevision, now = Date.now() }
) {
  const unmet = [];
  const reject = (label) => unmet.push(label);
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  const recent = (value) =>
    text(value) &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= now + 60_000 &&
    now - Date.parse(value) <= 72 * 60 * 60 * 1000;
  if (!object(raw) || raw.schemaVersion !== 2 || raw.phase !== 81) {
    return { ok: false, unmet: ['evidence_schema_v2_required'] };
  }
  if (!recent(raw.recordedAt)) reject('evidence_timestamp');
  if (!/^[a-f0-9]{40}$/.test(raw.sourceRevision || '')) reject('source_revision');
  const actualRevision =
    sourceRevision ??
    spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim();
  if (!actualRevision || raw.sourceRevision !== actualRevision) reject('source_revision_mismatch');
  if (!fingerprint || raw.sourceFingerprint !== fingerprint) reject('source_fingerprint');

  if (!fs.existsSync(path.join(root, 'artifacts')))
    return { ok: false, unmet: [...unmet, 'artifacts_missing'] };
  const evidenceRoot = fs.realpathSync(path.join(root, 'artifacts'));
  const verifyArtifact = (artifact) => {
    if (!object(artifact) || !text(artifact.path) || !/^[a-f0-9]{64}$/.test(artifact.sha256 || ''))
      return false;
    const candidate = path.resolve(root, artifact.path);
    if (!fs.existsSync(candidate)) return false;
    const actual = fs.realpathSync(candidate);
    const relative = path.relative(evidenceRoot, actual);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(actual).isFile())
      return false;
    return hash(fs.readFileSync(actual)) === artifact.sha256;
  };

  for (const platform of ['desktopWeb', 'narrowPwa', 'nativeAndroid']) {
    const entry = raw.platforms?.[platform];
    if (!object(entry)) {
      reject(`${platform}:missing`);
      continue;
    }
    if (
      !text(entry.environment) ||
      !text(entry.buildId) ||
      !['automated-ui', 'manual-ui'].includes(entry.method)
    )
      reject(`${platform}:provenance`);
    if (!verifyArtifact(entry.buildArtifact)) reject(`${platform}:build_artifact`);
    else {
      try {
        const build = JSON.parse(
          fs.readFileSync(path.resolve(root, entry.buildArtifact.path), 'utf8')
        );
        if (
          build.sourceRevision !== raw.sourceRevision ||
          build.sourceFingerprint !== fingerprint ||
          build.buildId !== entry.buildId ||
          build.platform !== platform ||
          (platform === 'nativeAndroid' && build.apkSha256 !== entry.apkSha256)
        )
          reject(`${platform}:build_mismatch`);
      } catch {
        reject(`${platform}:build_manifest`);
      }
    }
    if (
      platform === 'nativeAndroid' &&
      (!['emulator', 'physical'].includes(entry.deviceClass) ||
        !text(entry.serial) ||
        !/^[a-f0-9]{64}$/.test(entry.apkSha256 || ''))
    )
      reject(`${platform}:apk_device`);
    if (
      platform === 'nativeAndroid' &&
      (!verifyArtifact(entry.apkArtifact) || entry.apkArtifact.sha256 !== entry.apkSha256)
    )
      reject(`${platform}:apk_artifact`);
    if (
      platform === 'narrowPwa' &&
      !['installed-pwa', 'viewport-emulation'].includes(entry.browserMode)
    ) {
      reject(`${platform}:browser_mode`);
    }
    for (const journeyId of PHASE81_JOURNEYS) {
      const journey = Array.isArray(entry.journeys)
        ? entry.journeys.find((j) => object(j) && j.id === journeyId)
        : undefined;
      if (!object(journey) || journey.status !== 'pass' || !text(journey.chapterId)) {
        reject(`${platform}:${journeyId}`);
        continue;
      }
      if (
        !Array.isArray(journey.steps) ||
        journey.steps.length === 0 ||
        journey.steps.some(
          (s) =>
            !object(s) ||
            !text(s.control) ||
            !text(s.action) ||
            !text(s.assertion) ||
            s.status !== 'pass'
        )
      ) {
        reject(`${platform}:${journeyId}:observations`);
      }
      if (
        MUTATIONS.has(journeyId) &&
        !(
          Array.isArray(journey.steps) &&
          journey.steps.some(
            (s) =>
              object(s) &&
              text(s.entityId) &&
              text(s.operationId) &&
              s.resultSource === 'durable-result'
          )
        )
      ) {
        reject(`${platform}:${journeyId}:canonical_receipt`);
      }
      if (
        !Array.isArray(journey.artifacts) ||
        journey.artifacts.length === 0 ||
        !journey.artifacts.every(verifyArtifact)
      )
        reject(`${platform}:${journeyId}:artifacts`);
    }
  }

  for (const reviewId of [
    'desktopKeyboard',
    'desktopScreenReader',
    'phoneChapterResume',
    'phoneScreenReader',
  ]) {
    const review = raw.reviews?.[reviewId];
    if (
      !object(review) ||
      review.status !== 'pass' ||
      !text(review.reviewer) ||
      !text(review.method) ||
      !recent(review.observedAt) ||
      !Array.isArray(review.observations) ||
      review.observations.length === 0 ||
      !review.observations.every(text) ||
      !Array.isArray(review.artifacts) ||
      review.artifacts.length === 0 ||
      !review.artifacts.every(verifyArtifact)
    )
      reject(`review:${reviewId}`);
    if (reviewId.startsWith('phone') && review?.deviceClass !== 'physical')
      reject(`review:${reviewId}:physical_device`);
    if (reviewId.includes('ScreenReader') && review?.method !== 'spoken-listen-through') {
      reject(`review:${reviewId}:spoken_review`);
    }
  }
  return { ok: unmet.length === 0, unmet };
}
