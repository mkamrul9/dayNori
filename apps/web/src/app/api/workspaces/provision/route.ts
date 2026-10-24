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

export async function POST(req: Request): Promise<NextResponse> {
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

  let body: Record<string, unknown> | undefined = undefined;
  try {
    body = await req.json();
  } catch {
    // Body is optional
  }

  try {
    const client = createApiClient({ baseUrl: API_URL, token: accessToken });
    const result = await client.provisionPersonalWorkspace(body);
    const status = result.data.isNew ? 201 : 200;
    return NextResponse.json(result, { status });
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode || 500;
    const message = err instanceof Error ? err.message : 'Workspace provisioning failed';
    const code = (err as { code?: string })?.code || 'INTERNAL_ERROR';
    return NextResponse.json({ error: { message, code } }, { status: statusCode });
  }
}
