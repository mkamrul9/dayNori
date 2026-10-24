/**
 * Phase 47 — request nonces + CSP for App Router (Next.js 15).
 * Production script-src omits unsafe-inline / unsafe-eval; Next applies the nonce to framework scripts.
 * Pages that need nonces must render dynamically (see root layout).
 */

import { NextRequest, NextResponse } from 'next/server';

function configuredConnectSources(): string[] {
  const sources = new Set<string>(["'self'"]);
  const candidates = [
    process.env['DAYNORI_API_URL'],
    process.env['NEXT_PUBLIC_API_URL'],
    process.env['SUPABASE_AUTH_URL'],
    process.env['NEXT_PUBLIC_SUPABASE_URL'],
    process.env['NEXT_PUBLIC_STORAGE_URL'],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      sources.add(u.origin);
    } catch {
      // ignore malformed env
    }
  }
  // Local defaults used by the monorepo when env is unset.
  sources.add('http://127.0.0.1:3001');
  sources.add('http://localhost:3001');
  sources.add('http://127.0.0.1:54321');
  sources.add('http://localhost:54321');
  return [...sources];
}

function buildCsp(nonce: string, isProd: boolean, pathname: string): string {
  const connectSrc = configuredConnectSources().join(' ');
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  // React inline style props remain common; keep style unsafe-inline until a style nonce pipeline covers them.
  // Scripts are the XSS-critical vector addressed by this repair.
  const styleSrc = `'self' 'unsafe-inline'`;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}${isProd ? '' : ' ws: wss:'}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob:",
  ];
  if (isProd) {
    directives.push('upgrade-insecure-requests');
  }
  // Vault surfaces: no microphone (audio recorder is ordinary-app only).
  void pathname;
  return directives.join('; ').replace(/\s{2,}/g, ' ').trim();
}

function permissionsPolicyForPath(pathname: string): string {
  const vaultSurface =
    pathname === '/vault' ||
    pathname.startsWith('/vault/') ||
    pathname === '/dev/vault-harness' ||
    pathname.startsWith('/dev/vault-harness/');
  if (vaultSurface) {
    return 'camera=(), microphone=(), geolocation=(), payment=()';
  }
  // Ordinary app may request microphone for authorized audio recording (getUserMedia).
  return 'camera=(), microphone=(self), geolocation=(), payment=()';
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isProd = process.env.NODE_ENV === 'production';
  const csp = buildCsp(nonce, isProd, request.nextUrl.pathname);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', permissionsPolicyForPath(request.nextUrl.pathname));
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|sw.js|offline.html|manifest.json).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
