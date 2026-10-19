import { NextRequest, NextResponse } from 'next/server';

/**
 * Google Drive OAuth callback (Phase 49).
 * Allowlisted return destinations only. Does not embed client secrets or refresh tokens.
 * Completing the connection requires an authenticated BFF call with the auth code + state.
 */
const ALLOWED_RETURN = ['/settings', '/connections', '/library', '/dev/drive-harness'];

function safeReturnPath(raw: string | null): string {
  if (!raw) return '/settings';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/settings';
  if (!ALLOWED_RETURN.some((p) => raw === p || raw.startsWith(`${p}?`) || raw.startsWith(`${p}/`))) {
    return '/settings';
  }
  return raw;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const returnPath = safeReturnPath(url.searchParams.get('return'));

  const dest = new URL(returnPath, url.origin);
  if (error) {
    dest.searchParams.set('drive_error', error);
  } else if (code && state) {
    // Hand code to client via short-lived query for authenticated complete call.
    // Never includes refresh tokens. Client must POST to /api/v1/.../drive/connect/complete.
    dest.searchParams.set('drive_code', code);
    dest.searchParams.set('drive_state', state);
  } else {
    dest.searchParams.set('drive_error', 'missing_code_or_state');
  }
  const res = NextResponse.redirect(dest);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
