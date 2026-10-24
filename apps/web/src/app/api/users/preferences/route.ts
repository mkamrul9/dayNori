import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_NAME,
  parseCookies,
  validateCsrfAndOrigin,
} from '../../../../auth/session.js';
import { createApiClient } from '@daynori/api-client';

export const dynamic = 'force-dynamic';

const API_URL =
  process.env['DAYNORI_API_URL'] || process.env['NEXT_PUBLIC_API_URL'] || 'http://127.0.0.1:3001';

export async function GET(req: Request): Promise<NextResponse> {
  const cookieMap = parseCookies(req.headers.get('cookie'));
  const accessToken = cookieMap[ACCESS_COOKIE_NAME];
  if (!accessToken) {
    return NextResponse.json(
      { error: { message: 'Authentication required', code: 'UNAUTHENTICATED' } },
      { status: 401 }
    );
  }

  try {
    const client = createApiClient({ baseUrl: API_URL, token: accessToken });
    const profile = await client.getUserPreferences();
    return NextResponse.json(profile, { status: 200 });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode || 500;
    const message = err instanceof Error ? err.message : 'Failed to fetch preferences';
    const code = (err as { code?: string })?.code || 'INTERNAL_ERROR';
    return NextResponse.json({ error: { message, code } }, { status: statusCode });
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
  const csrfCheck = validateCsrfAndOrigin(req);
  if (!csrfCheck.valid) {
    return NextResponse.json(
      { error: { message: csrfCheck.error || 'CSRF validation failed', code: 'FORBIDDEN' } },
      { status: 403 }
    );
  }

  const cookieMap = parseCookies(req.headers.get('cookie'));
  const accessToken = cookieMap[ACCESS_COOKIE_NAME];
  if (!accessToken) {
    return NextResponse.json(
      { error: { message: 'Authentication required', code: 'UNAUTHENTICATED' } },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { message: 'Malformed JSON payload', code: 'VALIDATION_FAILED' } },
      { status: 400 }
    );
  }

  try {
    const client = createApiClient({ baseUrl: API_URL, token: accessToken });
    const profile = await client.updateUserPreferences(body);
    return NextResponse.json(profile, { status: 200 });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode || 500;
    const message = err instanceof Error ? err.message : 'Failed to update preferences';
    const code = (err as { code?: string })?.code || 'INTERNAL_ERROR';
    return NextResponse.json({ error: { message, code } }, { status: statusCode });
  }
}
