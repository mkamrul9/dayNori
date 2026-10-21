import { afterEach, describe, expect, it, vi } from 'vitest';

describe('nativePlatform helpers', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('react-native');
  });

  it('labels android device ids on android', async () => {
    vi.doMock('react-native', () => ({ Platform: { OS: 'android', Version: 34 } }));
    const mod = await import('./nativePlatform.js');
    expect(mod.getNativeMobilePlatform()).toBe('android');
    expect(mod.createMobileDeviceId()).toMatch(/^mobile_android_/);
  });

  it('labels ios device ids on ios', async () => {
    vi.doMock('react-native', () => ({ Platform: { OS: 'ios', Version: '18.0' } }));
    const mod = await import('./nativePlatform.js');
    expect(mod.getNativeMobilePlatform()).toBe('ios');
    expect(mod.isIosPlatform()).toBe(true);
    expect(mod.createMobileDeviceId()).toMatch(/^mobile_ios_/);
  });
});
