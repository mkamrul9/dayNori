import crypto from 'node:crypto';
import type { ReauthenticatePurpose } from '@daynori/contracts';

export interface ReauthClaims {
  sub: string; // userId
  workspaceId: string;
  purpose: ReauthenticatePurpose;
  iat: number;
  exp: number;
  sessionHash?: string;
}

export const REAUTH_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

/**
 * Gets secret key for signing ephemeral reauthentication tokens.
 */
function getReauthSecret(): string {
  return (
    process.env['REAUTH_SIGNING_SECRET'] ||
    process.env['SUPABASE_JWT_SECRET'] ||
    'daynori-reauth-fallback-secret-2026'
  );
}

/**
 * Mints an authenticated, cryptographically signed reauthentication ticket.
 */
export function issueReauthToken(params: {
  userId: string;
  workspaceId: string;
  purpose: ReauthenticatePurpose;
  sessionToken?: string;
}): { token: string; expiresAt: string } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + REAUTH_MAX_AGE_SECONDS;

  const sessionHash = params.sessionToken
    ? crypto.createHash('sha256').update(params.sessionToken).digest('hex').substring(0, 16)
    : undefined;

  const claims: ReauthClaims = {
    sub: params.userId,
    workspaceId: params.workspaceId,
    purpose: params.purpose,
    iat: now,
    exp,
    sessionHash,
  };

  const claimsBase64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getReauthSecret())
    .update(claimsBase64)
    .digest('base64url');

  const token = `${claimsBase64}.${signature}`;
  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

/**
 * Verifies that a reauthentication token is valid, unexpired, and strictly bound
 * to the specified actor, workspace, and purpose.
 * Throws explicit error if invalid or expired.
 */
export function assertValidReauthentication(params: {
  token: string | undefined | null;
  expectedUserId: string;
  expectedWorkspaceId: string;
  expectedPurpose: ReauthenticatePurpose;
  currentSessionToken?: string;
}): ReauthClaims {
  if (!params.token || typeof params.token !== 'string') {
    throw new Error('REAUTHENTICATION_REQUIRED: Fresh reauthentication token is required');
  }

  const parts = params.token.trim().split('.');
  if (parts.length !== 2) {
    throw new Error('REAUTHENTICATION_INVALID: Malformed reauthentication token');
  }

  const [claimsBase64, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getReauthSecret())
    .update(claimsBase64!)
    .digest('base64url');

  const providedSigBuf = Buffer.from(providedSig!, 'utf8');
  const expectedSigBuf = Buffer.from(expectedSig, 'utf8');

  if (
    providedSigBuf.length !== expectedSigBuf.length ||
    !crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)
  ) {
    throw new Error('REAUTHENTICATION_INVALID: Invalid reauthentication signature');
  }

  let claims: ReauthClaims;
  try {
    claims = JSON.parse(Buffer.from(claimsBase64!, 'base64url').toString('utf8'));
  } catch {
    throw new Error('REAUTHENTICATION_INVALID: Invalid reauthentication payload encoding');
  }

  const now = Math.floor(Date.now() / 1000);

  // 1. Check expiration
  if (claims.exp < now) {
    throw new Error('REAUTHENTICATION_EXPIRED: Reauthentication token has expired; re-authenticate to continue');
  }

  // 2. Bound to userId
  if (claims.sub !== params.expectedUserId) {
    throw new Error('REAUTHENTICATION_MISMATCH: Reauthentication token belongs to a different user identity');
  }

  // 3. Bound to workspaceId
  if (claims.workspaceId !== params.expectedWorkspaceId) {
    throw new Error('REAUTHENTICATION_MISMATCH: Reauthentication token is bound to another workspace');
  }

  // 4. Bound to purpose
  if (claims.purpose !== params.expectedPurpose) {
    throw new Error(
      `REAUTHENTICATION_PURPOSE_MISMATCH: Token purpose "${claims.purpose}" does not match requested "${params.expectedPurpose}"`
    );
  }

  // 5. Check session binding if present
  if (claims.sessionHash && params.currentSessionToken) {
    const currentHash = crypto
      .createHash('sha256')
      .update(params.currentSessionToken)
      .digest('hex')
      .substring(0, 16);
    if (claims.sessionHash !== currentHash) {
      throw new Error('REAUTHENTICATION_SESSION_MISMATCH: Token session binding does not match active session');
    }
  }

  return claims;
}
