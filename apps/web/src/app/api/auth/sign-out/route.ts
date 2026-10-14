import { NextResponse } from 'next/server';
import { clearSessionCookies, validateCsrfAndOrigin } from '../../../../auth/session.js';

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

  // 2. Clear all session cookies on the response
  const res = NextResponse.json({ status: 'ok', message: 'Signed out successfully' });
  clearSessionCookies(res);
  res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return res;
}
