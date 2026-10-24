import { NextResponse } from 'next/server';
import { SignInRequestSchema } from '@daynori/contracts';
import {
  authProxy,
  setSessionCookies,
  validateCsrfAndOrigin,
  parseCookies,
  CSRF_COOKIE_NAME,
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

  // 2. Validate request payload contract
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_PAYLOAD', message: 'Malformed JSON payload' } },
      { status: 400 }
    );
  }

  const parsed = SignInRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message || 'Validation error',
        },
      },
      { status: 400 }
    );
  }

  // 3. Authenticate against identity provider
  try {
    const { user, accessToken, refreshToken } = await authProxy.signIn(
      parsed.data.email,
      parsed.data.password
    );

    const cookieMap = parseCookies(req.headers.get('cookie'));
    const existingCsrf = cookieMap[CSRF_COOKIE_NAME];

    const res = NextResponse.json({
      user,
      csrfToken: existingCsrf,
    });

    // 4. Set HttpOnly/Secure session cookies
    const finalCsrf = setSessionCookies(res, accessToken, refreshToken, existingCsrf);

    const finalRes = NextResponse.json({ user, csrfToken: finalCsrf }, { headers: res.headers });
    finalRes.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return finalRes;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid credentials';
    return NextResponse.json(
      { error: { code: 'AUTHENTICATION_FAILED', message } },
      { status: 401 }
    );
  }
}
