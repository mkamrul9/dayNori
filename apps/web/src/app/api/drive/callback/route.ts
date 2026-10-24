import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_NAME,
  parseCookies,
  validateCsrfAndOrigin,
} from '../../../../auth/session.js';

export const dynamic = 'force-dynamic';

const API_URL =
  process.env['DAYNORI_API_URL'] || process.env['NEXT_PUBLIC_API_URL'] || 'http://127.0.0.1:3001';

const ALLOWED_RETURN = ['/settings', '/connections', '/library', '/dev/drive-harness'];

function safeReturnPath(raw: string | null): string {
  if (!raw) return '/settings';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/settings';
  if (!ALLOWED_RETURN.some((p) => raw === p || raw.startsWith(`${p}?`) || raw.startsWith(`${p}/`))) {
    return '/settings';
  }
  return raw.split('?')[0]!;
}

/**
 * Google Drive OAuth callback — exchanges the authorization code server-side using the
 * session cookie. Does not copy codes into ordinary settings URLs or diagnostics.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const workspaceId =
    url.searchParams.get('workspaceId') ||
    parseCookies(request.headers.get('cookie'))['daynori_drive_workspace'] ||
    '';

  const returnPath = safeReturnPath(
    parseCookies(request.headers.get('cookie'))['daynori_drive_return'] || '/settings'
  );
  const dest = new URL(returnPath, url.origin);

  const cookieMap = parseCookies(request.headers.get('cookie'));
  const token = cookieMap[ACCESS_COOKIE_NAME];
  if (!token) {
    dest.searchParams.set('drive_error', 'unauthenticated_callback');
    const res = NextResponse.redirect(dest);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }

  if (!workspaceId || !state) {
    dest.searchParams.set('drive_error', 'missing_workspace_or_state');
    const res = NextResponse.redirect(dest);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }

  try {
    const completeRes = await fetch(
      `${API_URL}/v1/workspaces/${workspaceId}/drive/connect/complete-by-state`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          state,
          code: code ?? undefined,
          error: error ?? undefined,
        }),
      }
    );
    if (!completeRes.ok) {
      const body = (await completeRes.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      dest.searchParams.set(
        'drive_error',
        body?.error?.code || `complete_${completeRes.status}`
      );
    } else {
      dest.searchParams.set('drive', 'connected');
    }
  } catch {
    dest.searchParams.set('drive_error', 'callback_exchange_failed');
  }

  const res = NextResponse.redirect(dest);
  res.headers.set('Cache-Control', 'no-store');
  // Clear short-lived drive flow cookies
  res.cookies.set('daynori_drive_workspace', '', { httpOnly: true, maxAge: 0, path: '/' });
  res.cookies.set('daynori_drive_return', '', { httpOnly: true, maxAge: 0, path: '/' });
  res.cookies.set('daynori_drive_intent', '', { httpOnly: true, maxAge: 0, path: '/' });
  return res;
}

/** Sets session-bound Drive OAuth cookies before redirecting to Google. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const csrf = validateCsrfAndOrigin(request);
  if (!csrf.valid) {
    return NextResponse.json(
      { error: { message: csrf.error || 'CSRF validation failed', code: 'FORBIDDEN' } },
      { status: 403 }
    );
  }
  const body = (await request.json()) as {
    workspaceId?: string;
    intentId?: string;
    returnPath?: string;
    authorizationUrl?: string;
  };
  if (!body.workspaceId || !body.authorizationUrl || !body.intentId) {
    return NextResponse.json(
      { error: { message: 'workspaceId, intentId, and authorizationUrl required' } },
      { status: 400 }
    );
  }
  const returnPath = safeReturnPath(body.returnPath ?? '/settings');
  const res = NextResponse.json({
    data: { redirectTo: body.authorizationUrl },
    meta: { requestId: crypto.randomUUID() },
  });
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
    secure: process.env['NODE_ENV'] === 'production',
  };
  res.cookies.set('daynori_drive_workspace', body.workspaceId, cookieOpts);
  res.cookies.set('daynori_drive_return', returnPath, cookieOpts);
  res.cookies.set('daynori_drive_intent', body.intentId, cookieOpts);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
