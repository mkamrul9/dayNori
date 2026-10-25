import { describe, expect, it } from 'vitest';
import {
  describeTwoActionPath,
  evaluateFeatureEligibility,
  getDefaultFeaturePersonalization,
  isPlatformOperator,
  listPrimaryShellTabs,
  parseOperatorAllowlist,
  sanitizeAndMigrateFeaturePersonalization,
  searchFeatureDirectory,
  type FeatureAuthContext,
  type FeatureReleaseContext,
} from './index.js';

const baseRelease = (): FeatureReleaseContext => ({
  platform: 'web',
  corePreview: false,
  production: false,
  moduleReleased: {
    vault: false,
    drive: false,
    rooms: false,
    billing: false,
    assistant: false,
  },
  capabilityKnown: true,
});

const ordinaryAuth = (): FeatureAuthContext => ({
  authenticated: true,
  hasWorkspaceMembership: true,
  isPlatformOperator: false,
  privilegeKnown: true,
});

const operatorAuth = (): FeatureAuthContext => ({
  ...ordinaryAuth(),
  isPlatformOperator: true,
});

describe('Phase 66 feature registry', () => {
  it('defaults leave four primary tabs', () => {
    const tabs = listPrimaryShellTabs(
      baseRelease(),
      ordinaryAuth(),
      getDefaultFeaturePersonalization()
    );
    expect(tabs.map((t) => t.id)).toEqual(['today', 'plan', 'library', 'journal']);
  });

  it('hiding Journal leaves three primary tabs (ADR 0068)', () => {
    const personal = sanitizeAndMigrateFeaturePersonalization({
      version: 1,
      hiddenFeatureIds: ['journal'],
      pinnedFeatureIds: [],
    });
    const tabs = listPrimaryShellTabs(baseRelease(), ordinaryAuth(), personal);
    expect(tabs.map((t) => t.id)).toEqual(['today', 'plan', 'library']);
  });

  it('separates release, auth, and personal visibility', () => {
    const vaultHidden = evaluateFeatureEligibility(
      'vault',
      baseRelease(),
      ordinaryAuth(),
      getDefaultFeaturePersonalization()
    );
    expect(vaultHidden.releaseOk).toBe(false);
    expect(vaultHidden.reason).toBe('not-released');
    expect(vaultHidden.usable).toBe(false);

    const personal = sanitizeAndMigrateFeaturePersonalization({
      version: 1,
      hiddenFeatureIds: ['expenses'],
      pinnedFeatureIds: [],
    });
    const expenses = evaluateFeatureEligibility(
      'expenses',
      baseRelease(),
      ordinaryAuth(),
      personal
    );
    expect(expenses.releaseOk).toBe(true);
    expect(expenses.authOk).toBe(true);
    expect(expenses.personallyHidden).toBe(true);
    expect(expenses.usable).toBe(false);
    expect(expenses.reason).toBe('personally-hidden');
    expect(expenses.statusLabel).not.toBe('Not released yet');
  });

  it('fails closed on unknown capability and privilege', () => {
    const unknownCap = evaluateFeatureEligibility(
      'today',
      { ...baseRelease(), capabilityKnown: false },
      ordinaryAuth(),
      null
    );
    expect(unknownCap.usable).toBe(false);
    expect(unknownCap.reason).toBe('capability-unknown');

    const unknownPriv = evaluateFeatureEligibility(
      'developer-tools',
      baseRelease(),
      {
        authenticated: true,
        hasWorkspaceMembership: true,
        isPlatformOperator: false,
        privilegeKnown: false,
      },
      null
    );
    expect(unknownPriv.usable).toBe(false);
    expect(unknownPriv.reason).toBe('privilege-unknown');
  });

  it('denies developer tools to ordinary users even when authenticated owners', () => {
    const elig = evaluateFeatureEligibility(
      'developer-tools',
      baseRelease(),
      ordinaryAuth(),
      getDefaultFeaturePersonalization()
    );
    expect(elig.usable).toBe(false);
    expect(elig.reason).toBe('operator-required');
  });

  it('allows developer tools only for platform operators', () => {
    const elig = evaluateFeatureEligibility(
      'developer-tools',
      baseRelease(),
      operatorAuth(),
      getDefaultFeaturePersonalization()
    );
    expect(elig.usable).toBe(true);
  });

  it('rejects invalid, duplicate, and non-hideable personalization IDs', () => {
    const migrated = sanitizeAndMigrateFeaturePersonalization({
      version: 1,
      hiddenFeatureIds: ['settings', 'bogus', 'journal', 'journal', 'today'],
      pinnedFeatureIds: ['settings', 'expenses', 'expenses', 'not-a-feature'],
    });
    expect(migrated.hiddenFeatureIds).toEqual(['journal']);
    expect(migrated.pinnedFeatureIds).toEqual(['expenses']);
  });

  it('migrates legacy homeLayout moduleShortcuts idempotently', () => {
    const once = sanitizeAndMigrateFeaturePersonalization(null, [
      { id: 'expenses', visible: false, order: 2 },
      { id: 'unknown-widget', visible: false, order: 1 },
    ]);
    const twice = sanitizeAndMigrateFeaturePersonalization(once, [
      { id: 'expenses', visible: false, order: 2 },
    ]);
    expect(once).toEqual(twice);
    expect(once.hiddenFeatureIds).toEqual(['expenses']);
  });

  it('preserves unrelated fields by only returning personalization shape', () => {
    const migrated = sanitizeAndMigrateFeaturePersonalization({
      version: 1,
      hiddenFeatureIds: [],
      pinnedFeatureIds: ['calendar'],
      extraMalicious: true,
    });
    expect(migrated).toEqual({
      version: 1,
      hiddenFeatureIds: [],
      pinnedFeatureIds: ['calendar'],
    });
  });

  it('All features search includes hidden for restore and excludes developer for ordinary users', () => {
    const personal = sanitizeAndMigrateFeaturePersonalization({
      version: 1,
      hiddenFeatureIds: ['journal'],
      pinnedFeatureIds: [],
    });
    const results = searchFeatureDirectory('journal', baseRelease(), ordinaryAuth(), personal, {
      includeHiddenForRestore: true,
    });
    expect(results.some((r) => r.feature.id === 'journal' && r.eligibility.personallyHidden)).toBe(
      true
    );
    const developerHits = searchFeatureDirectory(
      'developer',
      baseRelease(),
      ordinaryAuth(),
      personal,
      { includeHiddenForRestore: true }
    );
    expect(developerHits.some((r) => r.feature.id === 'developer-tools')).toBe(false);
  });

  it('documents two-action reachability for non-primary modules', () => {
    expect(describeTwoActionPath('today')).toBe('shell → Today');
    expect(describeTwoActionPath('expenses')).toBe('shell → All features → Expenses');
  });

  it('keeps Settings and All features always reachable flags', () => {
    const settings = evaluateFeatureEligibility(
      'settings',
      baseRelease(),
      ordinaryAuth(),
      sanitizeAndMigrateFeaturePersonalization({
        version: 1,
        hiddenFeatureIds: ['settings'],
        pinnedFeatureIds: [],
      })
    );
    expect(settings.personallyHidden).toBe(false);
    expect(settings.usable).toBe(true);
  });
});

describe('Phase 66 operator allowlist', () => {
  const operatorId = '11111111-1111-4111-8111-111111111111';

  it('denies by default when allowlist empty', () => {
    expect(isPlatformOperator({ userId: operatorId }, {})).toBe(false);
    expect(parseOperatorAllowlist({}).size).toBe(0);
  });

  it('ignores invalid allowlist entries and profile-style escalation', () => {
    expect(
      isPlatformOperator(
        { userId: operatorId },
        { DAYNORI_OPERATOR_USER_IDS: 'not-a-uuid,also-bad' }
      )
    ).toBe(false);
    expect(isPlatformOperator({ userId: null }, { DAYNORI_OPERATOR_USER_IDS: operatorId })).toBe(
      false
    );
  });

  it('allows only listed operator UUIDs', () => {
    expect(
      isPlatformOperator(
        { userId: operatorId },
        { DAYNORI_OPERATOR_USER_IDS: `${operatorId},22222222-2222-4222-8222-222222222222` }
      )
    ).toBe(true);
    expect(
      isPlatformOperator(
        { userId: '33333333-3333-4333-8333-333333333333' },
        { DAYNORI_OPERATOR_USER_IDS: operatorId }
      )
    ).toBe(false);
  });
});
