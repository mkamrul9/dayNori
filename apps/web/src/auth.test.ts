import { describe, expect, it } from 'vitest';
import { POST as signInHandler } from './app/api/auth/sign-in/route.js';
import { POST as signUpHandler } from './app/api/auth/sign-up/route.js';
import { POST as signOutHandler } from './app/api/auth/sign-out/route.js';
import { GET as sessionHandler } from './app/api/auth/session/route.js';
import { GET as callbackHandler } from './app/api/auth/callback/route.js';
import { generateCsrfToken, validateAuthRedirectUrl } from '@daynori/contracts';
import { CSRF_COOKIE_NAME } from './auth/session.js';

describe('Web Authentication & Session Contracts (Phase 09)', () => {
  const validCsrf = generateCsrfToken();

  function createMockRequest(options: {
    method: string;
    url?: string;
    origin?: string;
    csrfToken?: string;
    cookieCsrf?: string;
    body?: unknown;
  }): Request {
    const headers = new Headers();
    if (options.origin) {
      headers.set('origin', options.origin);
    } else {
      headers.set('origin', 'http://localhost:3000');
    }

    if (options.csrfToken) {
      headers.set('x-csrf-token', options.csrfToken);
    }

    const cookies: string[] = [];
    if (options.cookieCsrf) {
      cookies.push(`${CSRF_COOKIE_NAME}=${options.cookieCsrf}`);
    }
    if (cookies.length > 0) {
      headers.set('cookie', cookies.join('; '));
    }

    const init: RequestInit = {
      method: options.method,
      headers,
    };

    if (options.body) {
      init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      headers.set('content-type', 'application/json');
    }

    return new Request(options.url || 'http://localhost:3000/api/auth/sign-in', init);
  }

  describe('CSRF & Origin Boundary Enforcement', () => {
    it('rejects mutating auth requests missing CSRF token with 403', async () => {
      const req = createMockRequest({
        method: 'POST',
        // No csrfToken
        body: { email: 'test@daynori.com', password: 'password123' },
      });

      const res = await signInHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('rejects mutating auth requests with mismatched CSRF token with 403', async () => {
      const req = createMockRequest({
        method: 'POST',
        csrfToken: 'wrong_csrf_token_header_value',
        cookieCsrf: validCsrf,
        body: { email: 'test@daynori.com', password: 'password123' },
      });

      const res = await signInHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('rejects requests from untrusted foreign origins', async () => {
      const req = createMockRequest({
        method: 'POST',
        origin: 'https://attacker.evil.com',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
        body: { email: 'test@daynori.com', password: 'password123' },
      });

      const res = await signInHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('CSRF_VALIDATION_FAILED');
      expect(json.error.message).toContain('origin');
    });
  });

  describe('Open Redirect & Callback Defenses', () => {
    it('strictly rejects open redirect targets in validateAuthRedirectUrl', () => {
      const allowedOrigins = ['http://localhost:3000', 'https://app.daynori.com'];

      // Malicious targets
      expect(validateAuthRedirectUrl('https://evil.com', allowedOrigins)).toBeNull();
      expect(validateAuthRedirectUrl('//evil.com/path', allowedOrigins)).toBeNull();
      expect(validateAuthRedirectUrl('/\\evil.com', allowedOrigins)).toBeNull();
      expect(validateAuthRedirectUrl('javascript:alert(1)', allowedOrigins)).toBeNull();
      expect(
        validateAuthRedirectUrl('data:text/html,<script>alert(1)</script>', allowedOrigins)
      ).toBeNull();

      // Safe targets
      expect(validateAuthRedirectUrl('/today', allowedOrigins)).toBe('/today');
      expect(validateAuthRedirectUrl('/journal', allowedOrigins)).toBe('/journal');
      expect(validateAuthRedirectUrl('https://app.daynori.com/plan', allowedOrigins)).toBe('/plan');
    });

    it('GET /api/auth/callback redirects to safe default when open redirect target is supplied', async () => {
      const req = new Request(
        'http://localhost:3000/api/auth/callback?code=mock_code&next=https://attacker.com'
      );
      const res = await callbackHandler(req);

      expect(res.status).toBe(307); // Next.js temporary redirect
      const location = res.headers.get('location');
      expect(location).toContain('/today');
      expect(location).not.toContain('attacker.com');
    });

    it('GET /api/auth/callback handles expired-link and provider errors safely', async () => {
      const req = new Request(
        'http://localhost:3000/api/auth/callback?error=access_denied&error_description=Email+link+is+invalid+or+has+expired'
      );
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('auth_error=access_denied');
      expect(location).toContain('Email+link+is+invalid+or+has+expired');
    });
  });

  describe('Session Cache-Control & Zero Token Leakage in State', () => {
    it('GET /api/auth/session sets private no-cache headers preventing shared caching', async () => {
      const res = await sessionHandler();

      expect(res.headers.get('cache-control')).toBe('private, no-cache, no-store, must-revalidate');
      expect(res.headers.get('pragma')).toBe('no-cache');
    });

    it('sign-in and sign-up responses NEVER return refresh tokens in JSON body', async () => {
      // 1. Sign Up
      const signUpReq = createMockRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/auth/sign-up',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
        body: { email: 'newuser@daynori.com', password: 'securePassword123' },
      });
      const signUpRes = await signUpHandler(signUpReq);
      expect(signUpRes.status).toBe(201);
      const signUpJson = await signUpRes.json();
      expect(signUpJson).not.toHaveProperty('refresh_token');
      expect(signUpJson).not.toHaveProperty('access_token');
      expect(signUpJson.user.email).toBe('newuser@daynori.com');

      // 2. Sign In
      const signInReq = createMockRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/auth/sign-in',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
        body: { email: 'newuser@daynori.com', password: 'securePassword123' },
      });
      const signInRes = await signInHandler(signInReq);
      expect(signInRes.status).toBe(200);
      const signInJson = await signInRes.json();
      expect(signInJson).not.toHaveProperty('refreshToken');
      expect(signInJson).not.toHaveProperty('accessToken');
      expect(signInJson.user.email).toBe('newuser@daynori.com');
    });

    it('POST /api/auth/sign-out clears session', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/auth/sign-out',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
      });

      const res = await signOutHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
    });
  });
});
