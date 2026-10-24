import { NextResponse } from 'next/server';
import {
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  setSessionCookies,
  clearSessionCookies,
  validateCsrfAndOrigin,
  parseCookies,
} from '../../../../auth/session.js';
import { refreshSingleFlight } from '../../../../auth/refreshSingleFlight.js';
import { isInvalidRefreshError } from '../../../../auth/refreshErrors.js';

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
    const refreshed = await refreshSingleFlight(refreshToken);
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
    if (isInvalidRefreshError(err)) {
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

    // Temporary outage / cold start — keep cookies so the next wake can recover.
    return NextResponse.json(
      {
        error: {
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'Authentication service temporarily unavailable',
        },
      },
      { status: 503 }
    );
  }
}
