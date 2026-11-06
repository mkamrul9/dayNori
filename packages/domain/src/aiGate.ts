/**
 * Phase 55 — AI local enablement gate (fail-closed in production).
 * Live provider calls require a separate explicit flag and credentials.
 * Phase 90 — Server-enforced kill switch overrides all enablement.
 */

export function isAiKillSwitchActive(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return env['DAYNORI_AI_KILL_SWITCH'] === 'true';
}

export function isAiLocallyEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  if (isAiKillSwitchActive(env)) {
    return false;
  }
  const nodeEnv = env['NODE_ENV'] ?? 'development';
  if (nodeEnv === 'production') {
    // Production never enables AI via the local harness flag.
    return false;
  }
  if (nodeEnv === 'test') return true;
  return env['DAYNORI_AI_LOCAL_ENABLED'] === 'true';
}

export function isAiLiveProviderEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return isAiLocallyEnabled(env) && env['DAYNORI_AI_LIVE_ENABLED'] === 'true';
}
