import { NextResponse } from 'next/server';
import { generateCsrfToken, verifyCsrfToken, type SignUpResponse } from '@daynori/contracts';

export const ACCESS_COOKIE_NAME = 'daynori_access_token';
export const REFRESH_COOKIE_NAME = 'daynori_refresh_token';
export const CSRF_COOKIE_NAME = 'daynori_csrf_token';
export const PKCE_VERIFIER_COOKIE_NAME = 'daynori_pkce_verifier';

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

export interface WebUser {
  id: string;
  email: string;
  displayName?: string;
}

export interface WebAuthClientContract {
  signUp(email: string, password: string, displayName?: string): Promise<SignUpResponse>;
  signIn(
    email: string,
    password: string
  ): Promise<{ user: WebUser; accessToken: string; refreshToken: string }>;
  refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>;
  recoverPassword(email: string): Promise<{ message: string }>;
  verifySession(token?: string): Promise<WebUser | null>;
  logout(accessToken?: string): Promise<void>;
  exchangeCodeForSession(
    code: string,
    codeVerifier?: string
  ): Promise<{ user: WebUser; accessToken: string; refreshToken: string }>;
}

function createTimeoutSignal(ms: number): AbortSignal {
  const anySignal = AbortSignal as unknown as { timeout?: (m: number) => AbortSignal };
  if (typeof anySignal.timeout === 'function') {
    return anySignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Provider client for Supabase Auth service.
 * In normal application runtime, communicates directly with Supabase GoTrue over HTTP.
 * Fails safely on outages and invalid credentials without fabricating tokens or users.
 * Test doubles can be explicitly injected via constructor for unit testing.
 */
export class SupabaseAuthProxy implements WebAuthClientContract {
  private supabaseUrl: string;
  private supabaseAnonKey: string;
  private testClient: WebAuthClientContract | null = null;
  private timeoutMs: number;

  constructor(options?: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    testClient?: WebAuthClientContract;
    timeoutMs?: number;
  }) {
    this.supabaseUrl =
      options?.supabaseUrl || process.env['SUPABASE_AUTH_URL'] || 'http://127.0.0.1:54321';
    this.supabaseAnonKey =
      options?.supabaseAnonKey || process.env['SUPABASE_ANON_KEY'] || 'test-anon-key';
    this.testClient = options?.testClient || null;
    this.timeoutMs = options?.timeoutMs || 4000;
  }

  public setTestClient(client: WebAuthClientContract | null): void {
    if (process.env['NODE_ENV'] !== 'test') {
      throw new Error('Test client injection is forbidden in non-test runtime');
    }
    this.testClient = client;
  }

  async signUp(email: string, password: string, displayName?: string): Promise<SignUpResponse> {
    if (this.testClient) {
      return this.testClient.signUp(email, password, displayName);
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          data: { display_name: displayName },
        }),
        signal: createTimeoutSignal(this.timeoutMs),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        return {
          user: { id: data.id || data.user?.id, email: normalizedEmail },
          requiresVerification: true,
          message: 'Please check your email to verify your account.',
        };
      }

      throw new Error(data.msg || data.message || data.error_description || 'Registration failed');
    } catch (err) {
      if (err instanceof Error && err.message !== 'Registration failed') {
        throw err;
      }
      throw new Error('Authentication service unavailable');
    }
  }

  async signIn(
    email: string,
    password: string
  ): Promise<{
    user: WebUser;
    accessToken: string;
    refreshToken: string;
  }> {
    if (this.testClient) {
      return this.testClient.signIn(email, password);
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({ email: normalizedEmail, password }),
        signal: createTimeoutSignal(this.timeoutMs),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.access_token) {
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

      throw new Error(data.msg || data.error_description || 'Invalid email or password');
    } catch (err) {
      if (err instanceof Error && err.message !== 'Invalid email or password') {
        throw err;
      }
      throw new Error('Authentication service unavailable');
    }
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (this.testClient) {
      return this.testClient.refresh(refreshToken);
    }

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: createTimeoutSignal(this.timeoutMs),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.access_token) {
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        };
      }

      throw new Error(data.msg || data.error_description || 'Invalid or expired refresh token');
    } catch (err) {
      if (err instanceof Error && err.message !== 'Invalid or expired refresh token') {
        throw err;
      }
      throw new Error('Authentication service unavailable');
    }
  }

  async recoverPassword(email: string): Promise<{ message: string }> {
    if (this.testClient) {
      return this.testClient.recoverPassword(email);
    }

    const normalizedEmail = email.toLowerCase().trim();

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify({ email: normalizedEmail }),
        signal: createTimeoutSignal(this.timeoutMs),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.msg || data.message || 'Password recovery request failed');
      }
    } catch (err) {
      if (err instanceof Error && err.message !== 'Password recovery request failed') {
        throw err;
      }
      throw new Error('Authentication service unavailable');
    }

    return {
      message:
        'If that email address is registered, password recovery instructions have been sent.',
    };
  }

  async verifySession(token?: string): Promise<WebUser | null> {
    if (!token) return null;

    if (this.testClient) {
      return this.testClient.verifySession(token);
    }

    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: this.supabaseAnonKey,
        },
        signal: createTimeoutSignal(this.timeoutMs),
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      if (!data.id) return null;

      return {
        id: data.id,
        email: data.email,
        displayName: data.user_metadata?.display_name,
      };
    } catch {
      return null;
    }
  }

  async logout(accessToken?: string): Promise<void> {
    if (!accessToken) return;

    if (this.testClient) {
      return this.testClient.logout(accessToken);
    }

    try {
      await fetch(`${this.supabaseUrl}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: this.supabaseAnonKey,
        },
        signal: createTimeoutSignal(this.timeoutMs),
      });
    } catch {
      // Catch network errors safely during logout
    }
  }

  async exchangeCodeForSession(
    code: string,
    codeVerifier?: string
  ): Promise<{ user: WebUser; accessToken: string; refreshToken: string }> {
    if (this.testClient) {
      return this.testClient.exchangeCodeForSession(code, codeVerifier);
    }

    try {
      const body: Record<string, string> = { auth_code: code };
      if (codeVerifier) {
        body['code_verifier'] = codeVerifier;
      }

      const res = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabaseAnonKey,
        },
        body: JSON.stringify(body),
        signal: createTimeoutSignal(this.timeoutMs),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.access_token) {
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

      throw new Error(data.msg || data.error_description || 'Authorization code exchange failed');
    } catch (err) {
      if (err instanceof Error && err.message !== 'Authorization code exchange failed') {
        throw err;
      }
      throw new Error('Authentication service unavailable');
    }
  }
}

export const authProxy = new SupabaseAuthProxy();
