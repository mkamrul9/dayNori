import { NextResponse } from 'next/server';
import { validateAuthRedirectUrl } from '@daynori/contracts';
import {
  authProxy,
  parseCookies,
  setSessionCookies,
  PKCE_VERIFIER_COOKIE_NAME,
  getCookieOptions,
} from '../../../../auth/session.js';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const token = url.searchParams.get('token');
  const error = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');
  const nextRaw = url.searchParams.get('next');

  // 1. Validate redirect target against explicit allowlist to prevent open redirect attacks
  const safeNext = validateAuthRedirectUrl(nextRaw) || '/today';

  // 2. Handle provider errors (e.g. expired link)
  if (error) {
    const errorRedirect = new URL('/today', url.origin);
    errorRedirect.searchParams.set('auth_error', error);
    if (errorDesc) {
      errorRedirect.searchParams.set('auth_error_description', errorDesc);
    }
    return NextResponse.redirect(errorRedirect);
  }

  // 3. Process verification code / token through provider verification
  const redirectTarget = new URL(safeNext, url.origin);
  const response = NextResponse.redirect(redirectTarget);
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');

  if (code) {
    try {
      const cookieMap = parseCookies(req.headers.get('cookie'));
      const pkceVerifier = cookieMap[PKCE_VERIFIER_COOKIE_NAME];

      const sessionData = await authProxy.exchangeCodeForSession(code, pkceVerifier);
      setSessionCookies(response, sessionData.accessToken, sessionData.refreshToken);

      // Clear PKCE verifier cookie once consumed
      response.cookies.set(PKCE_VERIFIER_COOKIE_NAME, '', getCookieOptions(0, true));
      return response;
    } catch (err) {
      const errorRedirect = new URL('/today', url.origin);
      errorRedirect.searchParams.set('auth_error', 'code_exchange_failed');
      errorRedirect.searchParams.set(
        'auth_error_description',
        err instanceof Error ? err.message : 'Authorization code exchange failed'
      );
      return NextResponse.redirect(errorRedirect);
    }
  }

  if (token) {
    try {
      const verified = await authProxy.verifySession(token);
      if (!verified) {
        throw new Error('Token verification rejected by provider');
      }
      setSessionCookies(response, token);
      return response;
    } catch (err) {
      const errorRedirect = new URL('/today', url.origin);
      errorRedirect.searchParams.set('auth_error', 'token_verification_failed');
      errorRedirect.searchParams.set(
        'auth_error_description',
        err instanceof Error ? err.message : 'Session verification failed'
      );
      return NextResponse.redirect(errorRedirect);
    }
  }

  // Missing authentication payload
  const errorRedirect = new URL('/today', url.origin);
  errorRedirect.searchParams.set('auth_error', 'invalid_request');
  errorRedirect.searchParams.set(
    'auth_error_description',
    'Callback missing authorization code or token'
  );
  return NextResponse.redirect(errorRedirect);
}
