import { NextResponse } from 'next/server';
import {
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  authProxy,
  setSessionCookies,
  clearSessionCookies,
  validateCsrfAndOrigin,
  parseCookies,
} from '../../../../auth/session.js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const csrfCheck = validateCsrfAndOrigin(req);
  if (!csrfCheck.valid) {
    return NextResponse.json(
      {
        error: {
          code: 'CSRF_VALIDATION_FAILED',
          message: csrfCheck.error || 'CSRF validation failed',
        },
      },
      { status: 403 }
    );
  }

  const cookieMap = parseCookies(req.headers.get('cookie'));
  const refreshToken = cookieMap[REFRESH_COOKIE_NAME];
  const existingCsrf = cookieMap[CSRF_COOKIE_NAME];

  if (!refreshToken) {
    return NextResponse.json(
      { error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token available' } },
      { status: 401 }
    );
  }

  try {
    const refreshed = await authProxy.refresh(refreshToken);
    const res = NextResponse.json({ status: 'ok', csrfToken: existingCsrf });
    const csrfToken = setSessionCookies(
      res,
      refreshed.accessToken,
      refreshed.refreshToken,
      existingCsrf
    );

    const finalRes = NextResponse.json({ status: 'ok', csrfToken }, { headers: res.headers });
    finalRes.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return finalRes;
  } catch (err) {
    const res = NextResponse.json(
      {
        error: {
          code: 'REFRESH_FAILED',
          message: err instanceof Error ? err.message : 'Token refresh failed',
        },
      },
      { status: 401 }
    );
    clearSessionCookies(res);
    return res;
  }
}
