import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE85_JOURNEYS,
  validatePhase85UiEvidence,
} from './phase85-ui-evidence.mjs';

test('PHASE85_JOURNEYS contains all 7 core native Android journeys', () => {
  assert.equal(PHASE85_JOURNEYS.length, 7);
  assert.ok(PHASE85_JOURNEYS.includes('native-android-channels-and-categories'));
  assert.ok(PHASE85_JOURNEYS.includes('native-android-permission-lifecycle'));
  assert.ok(PHASE85_JOURNEYS.includes('native-android-content-privacy'));
  assert.ok(PHASE85_JOURNEYS.includes('native-android-quiet-hours-policy'));
  assert.ok(PHASE85_JOURNEYS.includes('native-android-synthetic-test-notification'));
  assert.ok(PHASE85_JOURNEYS.includes('native-android-source-lifecycle-cancellation'));
  assert.ok(PHASE85_JOURNEYS.includes('native-android-account-isolation-and-optout'));
});

test('validatePhase85UiEvidence validates truthful physical reviews and journeys', () => {
  const dummyJourneys = PHASE85_JOURNEYS.map((id) => ({
    id,
    status: 'pass',
    artifacts: [],
  }));

  const validEvidence = {
    phase: 85,
    gitRev: 'abc1234',
    sourceFingerprint: 'fprint',
    platforms: {
      nativeAndroid: {
        journeys: dummyJourneys,
      },
    },
    physicalReviews: {
      physicalAndroidDevice: {
        target: 'Physical Android device',
        status: 'unmet',
        reason: 'Physical Android hardware unavailable in local execution environment.',
      },
    },
  };

  const res = validatePhase85UiEvidence(validEvidence, {
    head: 'abc1234',
    sourceFingerprint: 'fprint',
  });
  assert.equal(res.ok, true, `Expected ok but got unmet: ${res.unmet.join(', ')}`);
});

test('validatePhase85UiEvidence rejects false pass claims for physical devices', () => {
  const dummyJourneys = PHASE85_JOURNEYS.map((id) => ({
    id,
    status: 'pass',
    artifacts: [],
  }));

  const invalidEvidence = {
    phase: 85,
    gitRev: 'abc1234',
    platforms: {
      nativeAndroid: {
        journeys: dummyJourneys,
      },
    },
    physicalReviews: {
      physicalAndroidDevice: {
        status: 'pass', // False claim!
      },
    },
  };

  const res = validatePhase85UiEvidence(invalidEvidence, { head: 'abc1234' });
  assert.equal(res.ok, false);
  assert.ok(res.unmet.includes('physicalAndroidDevice_must_be_truthfully_unmet'));
});
