import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  authProxy,
  ensureCsrfCookie,
  parseCookies,
  setSessionCookies,
  clearSessionCookies,
} from '../../../../auth/session.js';
import { refreshSingleFlight } from '../../../../auth/refreshSingleFlight.js';
import { isInvalidRefreshError } from '../../../../auth/refreshErrors.js';
import type { AuthSession } from '@daynori/contracts';

export const dynamic = 'force-dynamic';

function unauthenticatedSession(csrfToken: string | undefined): AuthSession {
  return {
    authenticated: false,
    user: null,
    csrfToken,
  };
}

/**
 * When refresh fails temporarily (cold start / network), return 503 without
 * clearing cookies so AuthContext keeps the last-known authenticated UI.
 */
function temporaryUnavailable(csrfToken: string | undefined, headers: Headers): NextResponse {
  const body = {
    ...unauthenticatedSession(csrfToken),
    error: {
      code: 'SESSION_TEMPORARILY_UNAVAILABLE',
      message: 'Authentication service temporarily unavailable',
    },
  };
  const res = NextResponse.json(body, { status: 503, headers });
  res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.headers.set('Pragma', 'no-cache');
  return res;
}

async function tryRefresh(
  refreshToken: string,
  csrfToken: string,
  response: NextResponse
): Promise<{ session: AuthSession } | { clear: true } | { unavailable: true }> {
  try {
    const refreshed = await refreshSingleFlight(refreshToken);
    const reVerified = await authProxy.verifySession(refreshed.accessToken);
    if (reVerified) {
      setSessionCookies(response, refreshed.accessToken, refreshed.refreshToken, csrfToken);
      return {
        session: {
          authenticated: true,
          user: {
            id: reVerified.id,
            email: reVerified.email,
            displayName: reVerified.displayName,
          },
          csrfToken,
        },
      };
    }
    return { clear: true };
  } catch (err) {
    if (isInvalidRefreshError(err)) {
      return { clear: true };
    }
    return { unavailable: true };
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const cookieHeader = req.headers.get('cookie');
  const cookieMap = parseCookies(cookieHeader);
  const accessToken = cookieMap[ACCESS_COOKIE_NAME];
  const refreshToken = cookieMap[REFRESH_COOKIE_NAME];

  let session: AuthSession = unauthenticatedSession(cookieMap[CSRF_COOKIE_NAME]);

  const response = NextResponse.json(session);
  const csrfToken = ensureCsrfCookie(req, response);
  session.csrfToken = csrfToken;

  if (accessToken) {
    const verified = await authProxy.verifySession(accessToken);
    if (verified) {
      session = {
        authenticated: true,
        user: {
          id: verified.id,
          email: verified.email,
          displayName: verified.displayName,
        },
        csrfToken,
      };
    } else if (refreshToken) {
      const result = await tryRefresh(refreshToken, csrfToken, response);
      if ('unavailable' in result) {
        return temporaryUnavailable(csrfToken, response.headers);
      }
      if ('clear' in result) {
        clearSessionCookies(response);
      } else {
        session = result.session;
      }
    } else {
      clearSessionCookies(response);
    }
  } else if (refreshToken) {
    const result = await tryRefresh(refreshToken, csrfToken, response);
    if ('unavailable' in result) {
      return temporaryUnavailable(csrfToken, response.headers);
    }
    if ('clear' in result) {
      clearSessionCookies(response);
    } else {
      session = result.session;
    }
  }

  const finalResponse = NextResponse.json(session, { headers: response.headers });
  finalResponse.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  finalResponse.headers.set('Pragma', 'no-cache');
  return finalResponse;
}
