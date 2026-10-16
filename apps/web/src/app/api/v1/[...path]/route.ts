import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_NAME,
  parseCookies,
  validateCsrfAndOrigin,
} from '../../../../auth/session.js';

export const dynamic = 'force-dynamic';

const API_URL =
  process.env['DAYNORI_API_URL'] || process.env['NEXT_PUBLIC_API_URL'] || 'http://127.0.0.1:3001';

async function handleProxy(req: Request, pathSegments: string[]): Promise<NextResponse> {
  const method = req.method.toUpperCase();
  const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  // Check for Authorization header first, otherwise read from HTTP-only cookie
  let token: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookieMap = parseCookies(req.headers.get('cookie'));
    token = cookieMap[ACCESS_COOKIE_NAME] || null;
  }

  // If mutating and using cookie auth, enforce double-submit CSRF protection
  if (isMutating && !authHeader) {
    const csrfCheck = validateCsrfAndOrigin(req);
    if (!csrfCheck.valid) {
      return NextResponse.json(
        { error: { message: csrfCheck.error || 'CSRF validation failed', code: 'FORBIDDEN' } },
        { status: 403 }
      );
    }
  }

  if (!token) {
    return NextResponse.json(
      { error: { message: 'Authentication required', code: 'UNAUTHENTICATED' } },
      { status: 401 }
    );
  }

  const incomingUrl = new URL(req.url);
  const targetPath = pathSegments.join('/');
  const targetUrl = `${API_URL}/v1/${targetPath}${incomingUrl.search}`;

  const forwardHeaders: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const contentType = req.headers.get('content-type');
  if (contentType) {
    forwardHeaders['Content-Type'] = contentType;
  }

  const opId = req.headers.get('x-operation-id') || req.headers.get('idempotency-key');
  if (opId) {
    forwardHeaders['x-operation-id'] = opId;
  }

  const deviceId = req.headers.get('x-device-id');
  if (deviceId) {
    forwardHeaders['x-device-id'] = deviceId;
  }

  const reqId = req.headers.get('x-request-id');
  if (reqId) {
    forwardHeaders['x-request-id'] = reqId;
  }

  let body: BodyInit | undefined = undefined;
  if (isMutating && req.body) {
    const rawBody = await req.text();
    if (rawBody.length > 0) {
      body = rawBody;
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body,
    });

    const data = await upstreamRes.json().catch(() => null);
    return NextResponse.json(data ?? {}, {
      status: upstreamRes.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upstream API gateway error';
    return NextResponse.json({ error: { message, code: 'GATEWAY_ERROR' } }, { status: 502 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  return handleProxy(req, path);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  return handleProxy(req, path);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  return handleProxy(req, path);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  return handleProxy(req, path);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  const { path } = await params;
  return handleProxy(req, path);
}
