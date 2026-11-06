import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { PHASE81_JOURNEYS, validatePhase81UiEvidence } from './phase81-ui-evidence.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase81-evidence-test-'));
fs.mkdirSync(path.join(root, 'artifacts'));
const file = path.join(root, 'artifacts', 'synthetic-test.json');
fs.writeFileSync(file, '{"unitTestFixture":true}');
const artifact = {
  path: 'artifacts/synthetic-test.json',
  sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
};
const now = Date.parse('2026-11-05T12:00:00Z');
const fingerprint = 'a'.repeat(64);
const context = { root, now, fingerprint, sourceRevision: 'b'.repeat(40) };

function fixture() {
  const build = (platform) => {
    const relative = `artifacts/build-${platform}.json`;
    fs.writeFileSync(
      path.join(root, relative),
      JSON.stringify({
        platform,
        sourceRevision: context.sourceRevision,
        sourceFingerprint: fingerprint,
        buildId: 'test-build',
        apkSha256: artifact.sha256,
      })
    );
    return {
      path: relative,
      sha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, relative)))
        .digest('hex'),
    };
  };
  const platform = {
    environment: 'synthetic validator unit fixture',
    buildId: 'test-build',
    method: 'automated-ui',
    journeys: PHASE81_JOURNEYS.map((id) => ({
      id,
      chapterId: 'tour.files-audio',
      status: 'pass',
      steps: [
        {
          control: 'synthetic-control',
          action: 'unit-fixture-action',
          assertion: 'unit-fixture-assertion',
          status: 'pass',
          entityId: 'synthetic-record',
          operationId: 'synthetic-operation',
          resultSource: 'durable-result',
        },
      ],
      artifacts: [artifact],
    })),
  };
  const review = {
    status: 'pass',
    reviewer: 'synthetic unit fixture',
    method: 'spoken-listen-through',
    observedAt: '2026-11-05T11:00:00Z',
    observations: ['synthetic validator fixture only'],
    deviceClass: 'physical',
    artifacts: [artifact],
  };
  return {
    schemaVersion: 2,
    phase: 81,
    sourceRevision: 'b'.repeat(40),
    sourceFingerprint: fingerprint,
    recordedAt: '2026-11-05T11:00:00Z',
    platforms: {
      desktopWeb: { ...structuredClone(platform), buildArtifact: build('desktopWeb') },
      narrowPwa: {
        ...structuredClone(platform),
        buildArtifact: build('narrowPwa'),
        browserMode: 'installed-pwa',
      },
      nativeAndroid: {
        ...structuredClone(platform),
        buildArtifact: build('nativeAndroid'),
        apkArtifact: artifact,
        deviceClass: 'emulator',
        serial: 'synthetic-emulator',
        apkSha256: artifact.sha256,
      },
    },
    reviews: Object.fromEntries(
      ['desktopKeyboard', 'desktopScreenReader', 'phoneChapterResume', 'phoneScreenReader'].map(
        (id) => [id, structuredClone(review)]
      )
    ),
  };
}

test('rejects legacy three-boolean attestation', () => {
  assert.equal(
    validatePhase81UiEvidence(
      {
        desktopWeb: { ok: true, provenance: 'yes' },
        narrowPwa: { ok: true, provenance: 'yes' },
        nativeAndroid: { ok: true, provenance: 'yes' },
      },
      context
    ).ok,
    false
  );
});

test('validates full structural fixture without representing it as actual journey evidence', () => {
  assert.deepEqual(validatePhase81UiEvidence(fixture(), context), { ok: true, unmet: [] });
});

test('rejects malformed collection fields without throwing or accepting boolean attestations', () => {
  const evidence = fixture();
  evidence.platforms.desktopWeb.journeys = true;
  evidence.platforms.nativeAndroid.journeys[0].steps = { ok: true };
  evidence.platforms.narrowPwa.journeys[0].steps = [null];
  const result = validatePhase81UiEvidence(evidence, context);
  assert.equal(result.ok, false);
  assert.ok(result.unmet.includes('desktopWeb:expenses'));
  assert.ok(result.unmet.includes('nativeAndroid:files-audio:observations'));
});

test('rejects wrong source, stale timestamps, and missing canonical receipts', () => {
  const evidence = fixture();
  evidence.sourceFingerprint = 'd'.repeat(64);
  evidence.recordedAt = '2026-10-01T12:00:00Z';
  evidence.platforms.desktopWeb.journeys.find((j) => j.id === 'expenses').steps[0].operationId = '';
  const result = validatePhase81UiEvidence(evidence, context);
  assert.ok(result.unmet.includes('source_fingerprint'));
  assert.ok(result.unmet.includes('evidence_timestamp'));
  assert.ok(result.unmet.includes('desktopWeb:expenses:canonical_receipt'));
});

test('rejects an internally declared build that differs from the current source', () => {
  const evidence = fixture();
  evidence.sourceRevision = 'c'.repeat(40);
  evidence.platforms.desktopWeb.buildId = 'different-build';
  const result = validatePhase81UiEvidence(evidence, context);
  assert.ok(result.unmet.includes('source_revision_mismatch'));
  assert.ok(result.unmet.includes('desktopWeb:build_mismatch'));
});

test('rejects missing journeys, edited artifacts, traversal, and false spoken/physical substitutes', () => {
  const evidence = fixture();
  evidence.platforms.nativeAndroid.journeys.pop();
  evidence.platforms.desktopWeb.journeys[0].artifacts = [{ ...artifact, sha256: '0'.repeat(64) }];
  evidence.platforms.narrowPwa.journeys[0].artifacts = [{ ...artifact, path: '../outside.json' }];
  evidence.reviews.phoneScreenReader.deviceClass = 'emulator';
  evidence.reviews.desktopScreenReader.method = 'xml-hierarchy-only';
  const result = validatePhase81UiEvidence(evidence, context);
  assert.equal(result.ok, false);
  assert.ok(result.unmet.includes('review:phoneScreenReader:physical_device'));
  assert.ok(result.unmet.includes('review:desktopScreenReader:spoken_review'));
  assert.ok(result.unmet.includes('nativeAndroid:cleanup-preservation'));
});
