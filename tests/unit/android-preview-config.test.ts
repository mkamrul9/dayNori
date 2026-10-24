import { expect, it } from 'vitest';
// @ts-expect-error Existing release scripts are plain JavaScript entry points.
import { checkAndroidPreviewConfig } from '../../scripts/check-android-preview-config.mjs';

const env = {
  EXPO_PUBLIC_DAYNORI_API_URL: 'https://api.example.test',
  EXPO_PUBLIC_SUPABASE_URL: 'https://auth.example.test',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_synthetic_public_key',
};
it('accepts hosted origins and a public build key', () => {
  expect(() => checkAndroidPreviewConfig(env)).not.toThrow();
});
it('rejects local endpoints and privileged credentials before building an APK', () => {
  expect(() =>
    checkAndroidPreviewConfig({ ...env, EXPO_PUBLIC_DAYNORI_API_URL: 'http://127.0.0.1:3001' })
  ).toThrow();
  expect(() =>
    checkAndroidPreviewConfig({ ...env, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_secret_private' })
  ).toThrow();
  const privileged = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  expect(() =>
    checkAndroidPreviewConfig({ ...env, EXPO_PUBLIC_SUPABASE_ANON_KEY: privileged })
  ).toThrow();
});
