import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_NAME,
  authProxy,
  clearSessionCookies,
  parseCookies,
  validateCsrfAndOrigin,
} from '../../../../auth/session.js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Enforce Origin and double-submit CSRF token validation
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

  // 2. Revoke session server-side at provider if access token is present
  const cookies = parseCookies(req.headers.get('cookie'));
  const accessToken = cookies[ACCESS_COOKIE_NAME];
  if (accessToken) {
    try {
      await authProxy.logout(accessToken);
    } catch {
      // Safely ignore provider network errors on logout
    }
  }

  // 3. Clear all session cookies on the response
  const res = NextResponse.json({ status: 'ok', message: 'Signed out successfully' });
  clearSessionCookies(res);
  res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return res;
}
