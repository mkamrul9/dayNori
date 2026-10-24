import { NextResponse } from 'next/server';
import { PasswordRecoveryRequestSchema } from '@daynori/contracts';
import { authProxy, validateCsrfAndOrigin } from '../../../../auth/session.js';

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_PAYLOAD', message: 'Malformed JSON payload' } },
      { status: 400 }
    );
  }

  const parsed = PasswordRecoveryRequestSchema.safeParse(body);
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

  const result = await authProxy.recoverPassword(parsed.data.email);
  const res = NextResponse.json({ status: 'ok', message: result.message });
  res.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return res;
}
