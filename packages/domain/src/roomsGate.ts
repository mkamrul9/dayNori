/**
 * Shared rooms / chat local enablement gate.
 * Local flags must never authorize production activation.
 */

export type RoomsGateEnv = {
  NODE_ENV?: string | undefined;
  DAYNORI_ROOMS_LOCAL_ENABLED?: string | undefined;
};

/**
 * Returns true only for test/development runtimes when the local flag is set
 * (or NODE_ENV is test). Production always returns false even if the local flag is present.
 */
export function isRoomsLocallyEnabled(env: RoomsGateEnv = process.env): boolean {
  const nodeEnv = env.NODE_ENV ?? '';
  if (nodeEnv === 'production') {
    return false;
  }
  if (nodeEnv === 'test') {
    return true;
  }
  if (nodeEnv === 'development') {
    return env.DAYNORI_ROOMS_LOCAL_ENABLED === 'true';
  }
  // Unknown NODE_ENV: fail closed unless explicitly local-flagged and not production-shaped.
  return env.DAYNORI_ROOMS_LOCAL_ENABLED === 'true' && nodeEnv !== 'production';
}
