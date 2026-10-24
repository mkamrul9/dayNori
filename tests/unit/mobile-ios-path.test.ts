import { describe, expect, it } from 'vitest';
import {
  detectHostCapability,
  inspectIosAppConfig,
} from '../../scripts/mobile-ios-path.mjs';
import appJson from '../../apps/mobile/app.json';

describe('Phase 61 iOS path inspection', () => {
  it('accepts the checked-in Expo iOS configuration invariants', () => {
    const result = inspectIosAppConfig(appJson.expo);
    expect(result.ok).toBe(true);
    expect(result.findings.bundleIdentifier).toBe('com.daynori.app');
    expect(result.findings.sqlCipherIos).toBe(true);
    expect(result.findings.microphoneUsageDescription).toBe(true);
    expect(result.findings.deploymentTarget).toBe('15.1');
  });

  it('rejects missing SQLCipher iOS enablement', () => {
    const result = inspectIosAppConfig({
      scheme: 'daynori',
      ios: { bundleIdentifier: 'com.daynori.app' },
      plugins: [['expo-sqlite', { useSQLCipher: false, ios: { useSQLCipher: false } }]],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /SQLCipher/i.test(e))).toBe(true);
  });

  it('reports host capability without claiming a native build', () => {
    const host = detectHostCapability();
    expect(host.platform).toBe(process.platform);
    if (process.platform !== 'darwin') {
      expect(host.canRunNativeIosBuild).toBe(false);
      expect(host.note).toMatch(/Non-macOS/i);
    }
  });
});
