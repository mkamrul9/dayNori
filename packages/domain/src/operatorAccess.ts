/**
 * Phase 66 — Platform operator access (deny-by-default).
 *
 * Workspace ownership is NOT operator authority. Editable preferences and
 * client flags cannot grant developer tools. Unknown privilege fails closed.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OperatorActor {
  userId: string | null | undefined;
}

/**
 * Parse DAYNORI_OPERATOR_USER_IDS (comma-separated UUIDs). Invalid entries ignored.
 */
export function parseOperatorAllowlist(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): Set<string> {
  const raw = env['DAYNORI_OPERATOR_USER_IDS'] ?? '';
  const ids = new Set<string>();
  for (const part of raw.split(',')) {
    const id = part.trim().toLowerCase();
    if (UUID_RE.test(id)) ids.add(id);
  }
  return ids;
}

/**
 * Returns whether the actor is a platform operator for developer tools.
 * Fail-closed when userId missing or allowlist empty / unknown.
 */
export function isPlatformOperator(
  actor: OperatorActor,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const userId = typeof actor.userId === 'string' ? actor.userId.trim().toLowerCase() : '';
  if (!UUID_RE.test(userId)) return false;
  const allowlist = parseOperatorAllowlist(env);
  if (allowlist.size === 0) return false;
  return allowlist.has(userId);
}

/**
 * Developer surface route prefixes that require operator access.
 */
export const OPERATOR_PROTECTED_WEB_PATHS = [
  '/developer',
  '/dev/vault-harness',
  '/review',
] as const;

export function isOperatorProtectedWebPath(pathname: string): boolean {
  const path = pathname.split('?')[0] ?? pathname;
  return OPERATOR_PROTECTED_WEB_PATHS.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/')
  );
}
