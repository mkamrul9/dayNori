export const isCorePreview = process.env.EXPO_PUBLIC_DAYNORI_CORE_PREVIEW === 'true';
export const mobileApiTimeoutMs = isCorePreview ? 75_000 : 10_000;

/** Expo only substitutes public variables accessed using direct dot notation. */
export function getMobileRuntimeConfig() {
  return {
    apiBaseUrl: endpoint(process.env.EXPO_PUBLIC_DAYNORI_API_URL ?? 'http://127.0.0.1:3001'),
    supabaseUrl: endpoint(process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'),
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key',
  };
}

function endpoint(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname))
  ) {
    throw new Error(
      'Mobile service URLs must use HTTPS (HTTP is allowed only for local development)'
    );
  }
  return value.replace(/\/+$/, '');
}
