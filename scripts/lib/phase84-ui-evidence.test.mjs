import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE84_JOURNEYS,
  validatePhase84UiEvidence,
} from './phase84-ui-evidence.mjs';

test('PHASE84_JOURNEYS contains all 7 core PWA push journeys', () => {
  assert.equal(PHASE84_JOURNEYS.length, 7);
  assert.ok(PHASE84_JOURNEYS.includes('web-push-capability-agenda'));
  assert.ok(PHASE84_JOURNEYS.includes('web-push-subscription'));
  assert.ok(PHASE84_JOURNEYS.includes('web-push-test-notification'));
  assert.ok(PHASE84_JOURNEYS.includes('web-push-content-privacy'));
  assert.ok(PHASE84_JOURNEYS.includes('web-push-quiet-hours'));
  assert.ok(PHASE84_JOURNEYS.includes('web-push-source-lifecycle'));
  assert.ok(PHASE84_JOURNEYS.includes('web-push-unsubscribe'));
});

test('validatePhase84UiEvidence validates truthful physical reviews and journeys', () => {
  const journeys = PHASE84_JOURNEYS.map((id) => ({
    id,
    status: 'passed',
    artifacts: [],
  }));

  const validEvidence = {
    phase: 84,
    gitRev: '8c26a33a1fcd4ec62cb566adf396c1e63f762b3c',
    sourceFingerprint: 'mock-fp',
    platforms: {
      desktopWeb: { journeys },
      narrowPwa: { journeys },
    },
    reviews: {
      physicalIphoneHomeScreen: {
        status: 'unmet',
        deviceClass: 'physical',
        reason: 'Physical iPhone hardware unavailable in this local test runner environment',
      },
      physicalAndroidDevice: {
        status: 'unmet',
        deviceClass: 'physical',
        reason: 'Physical Android hardware unavailable in this local test runner environment',
      },
    },
  };

  const res = validatePhase84UiEvidence(validEvidence, {
    head: '8c26a33a1fcd4ec62cb566adf396c1e63f762b3c',
    sourceFingerprint: 'mock-fp',
  });

  assert.equal(res.ok, true);
  assert.deepEqual(res.unmet, []);
});

test('validatePhase84UiEvidence rejects missing physical reviews or false pass claims', () => {
  const journeys = PHASE84_JOURNEYS.map((id) => ({
    id,
    status: 'passed',
    artifacts: [],
  }));

  const invalidEvidence = {
    phase: 84,
    gitRev: '8c26a33a1fcd4ec62cb566adf396c1e63f762b3c',
    sourceFingerprint: 'mock-fp',
    platforms: {
      desktopWeb: { journeys },
      narrowPwa: { journeys },
    },
    reviews: {
      physicalIphoneHomeScreen: {
        status: 'passed', // False pass without physical device
        deviceClass: 'emulator',
        reason: 'Simulated in emulator',
      },
      physicalAndroidDevice: {
        status: 'passed',
        deviceClass: 'emulator',
        reason: 'Simulated in emulator',
      },
    },
  };

  const res = validatePhase84UiEvidence(invalidEvidence, {
    head: '8c26a33a1fcd4ec62cb566adf396c1e63f762b3c',
    sourceFingerprint: 'mock-fp',
  });

  assert.equal(res.ok, false);
  assert.ok(res.unmet.some((u) => u.includes('physicalIphoneHomeScreen')));
  assert.ok(res.unmet.some((u) => u.includes('physicalAndroidDevice')));
});
