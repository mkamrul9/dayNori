import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_NAME,
  isAllowedOrigin,
  parseCookies,
  validateCsrfAndOrigin,
} from '../../../../auth/session.js';

export const dynamic = 'force-dynamic';

const API_URL =
  process.env['DAYNORI_API_URL'] || process.env['NEXT_PUBLIC_API_URL'] || 'http://127.0.0.1:3001';

async function handleProxy(req: Request, pathSegments: string[]): Promise<NextResponse> {
  const method = req.method.toUpperCase();
  const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
  const targetPath = pathSegments.join('/');
  const isPublic = targetPath.startsWith('public/');

  // Check for Authorization header first, otherwise read from HTTP-only cookie
  let token: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookieMap = parseCookies(req.headers.get('cookie'));
    token = cookieMap[ACCESS_COOKIE_NAME] || null;
  }

  // Mutating requests protection:
  // For authenticated cookie-based mutations: enforce double-submit CSRF and origin validation.
  // For anonymous public endpoints: enforce origin validation if Origin/Referer header is present.
  if (isMutating && !authHeader) {
    if (isPublic) {
      const origin = req.headers.get('origin') || req.headers.get('referer');
      if (origin && !isAllowedOrigin(origin)) {
        return NextResponse.json(
          { error: { message: 'Forbidden origin', code: 'FORBIDDEN' } },
          { status: 403 }
        );
      }
    } else {
      const csrfCheck = validateCsrfAndOrigin(req);
      if (!csrfCheck.valid) {
        return NextResponse.json(
          { error: { message: csrfCheck.error || 'CSRF validation failed', code: 'FORBIDDEN' } },
          { status: 403 }
        );
      }
    }
  }

  if (!token && !isPublic) {
    return NextResponse.json(
      { error: { message: 'Authentication required', code: 'UNAUTHENTICATED' } },
      { status: 401 }
    );
  }

  const incomingUrl = new URL(req.url);
  const targetUrl = `${API_URL}/v1/${targetPath}${incomingUrl.search}`;

  const forwardHeaders: Record<string, string> = {
    Accept: req.headers.get('accept') || 'application/json, application/zip, */*',
  };
  if (token) {
    forwardHeaders['Authorization'] = `Bearer ${token}`;
  }

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
    const reqContentType = req.headers.get('content-type') || '';
    if (
      reqContentType.includes('application/zip') ||
      reqContentType.includes('application/octet-stream') ||
      reqContentType.includes('application/x-zip-compressed')
    ) {
      body = await req.arrayBuffer();
    } else {
      const rawBody = await req.text();
      if (rawBody.length > 0) {
        body = rawBody;
      }
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body,
    });

    const resContentType = upstreamRes.headers.get('content-type') || '';
    const isBinary =
      resContentType.includes('application/zip') ||
      resContentType.includes('application/octet-stream') ||
      resContentType.includes('application/x-zip-compressed');

    if (isBinary) {
      const buffer = await upstreamRes.arrayBuffer();
      const headers = new Headers();
      headers.set('Content-Type', resContentType);
      const disposition = upstreamRes.headers.get('content-disposition');
      if (disposition) headers.set('Content-Disposition', disposition);
      const len = upstreamRes.headers.get('content-length');
      if (len) headers.set('Content-Length', len);
      return new NextResponse(buffer, {
        status: upstreamRes.status,
        headers,
      });
    }

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
