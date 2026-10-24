import { NextResponse } from 'next/server';
import { validateAuthRedirectUrl } from '@daynori/contracts';
import {
  authProxy,
  parseCookies,
  setSessionCookies,
  PKCE_VERIFIER_COOKIE_NAME,
  getCookieOptions,
  type AuthFlowState,
} from '../../../../auth/session.js';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const token = url.searchParams.get('token') || url.searchParams.get('access_token');
  const error = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');
  const nextRaw = url.searchParams.get('next');

  // 1. Validate redirect target against explicit allowlist to prevent open redirect attacks
  const safeNext = validateAuthRedirectUrl(nextRaw) || '/today';

  // 2. Strictly reject unsolicited raw token login attempts
  // An attacker-supplied token must never silently log into or replace another browser's session
  if (token) {
    const errorRedirect = new URL('/today', url.origin);
    errorRedirect.searchParams.set('auth_error', 'unsolicited_token_rejected');
    errorRedirect.searchParams.set(
      'auth_error_description',
      'Unsolicited tokens are forbidden; login must be initiated by this browser session'
    );
    return NextResponse.redirect(errorRedirect);
  }

  // 3. Handle provider-reported errors (e.g. access denied, expired provider link)
  if (error) {
    const errorRedirect = new URL('/today', url.origin);
    errorRedirect.searchParams.set('auth_error', error);
    if (errorDesc) {
      errorRedirect.searchParams.set('auth_error_description', errorDesc);
    }
    return NextResponse.redirect(errorRedirect);
  }

  // 4. Validate that an active authentication flow was initiated by this browser
  const cookieMap = parseCookies(req.headers.get('cookie'));
  const rawFlow = cookieMap[PKCE_VERIFIER_COOKIE_NAME];
  let flow: AuthFlowState | null = null;
  if (rawFlow) {
    try {
      const parsed = JSON.parse(rawFlow);
      if (
        parsed.state &&
        parsed.codeVerifier &&
        typeof parsed.expiresAt === 'number' &&
        parsed.expiresAt > Date.now()
      ) {
        flow = parsed;
      }
    } catch {
      flow = null;
    }
  }

  if (!flow) {
    const errorRedirect = new URL('/today', url.origin);
    errorRedirect.searchParams.set('auth_error', 'no_initiated_flow');
    errorRedirect.searchParams.set(
      'auth_error_description',
      'No initiated authentication flow found for this browser session (unsolicited or expired callback rejected)'
    );
    return NextResponse.redirect(errorRedirect);
  }

  // 5. Verify flow state binding to prevent CSRF and callback injection
  if (!state || state !== flow.state) {
    const errorRedirect = new URL('/today', url.origin);
    errorRedirect.searchParams.set('auth_error', 'state_mismatch');
    errorRedirect.searchParams.set(
      'auth_error_description',
      'Authentication state mismatch: callback is not bound to the active flow on this browser'
    );
    return NextResponse.redirect(errorRedirect);
  }

  // 6. Verify authorization code presence
  if (!code) {
    const errorRedirect = new URL('/today', url.origin);
    errorRedirect.searchParams.set('auth_error', 'missing_code');
    errorRedirect.searchParams.set(
      'auth_error_description',
      'Callback missing required authorization code'
    );
    return NextResponse.redirect(errorRedirect);
  }

  // 7. One-time exchange: immediately clear the flow cookie and exchange code
  const redirectTarget = new URL(safeNext, url.origin);
  const response = NextResponse.redirect(redirectTarget);
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');

  // Consume and clear flow cookie immediately to enforce one-time usage and prevent replay
  response.cookies.set(PKCE_VERIFIER_COOKIE_NAME, '', getCookieOptions(0, true));

  try {
    const sessionData = await authProxy.exchangeCodeForSession(code, flow.codeVerifier);
    setSessionCookies(response, sessionData.accessToken, sessionData.refreshToken);
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
