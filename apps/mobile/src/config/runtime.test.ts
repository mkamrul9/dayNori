import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMobileRuntimeConfig } from './runtime.js';

afterEach(() => vi.unstubAllEnvs());
describe('phone deployment service configuration', () => {
  it('uses public build variables instead of server-only environment values', () => {
    vi.stubEnv('EXPO_PUBLIC_DAYNORI_API_URL', 'https://api.phone-test.example/');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://auth.phone-test.example/');
    vi.stubEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'public-anon-example');
    vi.stubEnv('DAYNORI_API_URL', 'https://server-only.example');
    expect(getMobileRuntimeConfig()).toEqual({
      apiBaseUrl: 'https://api.phone-test.example',
      supabaseUrl: 'https://auth.phone-test.example',
      supabaseAnonKey: 'public-anon-example',
    });
  });
  it.each([
    'javascript:alert(1)',
    'http://public.example',
    'https://user:pass@public.example',
    'https://public.example/?token=example',
  ])('rejects unsafe endpoint %s', (url) => {
    vi.stubEnv('EXPO_PUBLIC_DAYNORI_API_URL', url);
    expect(() => getMobileRuntimeConfig()).toThrow();
  });
});
