import { NextResponse } from 'next/server';
import { SignUpRequestSchema } from '@daynori/contracts';
import { authProxy, validateCsrfAndOrigin } from '../../../../auth/session.js';

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

  const parsed = SignUpRequestSchema.safeParse(body);
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

  // 3. Register user with identity provider
  try {
    const result = await authProxy.signUp(
      parsed.data.email,
      parsed.data.password,
      parsed.data.displayName
    );

    const res = NextResponse.json(result, { status: 201 });
    res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    const isOutage = message.toLowerCase().includes('unavailable');
    return NextResponse.json(
      { error: { code: isOutage ? 'SERVICE_UNAVAILABLE' : 'SIGNUP_FAILED', message } },
      { status: isOutage ? 503 : 400 }
    );
  }
}
