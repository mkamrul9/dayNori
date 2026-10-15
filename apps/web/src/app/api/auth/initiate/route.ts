import { NextResponse } from 'next/server';
import {
  initiateWebAuthFlow,
  validateCsrfAndOrigin,
  PKCE_VERIFIER_COOKIE_NAME,
  getCookieOptions,
  FLOW_COOKIE_MAX_AGE,
} from '../../../../auth/session.js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  // Validate CSRF / Origin headers to prevent cross-site flow initiation
  const csrfCheck = validateCsrfAndOrigin(req);
  if (!csrfCheck.valid) {
    return NextResponse.json(
      { error: { code: 'CSRF_VALIDATION_FAILED', message: csrfCheck.error || 'Forbidden' } },
      { status: 403 }
    );
  }

  let body: { type?: 'signup' | 'signin' | 'recovery' } = {};
  try {
    const text = await req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    // Body is optional, default to signin
  }

  const type = body.type || 'signin';
  const { flow, serializedCookie, state, codeChallenge, codeChallengeMethod } =
    initiateWebAuthFlow(type);

  const response = NextResponse.json({
    data: {
      state,
      codeChallenge,
      codeChallengeMethod,
      type: flow.type,
      expiresAt: flow.expiresAt,
    },
  });

  // Set flow cookie with HttpOnly, Secure, SameSite=Lax
  response.cookies.set(
    PKCE_VERIFIER_COOKIE_NAME,
    serializedCookie,
    getCookieOptions(FLOW_COOKIE_MAX_AGE, true)
  );

  return response;
}
