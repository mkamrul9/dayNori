/**
 * Phase 61 — iOS parity contracts (synthetic / host-local).
 * Does not execute Xcode, Simulator, or physical-device verification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemorySecureStore } from '../../apps/mobile/src/auth/secureStorage.js';
import {
  getOrCreateMobileDeviceId,
  resetMobileDeviceIdCacheForTests,
} from '../../apps/mobile/src/data/syncAdapter.js';

describe('Phase 61 iOS parity (synthetic)', () => {
  beforeEach(() => {
    resetMobileDeviceIdCacheForTests();
    vi.resetModules();
  });

  afterEach(() => {
    resetMobileDeviceIdCacheForTests();
    vi.doUnmock('react-native');
  });

  it('persists platform-prefixed sync device ids for iOS', async () => {
    vi.doMock('react-native', () => ({ Platform: { OS: 'ios', Version: '18.2' } }));
    // Re-import sync helpers after Platform mock — device id factory reads Platform at call time
    // via nativePlatform module; syncAdapter already imported createMobileDeviceId at load.
    // Exercise the shared factory directly under the mock.
    const { createMobileDeviceId, getNativeMobilePlatform } = await import(
      '../../apps/mobile/src/platform/nativePlatform.js'
    );
    expect(getNativeMobilePlatform()).toBe('ios');
    expect(createMobileDeviceId()).toMatch(/^mobile_ios_/);

    const store = new InMemorySecureStore();
    // getOrCreateMobileDeviceId uses createMobileDeviceId from the already-loaded syncAdapter;
    // seed via store then verify persistence round-trip.
    const id = createMobileDeviceId();
    await store.setItemAsync('daynori_native_device_id', id);
    resetMobileDeviceIdCacheForTests();
    const restored = await getOrCreateMobileDeviceId(store);
    expect(restored).toBe(id);
    expect(restored.startsWith('mobile_ios_')).toBe(true);
  });

  it('keeps Android exact-alarm capability false in notification capability shape', async () => {
    const { getNotificationCapabilityAsync } = await import(
      '../../apps/mobile/src/notifications/adapter.js'
    );
    const capability = await getNotificationCapabilityAsync();
    expect(capability.isExactAlarmPermitted).toBe(false);
    expect(['android', 'ios']).toContain(capability.platform);
  });

  it('records that optional modules remain gated for iOS parity claims', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const matrixPath = path.resolve(process.cwd(), 'docs/engineering/ios-support-matrix.md');
    const matrix = fs.readFileSync(matrixPath, 'utf8');
    expect(matrix).toMatch(/Vault unlock \/ production vault \| Disabled by release gate/i);
    expect(matrix).toMatch(/Live AI \/ assistant \| Disabled by release gate/i);
    expect(matrix).toMatch(/Production billing \/ StoreKit \| Disabled by release gate/i);
    expect(matrix).toMatch(/Google Drive connector \| Disabled by release gate/i);
    expect(matrix).toMatch(/Rooms \/ chat \| Disabled by release gate/i);
  });
});
