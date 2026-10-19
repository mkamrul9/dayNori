/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

/**
 * Production CSP for Next.js App Router (Next 15).
 * Development keeps a looser policy for HMR/eval; production forbids unsafe-eval.
 * Successful CSP tests do not substitute for independent security review.
 */
const productionCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  // Next.js requires script hashes/nonces in stricter setups; 'unsafe-inline' retained with note
  // until a nonce pipeline is wired — documented as a residual finding in phase-47 report.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const developmentCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@daynori/design-tokens',
    '@daynori/ui-web',
    '@daynori/contracts',
    '@daynori/sync',
    '@daynori/domain',
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: isProd ? productionCsp : developmentCsp,
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
