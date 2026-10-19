/**
 * Narrow Google Drive scope validation (Phases 48–49).
 * Tokenizes OAuth scope strings and compares exact URIs — no substring lookalikes.
 */

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** Exact URIs approved for Daynori Drive connector / spikes. */
export const APPROVED_DRIVE_SCOPES: ReadonlySet<string> = new Set([DRIVE_FILE_SCOPE]);

/** Exact URIs that must never be requested or accepted as a “narrow” grant. */
export const FORBIDDEN_DRIVE_SCOPES: ReadonlySet<string> = new Set([
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.appfolder',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
  'https://www.googleapis.com/auth/drive.photos.readonly',
]);

export type ScopeValidationOk = {
  ok: true;
  scopes: string[];
};

export type ScopeValidationFail = {
  ok: false;
  reason:
    | 'empty'
    | 'unexpected_scope'
    | 'forbidden_scope'
    | 'broader_than_approved'
    | 'not_exact_approved_set';
  message: string;
  scopes: string[];
};

export type ScopeValidationResult = ScopeValidationOk | ScopeValidationFail;

/** Split an OAuth scope string on whitespace; drop empties; preserve order, dedupe. */
export function tokenizeScopes(scopeString: string | null | undefined): string[] {
  if (scopeString == null) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of scopeString.trim().split(/\s+/)) {
    if (!part) continue;
    if (seen.has(part)) continue;
    seen.add(part);
    out.push(part);
  }
  return out;
}

/**
 * Requested scopes must be exactly the approved set (currently only drive.file).
 * Rejects lookalike URIs, combined broader+narrow strings, and unexpected extras.
 */
export function validateRequestedDriveScopes(
  scopeString: string | null | undefined
): ScopeValidationResult {
  const scopes = tokenizeScopes(scopeString);
  if (scopes.length === 0) {
    return { ok: false, reason: 'empty', message: 'No scopes requested.', scopes };
  }
  for (const s of scopes) {
    if (FORBIDDEN_DRIVE_SCOPES.has(s)) {
      return {
        ok: false,
        reason: 'forbidden_scope',
        message: `Forbidden Drive scope requested: ${s}`,
        scopes,
      };
    }
    if (!APPROVED_DRIVE_SCOPES.has(s)) {
      return {
        ok: false,
        reason: 'unexpected_scope',
        message: `Unexpected scope URI (exact match required): ${s}`,
        scopes,
      };
    }
  }
  if (scopes.length !== APPROVED_DRIVE_SCOPES.size) {
    return {
      ok: false,
      reason: 'not_exact_approved_set',
      message: 'Requested scopes must be exactly the approved Drive set.',
      scopes,
    };
  }
  return { ok: true, scopes };
}

/**
 * Granted scopes from the token response / tokeninfo must not include forbidden URIs
 * and must include every approved scope. Extra non-Drive Google scopes (openid, email)
 * are allowed only when `allowOpenIdExtras` is true; otherwise require exact approved set.
 */
export function validateGrantedDriveScopes(
  scopeString: string | null | undefined,
  opts?: { allowOpenIdExtras?: boolean }
): ScopeValidationResult {
  const scopes = tokenizeScopes(scopeString);
  if (scopes.length === 0) {
    return { ok: false, reason: 'empty', message: 'No scopes granted.', scopes };
  }
  const openIdExtras = new Set([
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ]);
  const driveGranted: string[] = [];
  for (const s of scopes) {
    if (FORBIDDEN_DRIVE_SCOPES.has(s)) {
      return {
        ok: false,
        reason: 'broader_than_approved',
        message: `Granted scope includes forbidden Drive URI: ${s}. Not a clean narrow grant.`,
        scopes,
      };
    }
    if (APPROVED_DRIVE_SCOPES.has(s)) {
      driveGranted.push(s);
      continue;
    }
    if (opts?.allowOpenIdExtras && openIdExtras.has(s)) {
      continue;
    }
    // Any other scope (including lookalike "drive.file" substrings as full tokens) fails.
    if (s.includes('googleapis.com/auth/drive')) {
      return {
        ok: false,
        reason: 'broader_than_approved',
        message: `Granted unrecognized Drive-related scope: ${s}`,
        scopes,
      };
    }
    return {
      ok: false,
      reason: 'unexpected_scope',
      message: `Unexpected granted scope URI: ${s}`,
      scopes,
    };
  }
  for (const required of APPROVED_DRIVE_SCOPES) {
    if (!driveGranted.includes(required)) {
      return {
        ok: false,
        reason: 'not_exact_approved_set',
        message: `Granted scopes missing required ${required}`,
        scopes,
      };
    }
  }
  return { ok: true, scopes };
}

/** Throws with a redacted message (no secrets). */
export function assertNarrowScope(scopeString: string | null | undefined): void {
  const result = validateRequestedDriveScopes(scopeString);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export function assertCleanNarrowGrant(scopeString: string | null | undefined): void {
  const result = validateGrantedDriveScopes(scopeString, { allowOpenIdExtras: true });
  if (!result.ok) {
    throw new Error(result.message);
  }
}
