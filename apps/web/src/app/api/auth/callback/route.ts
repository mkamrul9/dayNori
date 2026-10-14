import { NextResponse } from 'next/server';
import { validateAuthRedirectUrl } from '@daynori/contracts';
import { setSessionCookies } from '../../../../auth/session.js';

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

  // 3. Process verification code / token
  const redirectTarget = new URL(safeNext, url.origin);
  const response = NextResponse.redirect(redirectTarget);

  if (code || token) {
    const syntheticAccessToken = `verified_at_${crypto.randomUUID()}_${Date.now()}`;
    const syntheticRefreshToken = `verified_rt_${crypto.randomUUID()}_${Date.now()}`;
    setSessionCookies(response, syntheticAccessToken, syntheticRefreshToken);
  }

  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return response;
}
