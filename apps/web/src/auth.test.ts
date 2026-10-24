import { describe, expect, it, beforeEach } from 'vitest';
import { POST as signInHandler } from './app/api/auth/sign-in/route.js';
import { POST as signUpHandler } from './app/api/auth/sign-up/route.js';
import { POST as signOutHandler } from './app/api/auth/sign-out/route.js';
import { GET as sessionHandler } from './app/api/auth/session/route.js';
import { GET as callbackHandler } from './app/api/auth/callback/route.js';
import { POST as initiateHandler } from './app/api/auth/initiate/route.js';
import { POST as provisionHandler } from './app/api/workspaces/provision/route.js';
import {
  GET as getPreferencesHandler,
  PATCH as patchPreferencesHandler,
} from './app/api/users/preferences/route.js';
import { generateCsrfToken, validateAuthRedirectUrl } from '@daynori/contracts';
import {
  authProxy,
  ACCESS_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  PKCE_VERIFIER_COOKIE_NAME,
  type WebAuthClientContract,
} from './auth/session.js';

describe('Web Authentication & Session Contracts (Phase 09 Hardened)', () => {
  const validCsrf = generateCsrfToken();

  function createMockRequest(options: {
    method: string;
    url?: string;
    origin?: string;
    csrfToken?: string;
    cookieCsrf?: string;
    cookies?: Record<string, string>;
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

    const cookiePairs: string[] = [];
    if (options.cookieCsrf) {
      cookiePairs.push(`${CSRF_COOKIE_NAME}=${options.cookieCsrf}`);
    }
    if (options.cookies) {
      for (const [k, v] of Object.entries(options.cookies)) {
        cookiePairs.push(`${k}=${v}`);
      }
    }
    if (cookiePairs.length > 0) {
      headers.set('cookie', cookiePairs.join('; '));
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

  // Injectable test double for deterministic testing of provider success and error states
  class MockTestClient implements WebAuthClientContract {
    public users = new Map<
      string,
      { id: string; email: string; password: string; name?: string }
    >();
    public revokedTokens = new Set<string>();
    public forceOutage = false;

    async signUp(email: string, password: string, displayName?: string) {
      if (this.forceOutage) throw new Error('Authentication service unavailable');
      const id = crypto.randomUUID();
      this.users.set(email.toLowerCase(), {
        id,
        email: email.toLowerCase(),
        password,
        name: displayName,
      });
      return {
        user: { id, email: email.toLowerCase() },
        requiresVerification: true,
        message: 'Please check your email to verify your account.',
      };
    }

    async signIn(email: string, password: string) {
      if (this.forceOutage) throw new Error('Authentication service unavailable');
      const u = this.users.get(email.toLowerCase());
      if (!u || u.password !== password) throw new Error('Invalid email or password');
      return {
        user: { id: u.id, email: u.email, displayName: u.name },
        accessToken: `valid_at_${u.id}`,
        refreshToken: `valid_rt_${u.id}`,
      };
    }

    async refresh(refreshToken: string) {
      if (this.forceOutage) throw new Error('Authentication service unavailable');
      if (refreshToken.startsWith('valid_rt_')) {
        const id = refreshToken.replace('valid_rt_', '');
        return {
          accessToken: `valid_at_${id}`,
          refreshToken: `valid_rt_${id}_rotated`,
        };
      }
      throw new Error('Invalid or expired refresh token');
    }

    async recoverPassword(_email: string) {
      if (this.forceOutage) throw new Error('Authentication service unavailable');
      return {
        message:
          'If that email address is registered, password recovery instructions have been sent.',
      };
    }

    async verifySession(token?: string) {
      if (this.forceOutage || !token) return null;
      if (this.revokedTokens.has(token)) return null;
      if (token.startsWith('valid_at_')) {
        const id = token.replace('valid_at_', '');
        return { id, email: 'verified@daynori.local', displayName: 'Verified User' };
      }
      return null;
    }

    async logout(accessToken?: string) {
      if (accessToken) this.revokedTokens.add(accessToken);
    }

    async exchangeCodeForSession(code: string, codeVerifier: string) {
      if (this.forceOutage) throw new Error('Authentication service unavailable');
      if (!codeVerifier) throw new Error('Missing code verifier');
      if (code === 'valid_oauth_code') {
        const id = crypto.randomUUID();
        return {
          user: { id, email: 'oauth@daynori.local', displayName: 'OAuth User' },
          accessToken: `valid_at_${id}`,
          refreshToken: `valid_rt_${id}`,
        };
      }
      throw new Error('Authorization code exchange failed');
    }
  }

  let testClient: MockTestClient;

  beforeEach(() => {
    testClient = new MockTestClient();
    authProxy.setTestClient(testClient);
  });

  describe('CSRF & Origin Boundary Enforcement', () => {
    it('rejects mutating auth requests missing CSRF token with 403', async () => {
      const req = createMockRequest({
        method: 'POST',
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

  describe('Provider Failure & Outage Safety (No Simulation Fallback)', () => {
    it('fails safely with 401 when provider is unreachable during sign-in, never creating in-memory mock', async () => {
      testClient.forceOutage = true;

      const req = createMockRequest({
        method: 'POST',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
        body: { email: 'someone@daynori.com', password: 'secretPassword123' },
      });

      const res = await signInHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe('AUTHENTICATION_FAILED');
      expect(json.error.message).toContain('unavailable');
    });

    it('fails safely when provider is unreachable during sign-up', async () => {
      testClient.forceOutage = true;

      const req = createMockRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/auth/sign-up',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
        body: { email: 'someone@daynori.com', password: 'secretPassword123' },
      });

      const res = await signUpHandler(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.message).toContain('unavailable');
    });
  });

  describe('Genuine Callbacks & Verification', () => {
    it('strictly rejects open redirect targets in validateAuthRedirectUrl', () => {
      const allowedOrigins = ['http://localhost:3000', 'https://app.daynori.com'];
      expect(validateAuthRedirectUrl('https://evil.com', allowedOrigins)).toBeNull();
      expect(validateAuthRedirectUrl('//evil.com/path', allowedOrigins)).toBeNull();
      expect(validateAuthRedirectUrl('/\\evil.com', allowedOrigins)).toBeNull();
      expect(validateAuthRedirectUrl('javascript:alert(1)', allowedOrigins)).toBeNull();
      expect(validateAuthRedirectUrl('/today', allowedOrigins)).toBe('/today');
    });

    it('POST /api/auth/initiate creates a cryptographically secure PKCE challenge and sets flow cookie', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/auth/initiate',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
        body: { type: 'signin' },
      });
      const res = await initiateHandler(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.state).toBeDefined();
      expect(json.data.codeChallenge).toBeDefined();
      expect(json.data.codeChallengeMethod).toBe('S256');

      const cookies = res.headers.get('set-cookie');
      expect(cookies).toContain(PKCE_VERIFIER_COOKIE_NAME);
    });

    it('GET /api/auth/callback performs genuine code exchange only when bound to initiated flow cookie & state', async () => {
      const state = crypto.randomUUID();
      const codeVerifier = 'test_pkce_verifier_high_entropy_1234567890';
      const flowCookie = JSON.stringify({
        state,
        codeVerifier,
        type: 'signin',
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const req = new Request(
        `http://localhost:3000/api/auth/callback?code=valid_oauth_code&state=${state}&next=/today`,
        {
          headers: {
            cookie: `${PKCE_VERIFIER_COOKIE_NAME}=${encodeURIComponent(flowCookie)}`,
          },
        }
      );
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/today');
      expect(location).not.toContain('auth_error');

      // Verified session cookies set
      const cookies = res.headers.get('set-cookie');
      expect(cookies).toContain(ACCESS_COOKIE_NAME);
      expect(cookies).toContain(REFRESH_COOKIE_NAME);

      // Verified flow cookie is consumed and cleared (one-time exchange)
      expect(cookies).toContain(`${PKCE_VERIFIER_COOKIE_NAME}=;`);
    });

    it('GET /api/auth/callback strictly rejects callbacks missing an initiated flow cookie', async () => {
      const req = new Request(
        'http://localhost:3000/api/auth/callback?code=valid_oauth_code&state=arbitrary_state&next=/today'
      );
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('auth_error=no_initiated_flow');
    });

    it('GET /api/auth/callback strictly rejects state mismatch between callback and initiated flow', async () => {
      const state = crypto.randomUUID();
      const flowCookie = JSON.stringify({
        state,
        codeVerifier: 'verifier_12345',
        type: 'signin',
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const req = new Request(
        `http://localhost:3000/api/auth/callback?code=valid_oauth_code&state=mismatched_state&next=/today`,
        {
          headers: {
            cookie: `${PKCE_VERIFIER_COOKIE_NAME}=${encodeURIComponent(flowCookie)}`,
          },
        }
      );
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('auth_error=state_mismatch');
    });

    it('GET /api/auth/callback rejects expired flow cookies', async () => {
      const state = crypto.randomUUID();
      const flowCookie = JSON.stringify({
        state,
        codeVerifier: 'verifier_12345',
        type: 'signin',
        expiresAt: Date.now() - 1000, // expired 1s ago
      });

      const req = new Request(
        `http://localhost:3000/api/auth/callback?code=valid_oauth_code&state=${state}&next=/today`,
        {
          headers: {
            cookie: `${PKCE_VERIFIER_COOKIE_NAME}=${encodeURIComponent(flowCookie)}`,
          },
        }
      );
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('auth_error=no_initiated_flow');
    });

    it('GET /api/auth/callback strictly rejects unsolicited raw tokens in query parameters', async () => {
      const req = new Request(
        'http://localhost:3000/api/auth/callback?token=attacker_raw_jwt_token&next=/today'
      );
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('auth_error=unsolicited_token_rejected');
    });

    it('GET /api/auth/callback strictly rejects invalid or arbitrary authorization codes', async () => {
      const state = crypto.randomUUID();
      const flowCookie = JSON.stringify({
        state,
        codeVerifier: 'verifier_12345',
        type: 'signin',
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      const req = new Request(
        `http://localhost:3000/api/auth/callback?code=arbitrary_forged_code&state=${state}&next=/today`,
        {
          headers: {
            cookie: `${PKCE_VERIFIER_COOKIE_NAME}=${encodeURIComponent(flowCookie)}`,
          },
        }
      );
      const res = await callbackHandler(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('auth_error=code_exchange_failed');
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

  describe('Session Verification, Forged Token Rejection & Revocation', () => {
    it('rejects forged, arbitrary or expired access tokens with authenticated: false', async () => {
      const req = new Request('http://localhost:3000/api/auth/session', {
        headers: {
          cookie: `${ACCESS_COOKIE_NAME}=forged_mock_at_attacker_prefix; ${CSRF_COOKIE_NAME}=${validCsrf}`,
        },
      });

      const res = await sessionHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
      expect(json.user).toBeNull();
    });

    it('verifies valid session token and exposes authenticated session', async () => {
      const validUserId = crypto.randomUUID();
      const req = new Request('http://localhost:3000/api/auth/session', {
        headers: {
          cookie: `${ACCESS_COOKIE_NAME}=valid_at_${validUserId}; ${CSRF_COOKIE_NAME}=${validCsrf}`,
        },
      });

      const res = await sessionHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.user.id).toBe(validUserId);
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

    it('POST /api/auth/sign-out revokes session at provider and clears cookies', async () => {
      const activeToken = 'valid_at_active_user_123';
      const req = createMockRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/auth/sign-out',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
        cookies: {
          [ACCESS_COOKIE_NAME]: activeToken,
        },
      });

      const res = await signOutHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');

      // Assert server revocation happened
      expect(testClient.revokedTokens.has(activeToken)).toBe(true);

      // Verifying the revoked session now fails
      const verifyAfter = await testClient.verifySession(activeToken);
      expect(verifyAfter).toBeNull();
    });
  });

  describe('Web Workspace Provisioning & Preferences Route Handlers (Phase 10)', () => {
    it('POST /api/workspaces/provision rejects requests without valid CSRF token with 403', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/workspaces/provision',
        // No CSRF token provided
      });
      const res = await provisionHandler(req);
      expect(res.status).toBe(403);
    });

    it('POST /api/workspaces/provision rejects unauthenticated requests with 401', async () => {
      const req = createMockRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/workspaces/provision',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
        // No access token cookie
      });
      const res = await provisionHandler(req);
      expect(res.status).toBe(401);
    });

    it('GET /api/users/preferences rejects unauthenticated requests with 401', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/users/preferences',
        // No access token cookie
      });
      const res = await getPreferencesHandler(req);
      expect(res.status).toBe(401);
    });

    it('PATCH /api/users/preferences rejects requests without valid CSRF token with 403', async () => {
      const req = createMockRequest({
        method: 'PATCH',
        url: 'http://localhost:3000/api/users/preferences',
        body: { timeZone: 'America/New_York' },
      });
      const res = await patchPreferencesHandler(req);
      expect(res.status).toBe(403);
    });

    it('PATCH /api/users/preferences rejects unauthenticated requests with 401', async () => {
      const req = createMockRequest({
        method: 'PATCH',
        url: 'http://localhost:3000/api/users/preferences',
        csrfToken: validCsrf,
        cookieCsrf: validCsrf,
        body: { timeZone: 'America/New_York' },
      });
      const res = await patchPreferencesHandler(req);
      expect(res.status).toBe(401);
    });
  });
});
