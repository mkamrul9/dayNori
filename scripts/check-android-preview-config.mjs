import { pathToFileURL } from 'node:url';

export function checkAndroidPreviewConfig(env) {
  for (const name of ['EXPO_PUBLIC_DAYNORI_API_URL', 'EXPO_PUBLIC_SUPABASE_URL']) {
    const url = new URL(env[name] ?? '');
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname)
    )
      throw new Error(`${name} must be a hosted HTTPS origin`);
  }
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (key.startsWith('sb_publishable_') && key.length > 25) return;
  try {
    const parts = key.split('.');
    const claims = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8'));
    if (parts.length === 3 && claims.role === 'anon') return;
  } catch {
    /* Reject unrecognized configuration without printing its value. */
  }
  throw new Error(
    'The Android build requires a public Supabase key; privileged keys are forbidden'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkAndroidPreviewConfig(process.env);
    console.log('Public Android preview configuration is valid.');
  } catch {
    console.error(
      'Android preview configuration is invalid. Set hosted HTTPS origins and a public Supabase key.'
    );
    process.exitCode = 1;
  }
}
