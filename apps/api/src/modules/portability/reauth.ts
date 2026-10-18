import crypto from 'node:crypto';
import type { ReauthenticatePurpose } from '@daynori/contracts';

export interface ReauthClaims {
  sub: string; // userId
  workspaceId: string;
  purpose: ReauthenticatePurpose;
  iat: number;
  exp: number;
  sessionHash: string;
}

export const REAUTH_MAX_AGE_SECONDS = 10 * 60; // 10 minutes

let testSecretOverride: string | null = null;

export function setReauthSecretForTesting(secret: string | null): void {
  testSecretOverride = secret;
}

/**
 * Gets secret key for signing ephemeral reauthentication tokens.
 * Fails closed if configuration is missing: no publicly known fallback secrets in production.
 */
export function getReauthSecret(): string {
  if (testSecretOverride) {
    return testSecretOverride;
  }
  const secret =
    process.env['REAUTH_SIGNING_SECRET'] ||
    process.env['REAUTH_SECRET'] ||
    process.env['SUPABASE_JWT_SECRET'];
  if (!secret) {
    throw new Error(
      'CONFIG_ERROR: REAUTH_SIGNING_SECRET, REAUTH_SECRET, or SUPABASE_JWT_SECRET is required. Refusing to issue or verify reauthentication proof.'
    );
  }
  return secret;
}

export interface ReauthAuthenticator {
  verifyPassword(params: {
    userId: string;
    email?: string;
    password: string;
  }): Promise<{ success: boolean; error?: string }>;
  getUserByEmail?(email: string): Promise<{ id: string; email: string } | null>;
  revokeUserSessions?(userId: string): Promise<void>;
  deleteUser?(userId: string): Promise<void>;
}

/**
 * Default Supabase Auth authenticator that verifies credentials against the active Auth provider.
 */
export class SupabaseReauthAuthenticator implements ReauthAuthenticator {
  private supabaseUrl: string;
  private supabaseAnonKey: string;

  constructor(supabaseUrl?: string, supabaseAnonKey?: string) {
    this.supabaseUrl = supabaseUrl || process.env['SUPABASE_URL'] || 'http://127.0.0.1:54321';
    this.supabaseAnonKey = supabaseAnonKey || process.env['SUPABASE_ANON_KEY'] || '';
  }

  async verifyPassword(params: {
    userId: string;
    email?: string;
    password: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!params.password || typeof params.password !== 'string' || params.password.length === 0) {
      return { success: false, error: 'Password is required' };
    }
    if (!params.email) {
      return { success: false, error: 'User email is required for password reauthentication' };
    }

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({
          email: params.email.toLowerCase().trim(),
          password: params.password,
        }),
      });

      interface SupabaseTokenResponse {
        user?: { id?: string };
        error_description?: string;
        msg?: string;
      }
      const data = (await res.json().catch(() => ({}))) as SupabaseTokenResponse;
      if (res.ok && data.user?.id === params.userId) {
        return { success: true };
      }
      return {
        success: false,
        error: data.error_description || data.msg || 'Invalid credentials for reauthentication',
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Auth provider error during reauthentication',
      };
    }
  }

  async revokeUserSessions(userId: string): Promise<void> {
    const adminKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!adminKey) {
      if (process.env.NODE_ENV === 'test' || !process.env['SUPABASE_URL']) {
        return;
      }
      throw new Error(
        'CONFIG_ERROR: SUPABASE_SERVICE_ROLE_KEY is required for administrative provider session revocation'
      );
    }

    // Check user existence in auth provider
    const checkRes = await fetch(`${this.supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: adminKey,
        Authorization: `Bearer ${adminKey}`,
      },
    });

    if (checkRes.status === 404) {
      // User is confirmed absent
      return;
    }

    if (!checkRes.ok) {
      const errText = await checkRes.text().catch(() => '');
      throw new Error(
        `Provider session revocation check failed for user '${userId}': HTTP ${checkRes.status} ${checkRes.statusText} - ${errText}`
      );
    }

    // Invalidate refresh tokens and session cache via admin user update
    const updateRes = await fetch(`${this.supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: adminKey,
        Authorization: `Bearer ${adminKey}`,
      },
      body: JSON.stringify({
        user_metadata: { sessions_revoked_at: new Date().toISOString() },
      }),
    });

    if (updateRes.ok || updateRes.status === 204) {
      return;
    }

    const errorBody = await updateRes.text().catch(() => '');
    throw new Error(
      `Provider session revocation failed for user '${userId}': HTTP ${updateRes.status} ${updateRes.statusText} - ${errorBody}`
    );
  }

  async deleteUser(userId: string): Promise<void> {
    const adminKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!adminKey) {
      if (process.env.NODE_ENV === 'test' || !process.env['SUPABASE_URL']) {
        return;
      }
      throw new Error(
        'CONFIG_ERROR: SUPABASE_SERVICE_ROLE_KEY is required for administrative provider user deletion'
      );
    }

    const res = await fetch(`${this.supabaseUrl}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        apikey: adminKey,
        Authorization: `Bearer ${adminKey}`,
      },
    });

    if (res.ok || res.status === 204) {
      return;
    }

    if (res.status === 404) {
      // Must verify that user is actually absent in auth provider via GET /admin/users/{userId}
      // rather than assuming any 404 response proves absent
      const checkRes = await fetch(`${this.supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          apikey: adminKey,
          Authorization: `Bearer ${adminKey}`,
        },
      });
      if (checkRes.status === 404) {
        // Confirmed absent
        return;
      }
      throw new Error(
        `Provider user deletion returned 404 but user '${userId}' still exists in provider (GET returned HTTP ${checkRes.status})`
      );
    }

    const errorBody = await res.text().catch(() => '');
    throw new Error(
      `Provider user deletion failed for user '${userId}': HTTP ${res.status} ${res.statusText} - ${errorBody}`
    );
  }

  async getUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
    const adminKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    if (!adminKey) {
      return null;
    }
    try {
      const res = await fetch(
        `${this.supabaseUrl}/auth/v1/admin/users?query=${encodeURIComponent(email)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            apikey: adminKey,
            Authorization: `Bearer ${adminKey}`,
          },
        }
      );
      if (!res.ok) {
        return null;
      }
      const data = (await res.json().catch(() => null)) as {
        users?: Array<{ id: string; email: string }>;
      } | null;
      const user = data?.users?.find((u) => u.email.toLowerCase() === email.toLowerCase());
      return user ? { id: user.id, email: user.email } : null;
    } catch {
      return null;
    }
  }
}

let activeAuthenticator: ReauthAuthenticator = new SupabaseReauthAuthenticator();

export function setReauthAuthenticator(authenticator: ReauthAuthenticator): void {
  activeAuthenticator = authenticator;
}

export function getReauthAuthenticator(): ReauthAuthenticator {
  return activeAuthenticator;
}

export function getActiveAuthenticator(): ReauthAuthenticator {
  return activeAuthenticator;
}

export function verifyReauthTicket(
  token: string | undefined | null,
  params: {
    expectedUserId: string;
    expectedWorkspaceId?: string;
    expectedPurpose: ReauthenticatePurpose;
    currentSessionToken?: string;
  }
): ReauthClaims | null {
  try {
    return assertValidReauthentication({
      token,
      expectedUserId: params.expectedUserId,
      expectedWorkspaceId: params.expectedWorkspaceId,
      expectedPurpose: params.expectedPurpose,
      currentSessionToken: params.currentSessionToken,
    });
  } catch {
    return null;
  }
}

/**
 * Mints an authenticated, cryptographically signed reauthentication ticket bound to
 * verified user, session, workspace, and purpose.
 */
export function issueReauthToken(params: {
  userId: string;
  workspaceId?: string;
  purpose: ReauthenticatePurpose;
  sessionToken: string;
  customTtlSeconds?: number;
}): { token: string; expiresAt: string } {
  if (!params.sessionToken || typeof params.sessionToken !== 'string') {
    throw new Error(
      'REAUTHENTICATION_ERROR: Active session token is mandatory to issue reauthentication proof'
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = params.customTtlSeconds ?? REAUTH_MAX_AGE_SECONDS;
  const exp = now + ttl;

  const sessionHash = crypto
    .createHash('sha256')
    .update(params.sessionToken)
    .digest('hex')
    .substring(0, 32);

  const claims: ReauthClaims = {
    sub: params.userId,
    workspaceId: params.workspaceId || '00000000-0000-0000-0000-000000000000',
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
 * to the specified actor, workspace, verified session, and purpose.
 * Throws explicit error if invalid or expired.
 */
export function assertValidReauthentication(params: {
  token: string | undefined | null;
  expectedUserId: string;
  expectedWorkspaceId?: string;
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

  // 1. Verify claims structure
  if (typeof claims.iat !== 'number' || typeof claims.exp !== 'number') {
    throw new Error('REAUTHENTICATION_INVALID: Token is missing required timestamp claims');
  }

  // 2. Ordering
  if (claims.exp <= claims.iat) {
    throw new Error('REAUTHENTICATION_INVALID: Invalid token timestamps ordering (exp <= iat)');
  }

  // 3. Reject future timestamps (clock skew > 60s)
  if (claims.iat > now + 60) {
    throw new Error('REAUTHENTICATION_INVALID: Token issued in the future');
  }

  // 4. Maximum age guard
  if (claims.exp - claims.iat > REAUTH_MAX_AGE_SECONDS) {
    throw new Error('REAUTHENTICATION_INVALID: Token validity window exceeds 10 minutes');
  }

  // 5. Expiry check
  if (now >= claims.exp) {
    throw new Error(
      'REAUTHENTICATION_EXPIRED: Reauthentication token has expired; re-authenticate to continue'
    );
  }

  // 6. Bound to userId
  if (claims.sub !== params.expectedUserId) {
    throw new Error(
      'REAUTHENTICATION_MISMATCH: Reauthentication token belongs to a different user identity'
    );
  }

  // 7. Bound to workspaceId if specified
  if (params.expectedPurpose === 'workspace_deletion') {
    if (!params.expectedWorkspaceId || claims.workspaceId !== params.expectedWorkspaceId) {
      throw new Error(
        'REAUTHENTICATION_MISMATCH: Reauthentication token is not bound to the target workspace'
      );
    }
  } else if (
    params.expectedWorkspaceId &&
    claims.workspaceId &&
    claims.workspaceId !== '00000000-0000-0000-0000-000000000000' &&
    claims.workspaceId !== params.expectedWorkspaceId
  ) {
    throw new Error(
      'REAUTHENTICATION_MISMATCH: Reauthentication token is bound to another workspace'
    );
  }

  // 8. Bound to purpose
  if (claims.purpose !== params.expectedPurpose) {
    throw new Error(
      `REAUTHENTICATION_PURPOSE_MISMATCH: Token purpose "${claims.purpose}" does not match requested "${params.expectedPurpose}"`
    );
  }

  // 9. Mandatory session binding
  if (!claims.sessionHash || !params.currentSessionToken) {
    throw new Error(
      'REAUTHENTICATION_SESSION_REQUIRED: Session binding is required to verify reauthentication'
    );
  }

  const currentHash = crypto
    .createHash('sha256')
    .update(params.currentSessionToken)
    .digest('hex')
    .substring(0, 32);

  const expectedHashBuf = Buffer.from(claims.sessionHash, 'utf8');
  const currentHashBuf = Buffer.from(currentHash, 'utf8');

  if (
    expectedHashBuf.length !== currentHashBuf.length ||
    !crypto.timingSafeEqual(expectedHashBuf, currentHashBuf)
  ) {
    throw new Error(
      'REAUTHENTICATION_SESSION_MISMATCH: Reauthentication token is bound to a different session'
    );
  }

  return claims;
}
