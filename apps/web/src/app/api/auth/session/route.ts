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
import type { AuthSession } from '@daynori/contracts';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const cookieHeader = req.headers.get('cookie');
  const cookieMap = parseCookies(cookieHeader);
  const accessToken = cookieMap[ACCESS_COOKIE_NAME];
  const refreshToken = cookieMap[REFRESH_COOKIE_NAME];

  let session: AuthSession = {
    authenticated: false,
    user: null,
    csrfToken: cookieMap[CSRF_COOKIE_NAME],
  };

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
      // Access token was invalid/expired, attempt refresh token rotation
      try {
        const refreshed = await authProxy.refresh(refreshToken);
        const reVerified = await authProxy.verifySession(refreshed.accessToken);
        if (reVerified) {
          setSessionCookies(response, refreshed.accessToken, refreshed.refreshToken, csrfToken);
          session = {
            authenticated: true,
            user: {
              id: reVerified.id,
              email: reVerified.email,
              displayName: reVerified.displayName,
            },
            csrfToken,
          };
        } else {
          clearSessionCookies(response);
        }
      } catch {
        clearSessionCookies(response);
      }
    } else {
      clearSessionCookies(response);
    }
  } else if (refreshToken) {
    // Attempt automatic background refresh
    try {
      const refreshed = await authProxy.refresh(refreshToken);
      const reVerified = await authProxy.verifySession(refreshed.accessToken);
      if (reVerified) {
        setSessionCookies(response, refreshed.accessToken, refreshed.refreshToken, csrfToken);
        session = {
          authenticated: true,
          user: {
            id: reVerified.id,
            email: reVerified.email,
            displayName: reVerified.displayName,
          },
          csrfToken,
        };
      } else {
        clearSessionCookies(response);
      }
    } catch {
      clearSessionCookies(response);
    }
  }

  // Update response body with final session
  const finalResponse = NextResponse.json(session, { headers: response.headers });
  // Prevent any shared caching of authenticated session state
  finalResponse.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  finalResponse.headers.set('Pragma', 'no-cache');
  return finalResponse;
}
