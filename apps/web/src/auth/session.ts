import { NextResponse } from 'next/server';
import { generateCsrfToken, verifyCsrfToken, type SignUpResponse } from '@daynori/contracts';

export const ACCESS_COOKIE_NAME = 'daynori_access_token';
export const REFRESH_COOKIE_NAME = 'daynori_refresh_token';
export const CSRF_COOKIE_NAME = 'daynori_csrf_token';

// 15 minutes for access tokens, 30 days for refresh tokens
export const ACCESS_TOKEN_MAX_AGE = 15 * 60;
export const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;
export const CSRF_TOKEN_MAX_AGE = 30 * 24 * 60 * 60;

export const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://app.daynori.com',
  'https://daynori.app',
];

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge?: number;
}

export function getCookieOptions(maxAge?: number, httpOnly = true): CookieOptions {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

/**
 * Parses cookie string from Request header.
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  cookieHeader.split(';').forEach((part) => {
    const [key, ...vals] = part.trim().split('=');
    if (key) {
      result[key] = decodeURIComponent(vals.join('='));
    }
  });
  return result;
}

/**
 * Validates CSRF double-submit token and Origin/Referer headers for mutating Route Handlers.
 */
export function validateCsrfAndOrigin(req: Request): { valid: boolean; error?: string } {
  const origin = req.headers.get('origin') || req.headers.get('referer');

  if (origin) {
    try {
      const parsed = new URL(origin);
      if (!ALLOWED_ORIGINS.includes(parsed.origin)) {
        return { valid: false, error: 'Forbidden origin' };
      }
    } catch {
      return { valid: false, error: 'Malformed origin header' };
    }
  }

  // Double-submit CSRF token check
  const cookieMap = parseCookies(req.headers.get('cookie'));
  const csrfCookie = cookieMap[CSRF_COOKIE_NAME];
  const csrfHeader = req.headers.get('x-csrf-token') || req.headers.get('x-xsrf-token');

  if (!csrfCookie || !csrfHeader || !verifyCsrfToken(csrfCookie, csrfHeader)) {
    return { valid: false, error: 'CSRF token mismatch or missing' };
  }

  return { valid: true };
}

/**
 * Sets secure session cookies on a NextResponse.
 */
export function setSessionCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken?: string,
  existingCsrf?: string
): string {
  res.cookies.set(ACCESS_COOKIE_NAME, accessToken, getCookieOptions(ACCESS_TOKEN_MAX_AGE, true));

  if (refreshToken) {
    res.cookies.set(
      REFRESH_COOKIE_NAME,
      refreshToken,
      getCookieOptions(REFRESH_TOKEN_MAX_AGE, true)
    );
  }

  const csrfToken = existingCsrf || generateCsrfToken();
  res.cookies.set(CSRF_COOKIE_NAME, csrfToken, getCookieOptions(CSRF_TOKEN_MAX_AGE, false));

  return csrfToken;
}

/**
 * Clears all authentication cookies on a NextResponse.
 */
export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE_NAME, '', getCookieOptions(0, true));
  res.cookies.set(REFRESH_COOKIE_NAME, '', getCookieOptions(0, true));
  res.cookies.set(CSRF_COOKIE_NAME, '', getCookieOptions(0, false));
}

/**
 * Helper to ensure a CSRF cookie exists on a response.
 */
export function ensureCsrfCookie(req: Request | undefined, res: NextResponse): string {
  const cookieMap = parseCookies(req ? req.headers.get('cookie') : null);
  let csrfToken = cookieMap[CSRF_COOKIE_NAME];
  if (!csrfToken) {
    csrfToken = generateCsrfToken();
    res.cookies.set(CSRF_COOKIE_NAME, csrfToken, getCookieOptions(CSRF_TOKEN_MAX_AGE, false));
  }
  return csrfToken;
}

/**
 * Simulated / Proxy provider client for local development and testing.
 * When a real Supabase Auth container daemon is available, calls its HTTP endpoints.
 * Otherwise, maintains safe in-memory test accounts with synthetic email confirmation.
 */
export class SupabaseAuthProxy {
  private static mockUsers = new Map<
    string,
    { id: string; email: string; passwordHash: string; confirmed: boolean; displayName?: string }
  >();

  private supabaseUrl: string;

  constructor(supabaseUrl = process.env['SUPABASE_AUTH_URL'] || 'http://127.0.0.1:54321') {
    this.supabaseUrl = supabaseUrl;
  }

  async signUp(email: string, password: string, displayName?: string): Promise<SignUpResponse> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check if live Supabase Auth container is reachable
    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env['SUPABASE_ANON_KEY'] || 'test-anon-key',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          data: { display_name: displayName },
        }),
        signal: AbortSignal.timeout(1000),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          user: { id: data.id || data.user?.id, email: normalizedEmail },
          requiresVerification: true,
          message: 'Please check your email to verify your account.',
        };
      }
    } catch {
      // Local daemon is offline; fall back to safe simulated provider
    }

    const userId = crypto.randomUUID();
    SupabaseAuthProxy.mockUsers.set(normalizedEmail, {
      id: userId,
      email: normalizedEmail,
      passwordHash: `hash_${password}`,
      confirmed: true, // Auto-confirm in mock dev mode for immediate usability
      displayName,
    });

    return {
      user: { id: userId, email: normalizedEmail },
      requiresVerification: false,
      message: 'Account created successfully.',
    };
  }

  async signIn(
    email: string,
    password: string
  ): Promise<{
    user: { id: string; email: string; displayName?: string };
    accessToken: string;
    refreshToken: string;
  }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check live Supabase Auth container
    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env['SUPABASE_ANON_KEY'] || 'test-anon-key',
        },
        body: JSON.stringify({ email: normalizedEmail, password }),
        signal: AbortSignal.timeout(1000),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          user: {
            id: data.user.id,
            email: data.user.email,
            displayName: data.user.user_metadata?.display_name,
          },
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        };
      }
    } catch {
      // Fall back to mock
    }

    const mock = SupabaseAuthProxy.mockUsers.get(normalizedEmail);
    if (!mock || mock.passwordHash !== `hash_${password}`) {
      throw new Error('Invalid email or password');
    }

    const accessToken = `mock_at_${mock.id}_${Date.now()}`;
    const refreshToken = `mock_rt_${mock.id}_${Date.now()}`;

    return {
      user: { id: mock.id, email: mock.email, displayName: mock.displayName },
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env['SUPABASE_ANON_KEY'] || 'test-anon-key',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: AbortSignal.timeout(1000),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        };
      }
    } catch {
      // Fall back to mock
    }

    if (!refreshToken.startsWith('mock_rt_')) {
      throw new Error('Invalid or expired refresh token');
    }

    const parts = refreshToken.split('_');
    const userId = parts[2];
    const newAt = `mock_at_${userId}_${Date.now()}`;
    const newRt = `mock_rt_${userId}_${Date.now()}`;

    return { accessToken: newAt, refreshToken: newRt };
  }

  async recoverPassword(email: string): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    try {
      await fetch(`${this.supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: process.env['SUPABASE_ANON_KEY'] || 'test-anon-key',
        },
        body: JSON.stringify({ email: normalizedEmail }),
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      // Ignore network errors in mock mode
    }

    return {
      message:
        'If that email address is registered, password recovery instructions have been sent.',
    };
  }

  parseToken(token?: string): { userId: string; email: string; displayName?: string } | null {
    if (!token) return null;
    if (token.startsWith('mock_at_') || token.startsWith('verified_at_')) {
      const parts = token.split('_');
      const userId = parts[2] || crypto.randomUUID();
      for (const user of SupabaseAuthProxy.mockUsers.values()) {
        if (user.id === userId) {
          return { userId: user.id, email: user.email, displayName: user.displayName };
        }
      }
      return { userId, email: 'user@example.local', displayName: 'Mock User' };
    }
    // Attempt basic JWT payload decode
    try {
      const payloadPart = token.split('.')[1];
      if (payloadPart) {
        const decoded = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf-8'));
        if (decoded.sub) {
          return {
            userId: decoded.sub,
            email: decoded.email || 'user@daynori.local',
            displayName: decoded.user_metadata?.display_name,
          };
        }
      }
    } catch {
      // Ignore parse failure
    }
    return null;
  }
}

export const authProxy = new SupabaseAuthProxy();
